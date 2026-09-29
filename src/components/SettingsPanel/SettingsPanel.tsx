import React, { useState } from "react";
import { isAutoReloadSupported } from "@/lib/autoReloadTarget";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import {
  COLUMN_LABEL_MAX_LENGTH,
  normalizeColumnLabel,
  type Column,
  type ColumnSettings,
} from "../../types";
import { HelpPopover } from "../HelpPopover/HelpPopover";
import { nextLineListErrors, validateLineListInputs } from "./lineListInputs";
import styles from "./SettingsPanel.module.scss";

interface SettingsPanelProps {
  column: Column;
  onApply: (
    columnId: string,
    settings: ColumnSettings,
    width: number,
    label: string | undefined,
  ) => void;
  onClose: () => void;
  onReload?: (columnId: string) => void;
  isMobile: boolean;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  column,
  onApply,
  onClose,
  onReload,
  isMobile,
}) => {
  useEscapeKey(onClose);

  const isExternal = column.pageType === "external";

  const [settings, setSettings] = useState<ColumnSettings>({
    ...column.settings,
  });
  const [width, setWidth] = useState<number>(column.width);
  const [labelText, setLabelText] = useState<string>(column.label ?? "");
  const [lineListTexts, setLineListTexts] = useState({
    ngWords: (column.settings.ngWords ?? []).join("\n"),
    repostHiddenUserIds: (column.settings.repostHiddenUserIds ?? []).join("\n"),
    whitelistWords: (column.settings.whitelistWords ?? []).join("\n"),
  });
  const [lineListErrors, setLineListErrors] = useState({
    ngWords: null as string | null,
    repostHiddenUserIds: null as string | null,
    whitelistWords: null as string | null,
  });

  const updateSetting = <K extends keyof ColumnSettings>(
    key: K,
    value: ColumnSettings[K],
  ) => setSettings((s) => ({ ...s, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateLineListInputs(lineListTexts);
    setLineListErrors((prev) => nextLineListErrors(prev, result));
    if (result.kind === "invalid") {
      return;
    }

    onApply(
      column.id,
      { ...settings, ...result.values },
      width,
      normalizeColumnLabel(labelText),
    );
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2 className={styles.title}>カラム設定</h2>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>カラム</h3>
            <label className={styles.fieldLabelBlock}>
              表示名
              <input
                type="text"
                className={styles.labelInput}
                value={labelText}
                onChange={(e) => setLabelText(e.target.value)}
                maxLength={COLUMN_LABEL_MAX_LENGTH}
                placeholder="未指定の場合は既定の表示名"
              />
            </label>
            {!isMobile && (
              <label className={styles.fieldLabel}>
                幅（px）
                <input
                  type="number"
                  className={styles.numberInput}
                  min={200}
                  max={1200}
                  value={width}
                  onChange={(e) => setWidth(Number(e.target.value))}
                />
              </label>
            )}
          </section>

          {isAutoReloadSupported(column) && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>自動更新</h3>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={settings.autoReloadEnabled}
                  onChange={(e) =>
                    updateSetting("autoReloadEnabled", e.target.checked)
                  }
                />
                自動更新を有効にする
              </label>
              {settings.autoReloadEnabled && (
                <>
                  <label className={styles.fieldLabel}>
                    更新間隔（秒）
                    <input
                      type="number"
                      className={styles.numberInput}
                      min={10}
                      max={3600}
                      value={settings.autoReloadInterval}
                      onChange={(e) =>
                        updateSetting(
                          "autoReloadInterval",
                          Number(e.target.value),
                        )
                      }
                    />
                  </label>
                  <label className={styles.checkLabel}>
                    <input
                      type="checkbox"
                      checked={settings.showCountdown}
                      onChange={(e) =>
                        updateSetting("showCountdown", e.target.checked)
                      }
                    />
                    カウントダウンを表示する
                  </label>
                </>
              )}
            </section>
          )}

          {!isExternal && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>表示</h3>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={settings.hideHeaderEnabled}
                  onChange={(e) =>
                    updateSetting("hideHeaderEnabled", e.target.checked)
                  }
                />
                ヘッダーを非表示にする
              </label>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={settings.hideTweetInputEnabled}
                  onChange={(e) =>
                    updateSetting("hideTweetInputEnabled", e.target.checked)
                  }
                />
                投稿欄を非表示にする
              </label>
              {settings.hideHeaderEnabled && (
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={settings.showCustomMenu}
                    onChange={(e) =>
                      updateSetting("showCustomMenu", e.target.checked)
                    }
                  />
                  カスタムメニューボタンを表示する
                </label>
              )}
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={settings.scrollPosRestoreEnabled}
                  onChange={(e) =>
                    updateSetting("scrollPosRestoreEnabled", e.target.checked)
                  }
                />
                写真閲覧後のスクロール位置を復元する
              </label>
              {column.pageType === "home" && (
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={settings.returnToLastReadEnabled}
                    onChange={(e) =>
                      updateSetting("returnToLastReadEnabled", e.target.checked)
                    }
                  />
                  更新後に前回の続きへ戻るボタンを表示する
                </label>
              )}
            </section>
          )}

          {!isExternal && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>画像</h3>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={settings.smallImageEnabled}
                  onChange={(e) =>
                    updateSetting("smallImageEnabled", e.target.checked)
                  }
                />
                画像を縮小表示する
              </label>
              {settings.smallImageEnabled && (
                <label className={styles.fieldLabel}>
                  幅（例: 50%, 200px）
                  <input
                    type="text"
                    className={styles.numberInput}
                    value={settings.smallImageWidth}
                    onChange={(e) =>
                      updateSetting("smallImageWidth", e.target.value)
                    }
                    placeholder="50%"
                  />
                </label>
              )}
            </section>
          )}

          {!isExternal && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>画像ブラー</h3>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={settings.blurImageEnabled}
                  onChange={(e) =>
                    updateSetting("blurImageEnabled", e.target.checked)
                  }
                />
                画像をぼかして表示する
              </label>
              {settings.blurImageEnabled && (
                <label className={styles.fieldLabel}>
                  ブラー量（例: 10px）
                  <input
                    type="text"
                    className={styles.textInput}
                    value={settings.blurImageAmount}
                    onChange={(e) =>
                      updateSetting("blurImageAmount", e.target.value)
                    }
                    placeholder="10px"
                  />
                </label>
              )}
              <p className={styles.fieldLabel}>
                右クリック（PC）または長押し（モバイル）でブラーを解除できます
              </p>
            </section>
          )}

          {!isExternal && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>通知</h3>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={settings.desktopNotifyEnabled ?? false}
                  onChange={(e) =>
                    updateSetting("desktopNotifyEnabled", e.target.checked)
                  }
                />
                新着をデスクトップ通知する
              </label>
            </section>
          )}

          {!isExternal && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>
                NGワード
                <HelpPopover label="NGワードの書き方">
                  <p>1行に1ワードを入力してください。</p>
                  <p>
                    <code>/pattern/flags</code>{" "}
                    の形式で入力すると正規表現として扱われます（大文字・小文字は区別しません）。
                  </p>
                  <p>例: {"/spam|広告/"}</p>
                </HelpPopover>
              </h3>
              <textarea
                className={styles.cssTextarea}
                value={lineListTexts.ngWords}
                onChange={(e) =>
                  setLineListTexts((t) => ({ ...t, ngWords: e.target.value }))
                }
                placeholder="1行に1ワードで入力（/正規表現/flags 形式も指定可）"
                spellCheck={false}
              />
              {lineListErrors.ngWords && (
                <p className={styles.errorText}>{lineListErrors.ngWords}</p>
              )}
            </section>
          )}

          {!isExternal && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>
                リポストを非表示にするユーザー
              </h3>
              <textarea
                className={styles.cssTextarea}
                value={lineListTexts.repostHiddenUserIds}
                onChange={(e) =>
                  setLineListTexts((t) => ({
                    ...t,
                    repostHiddenUserIds: e.target.value,
                  }))
                }
                aria-label="リポストを非表示にするユーザー"
                placeholder="1行に1ユーザーIDで入力"
                spellCheck={false}
              />
              {lineListErrors.repostHiddenUserIds && (
                <p className={styles.errorText}>
                  {lineListErrors.repostHiddenUserIds}
                </p>
              )}
              <p className={styles.hint}>
                1行に1ユーザーID（@以降）。指定ユーザーがリポストした投稿を非表示にします
              </p>
            </section>
          )}

          {!isExternal && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>
                ホワイトリスト
                <HelpPopover label="ホワイトリストの書き方">
                  <p>
                    指定したワードを含むツイートのみを表示します（NGワードとは逆の効果です）。
                  </p>
                  <p>1行に1ワードを入力してください。</p>
                  <p>
                    <code>/pattern/flags</code>{" "}
                    の形式で入力すると正規表現として扱われます（大文字・小文字は区別しません）。
                  </p>
                </HelpPopover>
              </h3>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={settings.whitelistEnabled}
                  onChange={(e) =>
                    updateSetting("whitelistEnabled", e.target.checked)
                  }
                />
                ホワイトリストを有効にする
              </label>
              <textarea
                className={styles.cssTextarea}
                value={lineListTexts.whitelistWords}
                onChange={(e) =>
                  setLineListTexts((t) => ({
                    ...t,
                    whitelistWords: e.target.value,
                  }))
                }
                placeholder="1行に1ワードで入力（/正規表現/flags 形式も指定可、ホワイトリスト）"
                spellCheck={false}
                disabled={!settings.whitelistEnabled}
              />
              {lineListErrors.whitelistWords && (
                <p className={styles.errorText}>
                  {lineListErrors.whitelistWords}
                </p>
              )}
            </section>
          )}

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>カスタム CSS</h3>
            <textarea
              className={styles.cssTextarea}
              value={settings.customCSS}
              onChange={(e) => updateSetting("customCSS", e.target.value)}
              placeholder="/* カスタムCSSを入力 */"
              spellCheck={false}
            />
          </section>

          <div className={styles.actions}>
            {onReload && (
              <button
                type="button"
                className={styles.reloadBtn}
                onClick={() => {
                  onClose();
                  onReload(column.id);
                }}
              >
                再読み込み
              </button>
            )}
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
            >
              キャンセル
            </button>
            <button type="submit" className={styles.applyBtn}>
              適用
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
