import React from "react";
import type { AppUpdate } from "../../services/updater";
import styles from "./UpdateDialog.module.scss";

interface Props {
  update: AppUpdate;
  installing: boolean;
  onInstall: () => void;
  onLater: () => void;
}

export const UpdateDialog: React.FC<Props> = ({
  update,
  installing,
  onInstall,
  onLater,
}) => {
  return (
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        <h2 className={styles.title}>新しいバージョンがあります</h2>
        <p className={styles.version}>バージョン {update.version}</p>
        {update.notes && <pre className={styles.notes}>{update.notes}</pre>}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.laterBtn}
            onClick={onLater}
            disabled={installing}
          >
            後で
          </button>
          <button
            type="button"
            className={styles.installBtn}
            onClick={onInstall}
            disabled={installing}
          >
            {installing ? "更新中..." : "更新する"}
          </button>
        </div>
      </div>
    </div>
  );
};
