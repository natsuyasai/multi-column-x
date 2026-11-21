import React, { useId } from "react";
import { useTranslation } from "react-i18next";
import styles from "./NoAccountsPrompt.module.scss";

interface NoAccountsPromptProps {
  onOpenAccountManager: () => void;
}

// アカウント未登録のままカラム追加を開いたときに、アカウント管理へ誘導する案内。
// 背景を覆わない非モーダルのカードなので dialog ではなく、案内文を名前にした region として公開する
export const NoAccountsPrompt: React.FC<NoAccountsPromptProps> = ({
  onOpenAccountManager,
}) => {
  const { t } = useTranslation();
  const messageId = useId();
  return (
    <div className={styles.prompt} role="region" aria-labelledby={messageId}>
      <p id={messageId}>{t("accounts:noAccounts.message")}</p>
      <button
        type="button"
        className={styles.openBtn}
        onClick={onOpenAccountManager}
      >
        {t("accounts:noAccounts.openManager")}
      </button>
    </div>
  );
};
