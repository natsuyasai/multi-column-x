import { useHeaderCustomizer } from "./useHeaderCustomizer";
import styles from "./HeaderCustomizer.module.scss";

export function HeaderCustomizer() {
  const {
    navLinks,
    isNavVisible,
    toggleNavVisibility,
    toggleTweetInputArea,
    composeButtonRef,
  } = useHeaderCustomizer();

  return (
    <div className={styles.navContainer}>
      {/* トグルボタン */}
      <button
        type="button"
        className={styles.toggleButton}
        onClick={toggleNavVisibility}
        title={isNavVisible ? "ナビゲーションを非表示" : "ナビゲーションを表示"}
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
              aria-label={linkData.ariaLabel}
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
