//! 同期計画（`Action`）の実行器（OS 非依存）。
//! WebView2 への実呼び出しは `ProfileOps` 越しに行い、並べ替え・replaces の判定・
//! エラー集約を単体テストできるようにする。

use super::reconcile_plan::{Action, InstalledExt};

/// プロファイル（WebView2 の拡張機能 API）に対する操作。
#[allow(async_fn_in_trait)]
pub trait ProfileOps {
    async fn list(&self) -> Result<Vec<InstalledExt>, String>;
    async fn add(&self, path: &str) -> Result<InstalledExt, String>;
    async fn remove(&self, webview_id: &str) -> Result<(), String>;
    async fn set_enabled(&self, webview_id: &str, enabled: bool) -> Result<(), String>;
}

/// `apply_actions` の実行結果。
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ApplyOutcome {
    /// Add か Remove が 1 件でも成功した。
    pub changed: bool,
    /// 追加成功（entry_id, path, 新 webview_id）。
    pub added: Vec<(String, String, String)>,
    /// 削除成功した webview_id（replaces による旧 ID の削除を含む）。
    pub removed: Vec<String>,
    pub errors: Vec<String>,
}

/// 計画を Add → Remove → SetEnabled の順に実行する。1 件失敗しても残りを続行する。
pub async fn apply_actions_with<O: ProfileOps>(ops: &O, actions: &[Action]) -> ApplyOutcome {
    let mut outcome = ApplyOutcome::default();
    let mut installed: Vec<String> = match ops.list().await {
        Ok(list) => list.into_iter().map(|e| e.id).collect(),
        Err(e) => {
            outcome.errors.push(e);
            Vec::new()
        }
    };

    for action in actions {
        let Action::Add {
            entry_id,
            path,
            replaces,
            desired_enabled,
        } = action
        else {
            continue;
        };
        let added = match ops.add(path).await {
            Ok(ext) => ext,
            Err(e) => {
                outcome.errors.push(e);
                continue;
            }
        };
        outcome.changed = true;
        installed.push(added.id.clone());
        outcome
            .added
            .push((entry_id.clone(), path.clone(), added.id.clone()));

        if let Some(old) = replaces.as_ref().filter(|old| **old != added.id) {
            if installed.contains(old) {
                remove_one(ops, old, &mut installed, &mut outcome).await;
            }
        }
        if added.enabled != *desired_enabled {
            if let Err(e) = ops.set_enabled(&added.id, *desired_enabled).await {
                outcome.errors.push(e);
            }
        }
    }
    for action in actions {
        if let Action::Remove { webview_id } = action {
            remove_one(ops, webview_id, &mut installed, &mut outcome).await;
        }
    }
    for action in actions {
        if let Action::SetEnabled {
            webview_id,
            enabled,
        } = action
        {
            if let Err(e) = ops.set_enabled(webview_id, *enabled).await {
                outcome.errors.push(e);
            }
        }
    }
    outcome
}

