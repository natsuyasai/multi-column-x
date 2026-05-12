export type PageType = "home" | "notifications" | "search" | "list" | "custom";

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
  zoomLevel: number;
}

export interface AppSettings {
  accounts: Account[];
  columns: Column[];
  globalSettings: GlobalSettings;
}

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
};

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  theme: "dark",
  customCSS: "",
  windowBounds: { x: 0, y: 0, width: 1400, height: 900 },
  defaultAutoReloadEnabled: true,
  defaultAutoReloadInterval: 600,
  defaultShowCountdown: true,
  defaultAreaRemoveEnabled: true,
  defaultShowCustomMenu: false,
  defaultScrollPosRestoreEnabled: true,
  defaultColumnCustomCSS: "",
  popupEscCloseEnabled: true,
  videoAutoPlayStopEnabled: false,
  showSortButtons: true,
  smallImageEnabled: false,
  smallImageWidth: "50%",
  blurImageEnabled: false,
  blurImageAmount: "10px",
  hideAdEnabled: false,
  zoomLevel: 1,
};

interface ResolveColumnUrlInput {
  pageType: PageType;
  customUrl?: string;
  searchQuery?: string;
  listId?: string;
}

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

export function resolveColumnUrl(input: ResolveColumnUrlInput): string {
  switch (input.pageType) {
    case "home":
      return "https://x.com/home";
    case "notifications":
      return "https://x.com/notifications";
    case "search":
      return `https://x.com/search?q=${encodeURIComponent(input.searchQuery ?? "")}`;
    case "list":
      return `https://x.com/i/lists/${input.listId ?? ""}`;
    case "custom":
      return input.customUrl ?? "https://x.com/home";
  }
}
