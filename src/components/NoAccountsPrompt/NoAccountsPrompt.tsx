import React from "react";
import { useTranslation } from "react-i18next";
import styles from "./NoAccountsPrompt.module.scss";

interface NoAccountsPromptProps {
  onOpenAccountManager: () => void;
}

// アカウント未登録のままカラム追加を開いたときに、アカウント管理へ誘導する案内
export const NoAccountsPrompt: React.FC<NoAccountsPromptProps> = ({
  onOpenAccountManager,
}) => {
  const { t } = useTranslation();
  return (
    <div className={styles.prompt}>
      <p>{t("accounts:noAccounts.message")}</p>
      <button onClick={onOpenAccountManager}>
        {t("accounts:noAccounts.openManager")}
      </button>
    </div>
  );
};