async fn remove_one<O: ProfileOps>(
    ops: &O,
    webview_id: &str,
    installed: &mut Vec<String>,
    outcome: &mut ApplyOutcome,
) {
    match ops.remove(webview_id).await {
        Ok(()) => {
            outcome.changed = true;
            outcome.removed.push(webview_id.to_string());
            installed.retain(|id| id != webview_id);
        }
        Err(e) => outcome.errors.push(e),
    }
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;
    use std::collections::{HashMap, HashSet};

    use super::*;

    /// 呼び出しを記録するモック。
    #[derive(Default)]
    struct Mock {
        installed: Vec<InstalledExt>,
        /// path -> 追加後に返す ID。未登録の path は失敗する。
        add_ids: HashMap<String, String>,
        fail_remove: HashSet<String>,
        fail_set_enabled: HashSet<String>,
        calls: RefCell<Vec<String>>,
    }

    impl Mock {
        fn calls(&self) -> Vec<String> {
            self.calls.borrow().clone()
        }
    }

    impl ProfileOps for Mock {
        async fn list(&self) -> Result<Vec<InstalledExt>, String> {
            self.calls.borrow_mut().push("list".into());
            Ok(self.installed.clone())
        }
        async fn add(&self, path: &str) -> Result<InstalledExt, String> {
            self.calls.borrow_mut().push(format!("add:{path}"));
            match self.add_ids.get(path) {
                Some(id) => Ok(InstalledExt {
                    id: id.clone(),
                    enabled: true,
                }),
                None => Err(format!("add失敗:{path}")),
            }
        }
        async fn remove(&self, id: &str) -> Result<(), String> {
            self.calls.borrow_mut().push(format!("remove:{id}"));
            if self.fail_remove.contains(id) {
                Err(format!("remove失敗:{id}"))
            } else {
                Ok(())
            }
        }
        async fn set_enabled(&self, id: &str, enabled: bool) -> Result<(), String> {
            self.calls
                .borrow_mut()
                .push(format!("enable:{id}:{enabled}"));
            if self.fail_set_enabled.contains(id) {
                Err(format!("enable失敗:{id}"))
            } else {
                Ok(())
            }
        }
    }

    fn ext(id: &str, enabled: bool) -> InstalledExt {
        InstalledExt {
            id: id.into(),
            enabled,
        }
    }

    fn add(entry: &str, path: &str, replaces: Option<&str>, desired: bool) -> Action {
        Action::Add {
            entry_id: entry.into(),
            path: path.into(),
            replaces: replaces.map(String::from),
            desired_enabled: desired,
        }
    }

    fn mock_with_adds(adds: &[(&str, &str)], installed: Vec<InstalledExt>) -> Mock {
        Mock {
            installed,
            add_ids: adds
                .iter()
                .map(|(p, i)| (p.to_string(), i.to_string()))
                .collect(),
            ..Default::default()
        }
    }

    #[tokio::test]
    async fn addが先でremoveとset_enabledが後に実行される() {
        let ops = mock_with_adds(
            &[("/a", "new-a")],
            vec![ext("old-x", true), ext("e1", true)],
        );
        let actions = vec![
            Action::SetEnabled {
                webview_id: "e1".into(),
                enabled: false,
            },
            Action::Remove {
                webview_id: "old-x".into(),
            },
            add("a", "/a", None, true),
        ];
        let outcome = apply_actions_with(&ops, &actions).await;
        let calls = ops.calls();
        assert_eq!(
            &calls[1..],
            ["add:/a", "remove:old-x", "enable:e1:false"],
            "calls={calls:?}"
        );
        assert_eq!(
            outcome.added,
            vec![("a".to_string(), "/a".to_string(), "new-a".to_string())]
        );
        assert_eq!(outcome.removed, vec!["old-x".to_string()]);
        assert!(outcome.errors.is_empty());
    }

    #[tokio::test]
    async fn replacesは新idと異なり旧idがinstalledにある場合だけremoveされる() {
        let ops = mock_with_adds(&[("/a", "new-a")], vec![ext("old-a", true)]);
        let outcome = apply_actions_with(&ops, &[add("a", "/a", Some("old-a"), true)]).await;
        assert_eq!(ops.calls(), ["list", "add:/a", "remove:old-a"]);
        assert_eq!(outcome.removed, vec!["old-a".to_string()]);
        assert!(outcome.changed);
    }

    #[tokio::test]
    async fn replacesが新idと同一ならremoveしない() {
        let ops = mock_with_adds(&[("/a", "same")], vec![ext("same", true)]);
        let outcome = apply_actions_with(&ops, &[add("a", "/a", Some("same"), true)]).await;
        assert_eq!(ops.calls(), ["list", "add:/a"]);
        assert!(outcome.removed.is_empty());
    }

    #[tokio::test]
    async fn replacesの旧idがinstalledに無ければremoveしない() {
        let ops = mock_with_adds(&[("/a", "new-a")], vec![ext("other", true)]);
        let outcome = apply_actions_with(&ops, &[add("a", "/a", Some("gone"), true)]).await;
        assert_eq!(ops.calls(), ["list", "add:/a"]);
        assert!(outcome.removed.is_empty());
    }

    #[tokio::test]
    async fn 一件失敗しても残りを続行しエラーを集約する() {
        let mut ops = mock_with_adds(&[("/ok", "new-ok")], vec![ext("r1", true), ext("r2", true)]);
        ops.fail_remove.insert("r1".into());
        let actions = vec![
            add("bad", "/bad", None, true),
            add("ok", "/ok", None, true),
            Action::Remove {
                webview_id: "r1".into(),
            },
            Action::Remove {
                webview_id: "r2".into(),
            },
            Action::SetEnabled {
                webview_id: "missing".into(),
                enabled: true,
            },
        ];
        let outcome = apply_actions_with(&ops, &actions).await;
        assert_eq!(outcome.errors, ["add失敗:/bad", "remove失敗:r1"]);
        assert_eq!(outcome.added.len(), 1);
        assert_eq!(outcome.removed, vec!["r2".to_string()]);
        assert!(outcome.changed);
        assert!(ops.calls().contains(&"enable:missing:true".to_string()));
    }

    #[tokio::test]
    async fn add後にdesired_enabledがfalseならset_enabledのfalseが呼ばれる() {
        let ops = mock_with_adds(&[("/a", "new-a")], vec![]);
        let outcome = apply_actions_with(&ops, &[add("a", "/a", None, false)]).await;
        assert_eq!(ops.calls(), ["list", "add:/a", "enable:new-a:false"]);
        assert!(outcome.errors.is_empty());
    }

    #[tokio::test]
    async fn add後にdesired_enabledがtrueで既に有効なら有効化を呼ばない() {
        let ops = mock_with_adds(&[("/a", "new-a")], vec![]);
        apply_actions_with(&ops, &[add("a", "/a", None, true)]).await;
        assert_eq!(ops.calls(), ["list", "add:/a"]);
    }

    #[tokio::test]
    async fn set_enabledだけ成功してもchangedはfalseのまま() {
        let ops = Mock {
            installed: vec![ext("e1", true)],
            ..Default::default()
        };
        let actions = [Action::SetEnabled {
            webview_id: "e1".into(),
            enabled: false,
        }];
        let outcome = apply_actions_with(&ops, &actions).await;
        assert!(!outcome.changed);
        assert!(outcome.errors.is_empty());
    }

    #[tokio::test]
    async fn addもremoveも失敗したらchangedはfalse() {
        let mut ops = Mock::default();
        ops.fail_remove.insert("r".into());
        let actions = [
            add("bad", "/bad", None, true),
            Action::Remove {
                webview_id: "r".into(),
            },
        ];
        let outcome = apply_actions_with(&ops, &actions).await;
        assert!(!outcome.changed);
        assert_eq!(outcome.errors.len(), 2);
    }

    #[tokio::test]
    async fn 一覧取得に失敗したらエラーを記録して計画は続行する() {
        struct ListFail;
        impl ProfileOps for ListFail {
            async fn list(&self) -> Result<Vec<InstalledExt>, String> {
                Err("list失敗".into())
            }
            async fn add(&self, _: &str) -> Result<InstalledExt, String> {
                Ok(InstalledExt {
                    id: "n".into(),
                    enabled: true,
                })
            }
            async fn remove(&self, _: &str) -> Result<(), String> {
                Ok(())
            }
            async fn set_enabled(&self, _: &str, _: bool) -> Result<(), String> {
                Ok(())
            }
        }
        let outcome = apply_actions_with(&ListFail, &[add("a", "/a", None, true)]).await;
        assert_eq!(outcome.errors, ["list失敗"]);
        assert_eq!(outcome.added.len(), 1);
    }

    #[tokio::test]
    async fn addが成功すればchangedはtrueになる() {
        let ops = mock_with_adds(&[("/a", "new-a")], vec![]);
        let outcome = apply_actions_with(&ops, &[add("a", "/a", None, true)]).await;
        assert!(outcome.changed);
    }
}
