export type PageType = "home" | "notifications" | "search" | "list" | "custom";
export type ColumnScale = "small" | "default" | "normal" | "large" | "xLarge";

export interface Account {
  id: string;
  label: string;
  dataDirectory: string;
  color: string;
  createdAt: string;
}

export interface ColumnSettings {
  autoReloadEnabled: boolean;
  autoReloadInterval: number; // 秒
  showCountdown: boolean;
  areaRemoveEnabled: boolean;
  showCustomMenu: boolean;
  scrollPosRestoreEnabled: boolean;
  customCSS: string;
  visibleLinks: string[];
  smallImageEnabled: boolean;
  smallImageWidth: string;
  blurImageEnabled: boolean;
  blurImageAmount: string;
  ngWords: string[];
}

export interface Column {
  id: string;
  accountId: string;
  pageType: PageType;
  customUrl?: string;
  homeTabName?: string;
  searchQuery?: string;
  listId?: string;
  width: number;
  order: number;
  label?: string;
  settings: ColumnSettings;
  gridRow: number;
  gridCol: number;
  heightMode: "auto" | "fixed";
  heightValue?: number;
  heightUnit?: "px" | "%";
}

export interface GlobalSettings {
  theme: "dark" | "light";
  customCSS: string;
  windowBounds: { x: number; y: number; width: number; height: number };
  defaultAccountId?: string;
  defaultAutoReloadEnabled: boolean;
  defaultAutoReloadInterval: number; // 秒
  defaultShowCountdown: boolean;
  defaultAreaRemoveEnabled: boolean;
  defaultShowCustomMenu: boolean;
  defaultScrollPosRestoreEnabled: boolean;
  defaultColumnCustomCSS: string;
  popupEscCloseEnabled: boolean;
  videoAutoPlayStopEnabled: boolean;
  showSortButtons: boolean;
  smallImageEnabled: boolean;
  smallImageWidth: string;
  blurImageEnabled: boolean;
  blurImageAmount: string;
  hideAdEnabled: boolean;
  columnScale: ColumnScale;
  useXAppForCompose: boolean;
  presets: ColumnPreset[];
  ngWords: string[];
}

export interface ColumnPreset {
  id: string;
  name: string;
  columns: Column[];
}

export interface AppSettings {
  accounts: Account[];
  columns: Column[];
  globalSettings: GlobalSettings;
}

/**
 * カラム設定のデフォルト値。
 *
 * NOTE: Rust 側にも同等のデフォルト値が定義されている。
 *   src-tauri/src/commands/settings.rs の ColumnSettings 構造体に付与された
 *   #[serde(default)] / #[serde(default = "default_xxx")] アトリビュートおよび
 *   default_* ヘルパー関数がそれにあたる。
 *
 * ここの値を変更するときは Rust 側の対応箇所も必ず合わせること。
 *
 * フィールド対応表:
 * | TS フィールド            | Rust フィールド             | デフォルト値 |
 * |-------------------------|-----------------------------|-------------|
 * | autoReloadEnabled       | auto_reload_enabled         | true        |
 * | autoReloadInterval      | auto_reload_interval        | 600         |
 * | showCountdown           | show_countdown              | true        |
 * | areaRemoveEnabled       | area_remove_enabled         | true        |
 * | showCustomMenu          | show_custom_menu            | false       |
 * | scrollPosRestoreEnabled | scroll_pos_restore_enabled  | true        |
 * | customCSS               | custom_css                  | ""          |
 * | visibleLinks            | visible_links               | []          |
 * | smallImageEnabled       | small_image_enabled         | false       |
 * | smallImageWidth         | small_image_width           | "50%"       |
 * | blurImageEnabled        | blur_image_enabled          | false       |
 * | blurImageAmount         | blur_image_amount           | "10px"      |
 */
