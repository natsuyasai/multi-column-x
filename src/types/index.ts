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
  customCSS: string;
  visibleLinks: string[];
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
  popupEscCloseEnabled: boolean;
  videoAutoPlayStopEnabled: boolean;
  showSortButtons: boolean;
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
  customCSS: "",
  visibleLinks: [],
};

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  theme: "dark",
  customCSS: "",
  windowBounds: { x: 0, y: 0, width: 1400, height: 900 },
  defaultAutoReloadEnabled: true,
  defaultAutoReloadInterval: 600,
  popupEscCloseEnabled: true,
  videoAutoPlayStopEnabled: false,
  showSortButtons: true,
};

interface ResolveColumnUrlInput {
  pageType: PageType;
  customUrl?: string;
  searchQuery?: string;
  listId?: string;
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
