import React from "react";
import styles from "./NoAccountsPrompt.module.scss";

interface NoAccountsPromptProps {
  onOpenAccountManager: () => void;
}

// アカウント未登録のままカラム追加を開いたときに、アカウント管理へ誘導する案内
export const NoAccountsPrompt: React.FC<NoAccountsPromptProps> = ({
  onOpenAccountManager,
}) => (
  <div className={styles.prompt}>
    <p>先にアカウントを追加してください</p>
    <button onClick={onOpenAccountManager}>アカウント管理を開く</button>
  </div>
);
