interface TvAccountInfo {
  id: string;
  label: string;
  color: string;
  dataDirectory: string;
}

declare global {
  interface Window {
    __tvAccountList?: TvAccountInfo[];
    __tvAccounts?: TvAccountInfo[];
    __tvCurrentAccountId?: string;
  }
}

export {};
