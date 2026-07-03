import { useState } from "react";

export interface DialogState {
  showAddColumn: boolean;
  setShowAddColumn: (v: boolean) => void;
  showAccountManager: boolean;
  setShowAccountManager: (v: boolean) => void;
  showAppSettings: boolean;
  setShowAppSettings: (v: boolean) => void;
  settingsColumnId: string | null;
  setSettingsColumnId: (id: string | null) => void;
  showLinkPopupDialog: boolean;
  setShowLinkPopupDialog: (v: boolean) => void;
  tabActionColumnId: string | null;
  setTabActionColumnId: (id: string | null) => void;
  showShortcutHelp: boolean;
  setShowShortcutHelp: (v: boolean) => void;
  dialogOpen: boolean;
}

export function useDialogState(): DialogState {
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [showAccountManager, setShowAccountManager] = useState(false);
  const [showAppSettings, setShowAppSettings] = useState(false);
  const [settingsColumnId, setSettingsColumnId] = useState<string | null>(null);
  const [showLinkPopupDialog, setShowLinkPopupDialog] = useState(false);
  const [tabActionColumnId, setTabActionColumnId] = useState<string | null>(
    null,
  );
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);

  const dialogOpen =
    showAddColumn ||
    showAccountManager ||
    showAppSettings ||
    !!settingsColumnId ||
    showLinkPopupDialog ||
    !!tabActionColumnId ||
    showShortcutHelp;

  return {
    showAddColumn,
    setShowAddColumn,
    showAccountManager,
    setShowAccountManager,
    showAppSettings,
    setShowAppSettings,
    settingsColumnId,
    setSettingsColumnId,
    showLinkPopupDialog,
    setShowLinkPopupDialog,
    tabActionColumnId,
    setTabActionColumnId,
    showShortcutHelp,
    setShowShortcutHelp,
    dialogOpen,
  };
}
