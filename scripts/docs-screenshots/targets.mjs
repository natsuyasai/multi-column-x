// ガイド用スクリーンショットの撮影対象宣言。
// storyId は storybook-static/index.json に存在するものだけを指定する（capture.mjs が起動時に検証する）。
// 基準はライトテーマ。デスクトップは 1280x720、Android は 390x844。

const DESKTOP = { width: 1280, height: 720 };
const MOBILE = { width: 390, height: 844 };

/**
 * @typedef {{
 *   file: string,
 *   storyId: string,
 *   viewport: { width: number, height: number },
 *   theme?: "light" | "dark",
 *   clip?: "dialog" | { x: number, y: number, width: number, height: number },
 *   clickButtons?: string[],
 * }} Target
 */

/** @type {Target[]} */
export const targets = [
  // デスクトップ
  {
    file: "columns-overview",
    storyId: "components-guidemock-guidecolumns--default",
    viewport: DESKTOP,
    theme: "light",
  },
  {
    file: "topbar-overview",
    storyId: "components-topbar--default",
    viewport: DESKTOP,
    theme: "light",
    clip: { x: 0, y: 0, width: 1280, height: 40 },
  },
  {
    file: "topbar-multirow-expanded",
    storyId: "components-topbar--multi-row-column-expanded",
    viewport: DESKTOP,
    theme: "light",
    clip: { x: 0, y: 0, width: 1280, height: 70 },
  },
  {
    file: "account-manager",
    storyId: "components-accountmanager--default",
    viewport: DESKTOP,
    theme: "light",
    clip: "dialog",
  },
  {
    file: "add-column-dialog",
    storyId: "components-addcolumndialog--default",
    viewport: DESKTOP,
    theme: "light",
    clip: "dialog",
  },
  {
    file: "add-column-external-url",
    storyId: "components-addcolumndialog--external-url",
    viewport: DESKTOP,
    theme: "light",
    clip: "dialog",
  },
  {
    file: "column-header",
    storyId: "components-columnheader--default",
    viewport: DESKTOP,
    theme: "light",
    clip: { x: 0, y: 8, width: 1280, height: 52 },
  },
  {
    file: "column-settings",
    storyId: "components-settingspanel--default",
    viewport: DESKTOP,
    theme: "light",
    clip: "dialog",
  },
  {
    file: "app-settings-general",
    storyId: "components-appsettingspanel--default",
    viewport: DESKTOP,
    theme: "light",
    clip: "dialog",
    clickButtons: ["一般"],
  },
  {
    file: "column-layout-tab",
    storyId: "components-appsettingspanel-columnlayouttab--default",
    viewport: DESKTOP,
    theme: "light",
    clip: { x: 0, y: 0, width: 1280, height: 550 },
  },
  {
    file: "column-layout-stacked",
    storyId: "components-appsettingspanel-columnlayouttab--stacked-columns",
    viewport: DESKTOP,
    theme: "light",
    clip: { x: 0, y: 0, width: 1280, height: 480 },
  },
  {
    file: "presets-tab",
    storyId: "components-appsettingspanel-presetstab--default",
    viewport: DESKTOP,
    theme: "light",
    clip: { x: 0, y: 0, width: 1280, height: 260 },
  },
  {
    file: "link-popup-dialog",
    storyId: "components-linkpopupdialog--default",
    viewport: DESKTOP,
    theme: "light",
    clip: "dialog",
  },
  {
    file: "shortcut-help-dialog",
    storyId: "components-shortcuthelpdialog--default",
    viewport: DESKTOP,
    theme: "light",
    clip: "dialog",
  },
  {
    file: "update-dialog",
    storyId: "components-updatedialog--default",
    viewport: DESKTOP,
    theme: "light",
    clip: "dialog",
  },
  {
    file: "update-dialog-downloading",
    storyId: "components-updatedialog--downloading",
    viewport: DESKTOP,
    theme: "light",
    clip: "dialog",
  },
  // Android（モバイル幅）
  {
    file: "android-tab-bar",
    storyId: "components-mobiletabbar--default",
    viewport: MOBILE,
    theme: "light",
    clip: { x: 0, y: 764, width: 390, height: 80 },
  },
  {
    file: "android-tab-action-dialog",
    storyId: "components-tabactiondialog--default",
    viewport: MOBILE,
    theme: "light",
    clip: { x: 0, y: 540, width: 390, height: 304 },
  },
  {
    file: "android-column-layout-tab",
    storyId: "components-appsettingspanel-columnlayouttab--mobile",
    viewport: MOBILE,
    theme: "light",
    clip: { x: 0, y: 0, width: 390, height: 280 },
  },
];
