import React, { useCallback, useEffect, useState } from "react";
import type { ExtensionPageKind } from "@/services/extensions";
import type { DetectResult, ExtensionEntry } from "@/types";
import styles from "./ExtensionsTab.module.scss";

export const ACCOUNT_REQUIRED_TITLE = "アカウントを選択してください";
export const CHROME_NOT_FOUND_NOTICE = "Chrome が見つかりません";
export const MISSING_BADGE_TEXT = "見つかりません";
export const ADDED_BADGE_TEXT = "追加済み";
export const TRUST_NOTICE =
  "追加した拡張機能は、すべてのアカウントの X ページを読み書きできる場合があります。信頼できるものだけを追加してください。";
export const RELOAD_NOTICE =
  "追加・削除・有効無効を変更すると、全カラムが自動で再読込されます。";

interface ExtensionsTabProps {
  /** ポップアップ / オプションを開くアカウント。決まらなければ null */
  accountId: string | null;
  /** 追加・削除・有効無効の変更が成功したとき（全カラムの再読込に使う） */
  onExtensionsChanged: () => void;
  listExtensions: () => Promise<ExtensionEntry[]>;
  detectChromeExtensions: () => Promise<DetectResult>;
  /** フォルダ選択ダイアログ。キャンセルしたら null */
  pickFolder: () => Promise<string | null>;
  addFromFolder: (path: string) => Promise<unknown>;
  addChrome: (chromeId: string) => Promise<unknown>;
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
  openPage: (
    id: string,
    kind: ExtensionPageKind,
    accountId: string,
  ) => Promise<void>;
}

const DETECT_KEY = "detect";
const PICK_KEY = "pick";

function toMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function describeSource(entry: ExtensionEntry): string {
  return entry.source.kind === "folder"
    ? entry.source.path
    : `Chrome（プロファイル: ${entry.source.profile}）`;
}

