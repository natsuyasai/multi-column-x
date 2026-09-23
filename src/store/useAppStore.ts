import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { IPC_COMMANDS } from "../constants/ipc";
import { logError } from "../lib/log";
import type {
  Account,
  ApiRateLimitBucket,
  Column,
  ColumnPreset,
  GlobalSettings,
  LoadSettingsResult,
} from "../types";
import { DEFAULT_GLOBAL_SETTINGS } from "../types";

const SETTINGS_LOAD_FAILED_WITH_BACKUP_MESSAGE = (backupPath: string) =>
  `設定ファイルを読み込めなかったため、初期設定で起動しました。元の設定は次の場所にバックアップしました: ${backupPath}`;
const SETTINGS_LOAD_FAILED_WITHOUT_BACKUP_MESSAGE =
  "設定ファイルを読み込めなかったため、初期設定で起動しました。元の設定のバックアップにも失敗しました。";

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
    // 旧バージョンの保存データには repostHiddenUserIds が無いため空配列で補う
    settings: {
      ...col.settings,
      repostHiddenUserIds: col.settings.repostHiddenUserIds ?? [],
    },
  };
}

interface AppStore {
  accounts: Account[];
  columns: Column[];
  globalSettings: GlobalSettings;
  isLoaded: boolean;
  settingsLoadNotice: string | null;
  dismissSettingsLoadNotice: () => void;
  topBarExpanded: boolean;
  setTopBarExpanded: (v: boolean) => void;
  isMobile: boolean;
  setIsMobile: (v: boolean) => void;
  profileApiSupported: boolean;
  setProfileApiSupported: (v: boolean) => void;
  unreadCounts: Record<string, number>;
  setUnreadCount: (columnId: string, count: number) => void;
  clearUnreadCount: (columnId: string) => void;
  apiRateLimits: Record<string, Record<string, ApiRateLimitBucket>>; // accountId -> bucketKey -> bucket
  setApiRateLimit: (accountId: string, bucket: ApiRateLimitBucket) => void;
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
  addAccount: (account: Account) => void;
  updateAccount: (
    id: string,
    patch: Partial<
      Pick<Account, "label" | "color" | "xUserId" | "dataDirectory">
    >,
  ) => void;
  removeAccount: (id: string) => void;
  addColumn: (column: Column) => void;
  removeColumn: (id: string) => void;
  removeColumnsByAccount: (accountId: string) => void;
  addPendingDataDirectoryDeletion: (dir: string) => void;
  setPendingDataDirectoryDeletions: (dirs: string[]) => void;
  updateColumn: (id: string, patch: Partial<Column>) => void;
  updateGlobalSettings: (patch: Partial<GlobalSettings>) => void;
  replaceColumns: (columns: Column[]) => void;
  savePreset: (name: string) => void;
  loadPreset: (id: string) => void;
  deletePreset: (id: string) => void;
}

// saveSettings の直列化用チェーン。呼び出しごとにこのチェーンへ連結し、
// 前の保存が完了(成功/失敗いずれも)してから次の保存を実行することで、
// 最後に要求された保存が最後に書き込まれることを保証する。
let saveChain: Promise<void> = Promise.resolve();

export const useAppStore = create<AppStore>((set, get) => ({
  accounts: [],
  columns: [],
  globalSettings: DEFAULT_GLOBAL_SETTINGS,
  isLoaded: false,
  settingsLoadNotice: null,
  dismissSettingsLoadNotice: () => set({ settingsLoadNotice: null }),
  topBarExpanded: false,
  setTopBarExpanded: (v) => set({ topBarExpanded: v }),
  isMobile: false,
  setIsMobile: (v) => set({ isMobile: v }),
  profileApiSupported: false,
  setProfileApiSupported: (v) => set({ profileApiSupported: v }),
  unreadCounts: {},
  setUnreadCount: (columnId, count) =>
    set((state) => ({
      unreadCounts: { ...state.unreadCounts, [columnId]: count },
    })),
  clearUnreadCount: (columnId) =>
    set((state) => ({
      unreadCounts: { ...state.unreadCounts, [columnId]: 0 },
    })),
  apiRateLimits: {},
  setApiRateLimit: (accountId, bucket) =>
    set((state) => ({
      apiRateLimits: {
        ...state.apiRateLimits,
        [accountId]: {
          ...state.apiRateLimits[accountId],
          [bucket.bucketKey]: bucket,
        },
      },
    })),

  loadSettings: async () => {
    try {
      const { settings, loadFailed, backupPath } =
        await invoke<LoadSettingsResult>(IPC_COMMANDS.LOAD_SETTINGS);
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
        settingsLoadNotice: loadFailed
          ? backupPath
            ? SETTINGS_LOAD_FAILED_WITH_BACKUP_MESSAGE(backupPath)
            : SETTINGS_LOAD_FAILED_WITHOUT_BACKUP_MESSAGE
          : null,
      });
    } catch {
      set({ isLoaded: true });
    }
  },

  saveSettings: () => {
    // 前の保存の完了を待ってから実行する。状態は実行時点(get())で読むため、
    // 連続して呼ばれても最後に書き込まれるのは最新の状態になる。
    saveChain = saveChain.then(async () => {
      const { accounts, columns, globalSettings } = get();
      await invoke(IPC_COMMANDS.SAVE_SETTINGS, {
        settings: { accounts, columns, globalSettings },
      }).catch(logError("saveSettings"));
    });
    return saveChain;
  },

  addAccount: (account) => {
    set((state) => ({ accounts: [...state.accounts, account] }));
    get().saveSettings();
  },

  updateAccount: (id, patch) => {
    set((state) => ({
      accounts: state.accounts.map((a) =>
        a.id === id ? { ...a, ...patch } : a,
      ),
    }));
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

  removeColumnsByAccount: (accountId) => {
    set((state) => ({
      columns: state.columns.filter((c) => c.accountId !== accountId),
    }));
    get().saveSettings();
  },

  addPendingDataDirectoryDeletion: (dir) => {
    set((state) => {
      if (state.globalSettings.pendingDataDirectoryDeletions.includes(dir)) {
        return state;
      }
      return {
        globalSettings: {
          ...state.globalSettings,
          pendingDataDirectoryDeletions: [
            ...state.globalSettings.pendingDataDirectoryDeletions,
            dir,
          ],
        },
      };
    });
    get().saveSettings();
  },

  setPendingDataDirectoryDeletions: (dirs) => {
    set((state) => ({
      globalSettings: {
        ...state.globalSettings,
        pendingDataDirectoryDeletions: dirs,
      },
    }));
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

  replaceColumns: (columns) => {
    set({ columns });
    get().saveSettings();
  },

  savePreset: (name) => {
    const { columns, globalSettings } = get();
    const preset: ColumnPreset = {
      id: crypto.randomUUID(),
      name,
      columns: columns.map((c) => ({ ...c })),
    };
    const presets = [...globalSettings.presets, preset];
    set((state) => ({
      globalSettings: { ...state.globalSettings, presets },
    }));
    get().saveSettings();
  },

  loadPreset: (id) => {
    const { globalSettings } = get();
    const preset = globalSettings.presets.find((p) => p.id === id);
    if (!preset) return;
    set({ columns: preset.columns.map((c) => ({ ...c })) });
    get().saveSettings();
  },

  deletePreset: (id) => {
    set((state) => ({
      globalSettings: {
        ...state.globalSettings,
        presets: state.globalSettings.presets.filter((p) => p.id !== id),
      },
    }));
    get().saveSettings();
  },
}));
