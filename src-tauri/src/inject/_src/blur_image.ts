(function () {
  const config = window.__multiColumnXConfig;
  if (!config?.blurImageEnabled) return;
  const BLUR_AMOUNT = config.blurImageAmount || "10px";

  const unblurredKeys = new Set<string>();
  const processed = new WeakSet<Element>();

  function getBlurTarget(root: HTMLElement): HTMLElement | null {
    const candidates = root.querySelectorAll<HTMLElement>("div");
    for (const div of Array.from(candidates)) {
      if (!div.style.backgroundImage.includes("url(")) continue;
      const siblings = div.parentElement
        ? Array.from(div.parentElement.children)
        : [];
      if (siblings.some((el) => el !== div && el.tagName === "IMG")) {
        return div;
      }
    }
    return null;
  }

  function getTargetKey(target: HTMLElement): string {
    return target.style.backgroundImage;
  }

  function applyBlur(target: HTMLElement): void {
    target.style.filter = `blur(${BLUR_AMOUNT})`;
  }

  function removeBlur(target: HTMLElement): void {
    target.style.filter = "";
    const key = getTargetKey(target);
    if (key) unblurredKeys.add(key);
  }

  function toggleBlur(root: HTMLElement): void {
    const target = getBlurTarget(root);
    if (!target) return;
    const key = getTargetKey(target);
    if (key && unblurredKeys.has(key)) {
      applyBlur(target);
      unblurredKeys.delete(key);
    } else {
      removeBlur(target);
    }
  }

  function attachInteraction(root: HTMLElement): void {
    root.querySelectorAll("img").forEach((img) => {
      img.draggable = false;
      img.addEventListener("dragstart", (e) => e.preventDefault());
    });
    root.addEventListener("dragstart", (e) => e.preventDefault());
    root.addEventListener("contextmenu", (e) => e.preventDefault());

    let mouseLongPressTimer: ReturnType<typeof setTimeout> | null = null;
    let mouseLongPressFired = false;
    root.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      mouseLongPressFired = false;
      mouseLongPressTimer = setTimeout(() => {
        toggleBlur(root);
        mouseLongPressFired = true;
        mouseLongPressTimer = null;
      }, 500);
    });
    const cancelMouseLongPress = () => {
      if (mouseLongPressTimer !== null) {
        clearTimeout(mouseLongPressTimer);
        mouseLongPressTimer = null;
      }
    };
    root.addEventListener("mouseup", (e) => {
      if (e.button !== 0) return;
      if (mouseLongPressFired) {
        e.preventDefault();
        e.stopPropagation();
        mouseLongPressFired = false;
      }
      cancelMouseLongPress();
    });
    root.addEventListener("mouseleave", cancelMouseLongPress);

    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    let longPressFired = false;
    let startX = 0;
    let startY = 0;
    root.addEventListener(
      "touchstart",
      (e) => {
        longPressFired = false;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        longPressTimer = setTimeout(() => {
          toggleBlur(root);
          longPressFired = true;
          longPressTimer = null;
        }, 500);
      },
      { passive: true },
    );
    const cancelLongPress = () => {
      if (longPressTimer !== null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };
    root.addEventListener("touchend", () => {
      if (longPressFired) {
        // touchend.preventDefault() は passive な touchstart の後では
        // Android WebView のジェスチャー追跡を壊す場合があるため使わない。
        // 代わりに capture フェーズで click を一度だけ吸収する。
        root.addEventListener(
          "click",
          (e) => {
            e.stopImmediatePropagation();
            e.preventDefault();
          },
          { once: true, capture: true },
        );
        longPressFired = false;
      }
      cancelLongPress();
    });
    // touchcancel: Android の長押し検出自体が ~500ms で touchcancel を発火するため
    // cancelLongPress() を呼ぶとタイマーが正規の長押し判定前にキャンセルされてしまう。
    // スワイプは touchmove の 10px 判定で保護されているため、ここはフラグのリセットのみ行う。
    root.addEventListener("touchcancel", () => {
      longPressFired = false;
    });
    root.addEventListener(
      "touchmove",
      (e) => {
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;
        if (Math.sqrt(dx * dx + dy * dy) > 10) {
          cancelLongPress();
        }
      },
      { passive: true },
    );
  }

  function setBlurImage(): void {
    const images = document.body.querySelectorAll(
      "div[data-testid='tweetPhoto']",
    );
    images.forEach((image) => {
      const target = getBlurTarget(image as HTMLElement);
      if (!target) return;
      const key = getTargetKey(target);
      if (key && unblurredKeys.has(key)) return;
      if (!processed.has(image)) {
        processed.add(image);
        attachInteraction(image as HTMLElement);
      }
      applyBlur(target);
    });
  }

  function observeDOMChanges(): void {
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          setBlurImage();
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  function setup(): void {
    setBlurImage();
    observeDOMChanges();
  }

  if (document.body) {
    setup();
  } else {
    document.addEventListener("DOMContentLoaded", setup);
  }
})();
