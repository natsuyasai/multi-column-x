interface TvAccountInfo {
  id: string;
  label: string;
  color: string;
  dataDirectory: string;
}

declare global {
  interface Window {
    __mcxAccounts?: TvAccountInfo[];
    __mcxCurrentAccountId?: string;
  }
}

export {};