export const ExtensionsTab: React.FC<ExtensionsTabProps> = ({
  accountId,
  onExtensionsChanged,
  listExtensions,
  detectChromeExtensions,
  pickFolder,
  addFromFolder,
  addChrome,
  setEnabled,
  remove,
  openPage,
}) => {
  const [entries, setEntries] = useState<ExtensionEntry[]>([]);
  const [detected, setDetected] = useState<DetectResult | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setEntries(await listExtensions());
  }, [listExtensions]);

  useEffect(() => {
    let cancelled = false;
    listExtensions().then(
      (items) => {
        if (!cancelled) setEntries(items);
      },
      (e: unknown) => {
        if (!cancelled) setError(toMessage(e));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [listExtensions]);

  const busy = busyKey !== null;

  /** 処理中表示とエラー表示を共通化する。変更系は成功時のみ再読込を通知する */
  const run = async (
    key: string,
    action: () => Promise<void>,
    changed: boolean,
  ) => {
    if (busy) return;
    setBusyKey(key);
    setError(null);
    try {
      await action();
      if (changed) {
        onExtensionsChanged();
        await refresh();
      }
    } catch (e) {
      setError(toMessage(e));
    } finally {
      setBusyKey(null);
    }
  };

  const handleAddFromFolder = () =>
    run(
      PICK_KEY,
      async () => {
        const path = await pickFolder();
        if (path === null) return;
        await addFromFolder(path);
        onExtensionsChanged();
        await refresh();
      },
      false,
    );

  const handleDetect = () =>
    run(
      DETECT_KEY,
      async () => {
        setDetected(await detectChromeExtensions());
      },
      false,
    );

  const handleAddChrome = (chromeId: string) =>
    run(
      `chrome:${chromeId}`,
      async () => {
        await addChrome(chromeId);
        setDetected((prev) =>
          prev
            ? {
                ...prev,
                items: prev.items.map((item) =>
                  item.chromeId === chromeId ? { ...item, added: true } : item,
                ),
              }
            : prev,
        );
      },
      true,
    );

  const handleToggle = (entry: ExtensionEntry, enabled: boolean) =>
    run(`toggle:${entry.id}`, () => setEnabled(entry.id, enabled), true);

  const handleRemove = (entry: ExtensionEntry) =>
    run(`remove:${entry.id}`, () => remove(entry.id), true);

  // ポップアップ / オプションの表示は拡張機能の設定を変えないため、再読込は通知しない
  const handleOpen = (entry: ExtensionEntry, kind: ExtensionPageKind) =>
    run(
      `open:${kind}:${entry.id}`,
      async () => {
        if (accountId === null) return;
        await openPage(entry.id, kind, accountId);
      },
      false,
    );

  return (
    <div className={styles.container} aria-busy={busy}>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>拡張機能を追加</h3>
        <p className={styles.note}>
          展開済みの拡張機能フォルダを指定するか、Chrome
          にインストール済みの拡張機能から選んで、全アカウントに追加します。
        </p>
        <p className={styles.note} role="note">
          {TRUST_NOTICE}
        </p>
        <p className={styles.note}>{RELOAD_NOTICE}</p>
        <div className={styles.buttonRow}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => void handleDetect()}
            disabled={busy}
            aria-busy={busyKey === DETECT_KEY}
            aria-label="Chrome から検出"
          >
            Chrome から検出
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => void handleAddFromFolder()}
            disabled={busy}
            aria-busy={busyKey === PICK_KEY}
            aria-label="フォルダを指定して追加"
          >
            フォルダを指定して追加
          </button>
        </div>
        {error && (
          <p role="alert" className={`${styles.message} ${styles.error}`}>
            {error}
          </p>
        )}
        {detected && !detected.chromeFound && (
          <p role="status" className={`${styles.message} ${styles.warning}`}>
            {CHROME_NOT_FOUND_NOTICE}
          </p>
        )}
        {detected?.chromeFound && (
          <ul className={styles.list} aria-label="Chrome の拡張機能の候補">
            {detected.items.length === 0 && (
              <li className={styles.note}>候補はありません</li>
            )}
            {detected.items.map((item) => (
              <li key={item.chromeId} className={styles.row}>
                <span className={styles.name}>{item.name}</span>
                <span className={styles.meta}>
                  プロファイル: {item.profile}
                </span>
                {item.added && (
                  <span className={styles.badge}>{ADDED_BADGE_TEXT}</span>
                )}
                <button
                  type="button"
                  className={styles.primaryBtn}
                  onClick={() => void handleAddChrome(item.chromeId)}
                  disabled={busy || item.added}
                  aria-busy={busyKey === `chrome:${item.chromeId}`}
                  aria-label={`${item.name} を追加`}
                >
                  追加
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>追加済みの拡張機能</h3>
        {entries.length === 0 ? (
          <p className={styles.note}>追加済みの拡張機能はありません</p>
        ) : (
          <ul className={styles.list} aria-label="追加済みの拡張機能">
            {entries.map((entry) => {
              const pageDisabled =
                busy || !entry.enabled || entry.missing || accountId === null;
              const pageTitle =
                accountId === null ? ACCOUNT_REQUIRED_TITLE : undefined;
              return (
                <li key={entry.id} className={styles.row}>
                  <div className={styles.nameBlock}>
                    <span className={styles.name}>{entry.name}</span>
                    <span className={styles.meta}>{describeSource(entry)}</span>
                  </div>
                  {entry.missing && (
                    <span className={`${styles.badge} ${styles.badgeWarn}`}>
                      {MISSING_BADGE_TEXT}
                    </span>
                  )}
                  <label className={styles.toggle}>
                    <input
                      type="checkbox"
                      checked={entry.enabled}
                      onChange={(e) =>
                        void handleToggle(entry, e.target.checked)
                      }
                      disabled={busy || entry.missing}
                      aria-label={`${entry.name} を有効にする`}
                    />
                    有効
                  </label>
                  {entry.hasPopup && (
                    <button
                      type="button"
                      className={styles.secondaryBtn}
                      onClick={() => void handleOpen(entry, "popup")}
                      disabled={pageDisabled}
                      title={pageTitle}
                      aria-label={`${entry.name} のポップアップを開く`}
                    >
                      ポップアップを開く
                    </button>
                  )}
                  {entry.hasOptions && (
                    <button
                      type="button"
                      className={styles.secondaryBtn}
                      onClick={() => void handleOpen(entry, "options")}
                      disabled={pageDisabled}
                      title={pageTitle}
                      aria-label={`${entry.name} のオプションを開く`}
                    >
                      オプションを開く
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.dangerBtn}
                    onClick={() => void handleRemove(entry)}
                    disabled={busy}
                    aria-busy={busyKey === `remove:${entry.id}`}
                    aria-label={`${entry.name} を削除`}
                  >
                    削除
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};
