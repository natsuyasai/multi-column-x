import React from "react";
import type { AppTFunction } from "@/i18n/types";
import {
  getPageTypeLabel,
  type Account,
  type Column,
  type PageType,
} from "@/types";
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

function getPageLabel(column: Column, t: AppTFunction): string {
  // 検索クエリが空でも「検索: 」の形で表示する（getPageTypeLabel とは異なる既存仕様）
  if (column.pageType === "search") {
    return t("columns:pageType.searchWithQuery", {
      query: column.searchQuery ?? "",
    });
  }
  return getPageTypeLabel(column, t);
}

export function columnDisplayName(
  column: Column,
  accounts: Account[],
  t: AppTFunction,
): string {
  if (column.label) return column.label;
  const account = accounts.find((a) => a.id === column.accountId);
  if (account) return `${account.label} - ${getPageLabel(column, t)}`;
  return getPageLabel(column, t);
}