export const DEFAULT_COLUMN_SETTINGS: ColumnSettings = {
  autoReloadEnabled: true,
  autoReloadInterval: 600,
  showCountdown: true,
  areaRemoveEnabled: true,
  showCustomMenu: false,
  scrollPosRestoreEnabled: true,
  customCSS: "",
  visibleLinks: [],
  smallImageEnabled: false,
  smallImageWidth: "50%",
  blurImageEnabled: false,
  blurImageAmount: "10px",
  ngWords: [],
};

/**
 * グローバル設定のデフォルト値。
 *
 * NOTE: Rust 側にも同等のデフォルト値が定義されている。
 *   src-tauri/src/commands/settings.rs の GlobalSettingsData の
 *   impl Default および #[serde(default)] アトリビュートがそれにあたる。
 *
 * ここの値を変更するときは Rust 側の対応箇所も必ず合わせること。
 *
 * フィールド対応表:
 * | TS フィールド                    | Rust フィールド                     | デフォルト値          |
 * |--------------------------------|-------------------------------------|---------------------|
 * | theme                          | theme                               | "dark"              |
 * | customCSS                      | custom_css                          | ""                  |
 * | windowBounds                   | window_bounds                       | x:0,y:0,w:1400,h:900|
 * | defaultAutoReloadEnabled       | default_auto_reload_enabled         | true                |
 * | defaultAutoReloadInterval      | default_auto_reload_interval        | 600                 |
 * | defaultShowCountdown           | default_show_countdown              | true                |
 * | defaultAreaRemoveEnabled       | default_area_remove_enabled         | true                |
 * | defaultShowCustomMenu          | default_show_custom_menu            | false               |
 * | defaultScrollPosRestoreEnabled | default_scroll_pos_restore_enabled  | false               |
 * | defaultColumnCustomCSS         | default_column_custom_css           | ""                  |
 * | popupEscCloseEnabled           | popup_esc_close_enabled             | true                |
 * | videoAutoPlayStopEnabled       | video_auto_play_stop_enabled        | true                |
 * | showSortButtons                | show_sort_buttons                   | false               |
 * | smallImageEnabled              | small_image_enabled                 | false               |
 * | smallImageWidth                | small_image_width                   | "50%"               |
 * | blurImageEnabled               | blur_image_enabled                  | false               |
 * | blurImageAmount                | blur_image_amount                   | "10px"              |
 * | hideAdEnabled                  | hide_ad_enabled                     | true                |
 * | zoomLevel                      | zoom_level                          | 1                   |
 * | useXAppForCompose              | use_x_app_for_compose               | false               |
 */
export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  theme: "dark",
  customCSS: "",
  windowBounds: { x: 0, y: 0, width: 1400, height: 900 },
  defaultAutoReloadEnabled: true,
  defaultAutoReloadInterval: 600,
  defaultShowCountdown: true,
  defaultAreaRemoveEnabled: true,
  defaultShowCustomMenu: false,
  defaultScrollPosRestoreEnabled: false,
  defaultColumnCustomCSS: "",
  popupEscCloseEnabled: true,
  videoAutoPlayStopEnabled: true,
  showSortButtons: false,
  smallImageEnabled: false,
  smallImageWidth: "50%",
  blurImageEnabled: false,
  blurImageAmount: "10px",
  hideAdEnabled: true,
  columnScale: "default",
  useXAppForCompose: false,
  presets: [],
  ngWords: [],
};

interface GetPageTypeLabelInput {
  pageType: PageType;
  homeTabName?: string;
  searchQuery?: string;
}

export function getPageTypeLabel(input: GetPageTypeLabelInput): string {
  switch (input.pageType) {
    case "home":
      return input.homeTabName ?? "ホーム";
    case "notifications":
      return "通知";
    case "search":
      return input.searchQuery ? `検索: ${input.searchQuery}` : "検索";
    case "list":
      return "リスト";
    case "custom":
      return "カスタム";
  }
}

export function getColumnLabel(column: Column): string {
  return column.label ?? getPageTypeLabel(column);
}
