import React from "react";
import type { Account, Column, PageType } from "@/types";
import CustomIcon from "../../assets/icons/custom.svg?react";
import HomeIcon from "../../assets/icons/home.svg?react";
import LinkIcon from "../../assets/icons/link.svg?react";
import ListIcon from "../../assets/icons/list.svg?react";
import NotificationsIcon from "../../assets/icons/notifications.svg?react";
import PencilIcon from "../../assets/icons/pencil.svg?react";
import SearchIcon from "../../assets/icons/search.svg?react";

export function getColumnIcon(pageType: PageType): React.ReactElement {
  const props = {
    width: 16,
    height: 16,
    "data-testid": `icon-${pageType}`,
  } as const;
  switch (pageType) {
    case "home":
      return <HomeIcon {...props} />;
    case "notifications":
      return <NotificationsIcon {...props} />;
    case "search":
      return <SearchIcon {...props} />;
    case "list":
      return <ListIcon {...props} />;
    case "custom":
      return <CustomIcon {...props} />;
    case "external":
      return <LinkIcon {...props} />;
    case "compose":
      return <PencilIcon {...props} />;
  }
}

function getPageLabel(column: Column): string {
  switch (column.pageType) {
    case "home":
      return column.homeTabName ?? "ホーム";
    case "notifications":
      return "通知";
    case "search":
      return `検索: ${column.searchQuery ?? ""}`;
    case "list":
      return "リスト";
    case "custom":
      return "カスタム";
    case "external":
      if (!column.customUrl) return "外部サイト";
      try {
        return `外部: ${new URL(column.customUrl).hostname}`;
      } catch {
        return "外部サイト";
      }
    case "compose":
      return "投稿";
  }
}

export function columnDisplayName(column: Column, accounts: Account[]): string {
  if (column.label) return column.label;
  const account = accounts.find((a) => a.id === column.accountId);
  if (account) return `${account.label} - ${getPageLabel(column)}`;
  return getPageLabel(column);
}
