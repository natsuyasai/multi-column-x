import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { Account, Column, GlobalSettings, AppSettings } from "../types";
import { DEFAULT_GLOBAL_SETTINGS } from "../types";

export function migrateColumn(
  col: Partial<Column> &
    Pick<
      Column,
      "id" | "accountId" | "pageType" | "width" | "order" | "settings"
    >,
): Column {
  const gridCol =
    col.gridCol != null && col.gridCol >= 1
      ? col.gridCol
      : (col.order ?? 0) + 1;
  const gridRow = col.gridRow != null && col.gridRow >= 1 ? col.gridRow : 1;
  return {
    heightMode: "auto" as const,
    ...col,
    gridRow,
    gridCol,
  };
}

interface AppStore {
  accounts: Account[];
  columns: Column[];
  globalSettings: GlobalSettings;
  isLoaded: boolean;
  sidebarExpanded: boolean;
  setSidebarExpanded: (v: boolean) => void;
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
  addAccount: (account: Account) => void;
  removeAccount: (id: string) => void;
  addColumn: (column: Column) => void;
  removeColumn: (id: string) => void;
  updateColumn: (id: string, patch: Partial<Column>) => void;
  updateGlobalSettings: (patch: Partial<GlobalSettings>) => void;
  moveColumn: (columnId: string, direction: "left" | "right") => void;
  replaceColumns: (columns: Column[]) => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  accounts: [],
  columns: [],
  globalSettings: DEFAULT_GLOBAL_SETTINGS,
  isLoaded: false,
  sidebarExpanded: false,
  setSidebarExpanded: (v) => set({ sidebarExpanded: v }),

  loadSettings: async () => {
    try {
      const settings = await invoke<AppSettings>("load_settings");
      set({
        accounts: settings.accounts,
        columns: settings.columns
          .map(migrateColumn)
          .sort((a, b) => a.order - b.order),
        globalSettings: {
          ...DEFAULT_GLOBAL_SETTINGS,
          ...settings.globalSettings,
        },
        isLoaded: true,
      });
    } catch {
      set({ isLoaded: true });
    }
  },

  saveSettings: async () => {
    const { accounts, columns, globalSettings } = get();
    await invoke("save_settings", {
      settings: { accounts, columns, globalSettings },
    });
  },

  addAccount: (account) => {
    set((state) => ({ accounts: [...state.accounts, account] }));
    get().saveSettings();
  },

  removeAccount: (id) => {
    set((state) => ({ accounts: state.accounts.filter((a) => a.id !== id) }));
    get().saveSettings();
  },

  addColumn: (column) => {
    set((state) => ({ columns: [...state.columns, column] }));
    get().saveSettings();
  },

  removeColumn: (id) => {
    set((state) => ({ columns: state.columns.filter((c) => c.id !== id) }));
    get().saveSettings();
  },

  updateColumn: (id, patch) => {
    set((state) => ({
      columns: state.columns.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
    get().saveSettings();
  },

  updateGlobalSettings: (patch) => {
    set((state) => ({ globalSettings: { ...state.globalSettings, ...patch } }));
    get().saveSettings();
  },

  moveColumn: (columnId, direction) => {
    set((state) => {
      const sorted = [...state.columns].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex((c) => c.id === columnId);
      const neighborIdx = direction === "left" ? idx - 1 : idx + 1;
      if (neighborIdx < 0 || neighborIdx >= sorted.length) return state;
      [sorted[idx], sorted[neighborIdx]] = [sorted[neighborIdx], sorted[idx]];
      const reordered = sorted.map((c, i) => ({ ...c, order: i }));
      return { columns: reordered };
    });
    get().saveSettings();
  },

  replaceColumns: (columns) => {
    set({ columns });
    get().saveSettings();
  },
}));
