import React, { useState } from "react";
import type { Column, ColumnSettings } from "../../types";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import styles from "./SettingsPanel.module.scss";

interface SettingsPanelProps {
  column: Column;
  onApply: (columnId: string, settings: ColumnSettings, width: number) => void;
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

  const [settings, setSettings] = useState<ColumnSettings>({
    ...column.settings,
  });
  const [width, setWidth] = useState<number>(column.width);
  const [ngWordsText, setNgWordsText] = useState<string>(
    (column.settings.ngWords ?? []).join("\n"),
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ngWords = ngWordsText
      .split("\n")
      .map((w) => w.trim())
      .filter((w) => w.length > 0);
    onApply(column.id, { ...settings, ngWords }, width);
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
          {!isMobile && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>カラム</h3>
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
            </section>
          )}

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>自動更新</h3>
            <label className={styles.checkLabel}>
              <input
                type="checkbox"
                checked={settings.autoReloadEnabled}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    autoReloadEnabled: e.target.checked,
                  }))
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
                      setSettings((s) => ({
                        ...s,
                        autoReloadInterval: Number(e.target.value),
                      }))
                    }
                  />
                </label>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={settings.showCountdown}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        showCountdown: e.target.checked,
                      }))
                    }
                  />
                  カウントダウンを表示する
                </label>
              </>
            )}
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>表示</h3>
            <label className={styles.checkLabel}>
              <input
                type="checkbox"
                checked={settings.areaRemoveEnabled}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    areaRemoveEnabled: e.target.checked,
                  }))
                }
              />
              ヘッダー・投稿欄を非表示にする
            </label>
            {settings.areaRemoveEnabled && (
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={settings.showCustomMenu}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      showCustomMenu: e.target.checked,
                    }))
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
                  setSettings((s) => ({
                    ...s,
                    scrollPosRestoreEnabled: e.target.checked,
                  }))
                }
              />
              写真閲覧後のスクロール位置を復元する
            </label>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>画像</h3>
            <label className={styles.checkLabel}>
              <input
                type="checkbox"
                checked={settings.smallImageEnabled}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    smallImageEnabled: e.target.checked,
                  }))
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
                    setSettings((s) => ({
                      ...s,
                      smallImageWidth: e.target.value,
                    }))
                  }
                  placeholder="50%"
                />
              </label>
            )}
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>画像ブラー</h3>
            <label className={styles.checkLabel}>
              <input
                type="checkbox"
                checked={settings.blurImageEnabled}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    blurImageEnabled: e.target.checked,
                  }))
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
                    setSettings((s) => ({
                      ...s,
                      blurImageAmount: e.target.value,
                    }))
                  }
                  placeholder="10px"
                />
              </label>
            )}
            <p className={styles.fieldLabel}>
              右クリック（PC）または長押し（モバイル）でブラーを解除できます
            </p>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>NGワード</h3>
            <textarea
              className={styles.cssTextarea}
              value={ngWordsText}
              onChange={(e) => setNgWordsText(e.target.value)}
              placeholder="1行に1ワードで入力"
              spellCheck={false}
            />
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>カスタム CSS</h3>
            <textarea
              className={styles.cssTextarea}
              value={settings.customCSS}
              onChange={(e) =>
                setSettings((s) => ({ ...s, customCSS: e.target.value }))
              }
              placeholder="/* カスタムCSSを入力 */"
              spellCheck={false}
            />
          </section>

          <div className={styles.actions}>
            {onReload && (
              <button
                type="button"
                className={styles.reloadBtn}
                onClick={() => onReload(column.id)}
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
