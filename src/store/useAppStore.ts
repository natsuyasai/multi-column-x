import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { Account, Column, GlobalSettings, AppSettings } from '../types';
import { DEFAULT_GLOBAL_SETTINGS } from '../types';

interface AppStore {
  accounts: Account[];
  columns: Column[];
  globalSettings: GlobalSettings;
  isLoaded: boolean;
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
  addAccount: (account: Account) => void;
  removeAccount: (id: string) => void;
  addColumn: (column: Column) => void;
  removeColumn: (id: string) => void;
  updateColumn: (id: string, patch: Partial<Column>) => void;
  updateGlobalSettings: (patch: Partial<GlobalSettings>) => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  accounts: [],
  columns: [],
  globalSettings: DEFAULT_GLOBAL_SETTINGS,
  isLoaded: false,

  loadSettings: async () => {
    try {
      const settings = await invoke<AppSettings>('load_settings');
      set({
        accounts: settings.accounts,
        columns: settings.columns.sort((a, b) => a.order - b.order),
        globalSettings: settings.globalSettings,
        isLoaded: true,
      });
    } catch {
      set({ isLoaded: true });
    }
  },

  saveSettings: async () => {
    const { accounts, columns, globalSettings } = get();
    await invoke('save_settings', { settings: { accounts, columns, globalSettings } });
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
}));
