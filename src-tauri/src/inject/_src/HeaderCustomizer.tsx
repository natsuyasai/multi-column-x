import { useSyncExternalStore } from "react";
import { useHeaderCustomizer } from "./useHeaderCustomizer";
import styles from "./HeaderCustomizer.module.scss";

// 画面文言は共有ハブ window.__mcxI18n（i18n.ts）経由で取得する。ハブ未ロード時はキー文字列を返す。
function tr(key: string): string {
  return window.__mcxI18n?.t(key) ?? key;
}

// 表示言語の変更（setLang）で再描画させるための購読。ハブ未ロード時は何もしない。
function subscribeLang(callback: () => void): () => void {
  return window.__mcxI18n?.onChange(callback) ?? (() => {});
}

function getLang(): string {
  return window.__mcxI18n?.lang ?? "ja";
}

export function HeaderCustomizer() {
  const {
    navLinks,
    isNavVisible,
    toggleNavVisibility,
    toggleTweetInputArea,
    composeButtonRef,
    isTweetInputVisible,
  } = useHeaderCustomizer();
  // 言語が切り替わったら再描画する（戻り値自体は使わない）
  useSyncExternalStore(subscribeLang, getLang);

  if (!(window.__multiColumnXConfig?.showCustomMenu ?? true)) {
    return null;
  }

  return (
    <div className={styles.navContainer}>
      {/* トグルボタン */}
      <button
        type="button"
        className={styles.toggleButton}
        onClick={toggleNavVisibility}
        title={tr(
          isNavVisible ? "header.toggleNav.hide" : "header.toggleNav.show",
        )}
      >
        {isNavVisible ? "×" : "☰"}
      </button>

      {/* カスタムナビゲーションバー */}
      <div
        className={`${styles.customNavBar} ${!isNavVisible ? styles.hidden : ""}`}
      >
        {navLinks.map((linkData) => {
          const isComposeButton = linkData.href === "/compose/post";

          return (
            <a
              key={linkData.href}
              ref={isComposeButton ? composeButtonRef : null}
              href={linkData.href}
              className={styles.navLink}
              aria-label={
                isComposeButton && isTweetInputVisible
                  ? tr("header.close")
                  : linkData.label
              }
              dangerouslySetInnerHTML={{ __html: linkData.svgContent }}
              onClick={(e) => {
                if (isComposeButton) {
                  e.preventDefault();
                  toggleTweetInputArea();
                }
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
