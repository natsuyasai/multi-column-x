interface TvAccountInfo {
  id: string;
  label: string;
  color: string;
}

declare global {
  interface Window {
    __mcxAccounts?: TvAccountInfo[];
    __mcxCurrentAccountId?: string;
  }
}

export {};
