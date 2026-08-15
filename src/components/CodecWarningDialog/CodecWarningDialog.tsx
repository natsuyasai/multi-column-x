import React from "react";
import styles from "./CodecWarningDialog.module.scss";

interface Props {
  missingH264: boolean;
  missingAac: boolean;
  onClose: () => void;
}

export const CodecWarningDialog: React.FC<Props> = ({
  missingH264,
  missingAac,
  onClose,
}) => {
  return (
    <div className={styles.overlay}>
      <div className={styles.dialog} role="dialog" aria-modal="true">
        <h2 className={styles.title}>
          動画/音声を再生できない可能性があります
        </h2>
        <ul className={styles.missingList}>
          {missingH264 && <li>H.264 (動画) のデコーダが見つかりません</li>}
          {missingAac && <li>AAC (音声) のデコーダが見つかりません</li>}
        </ul>
        <p className={styles.description}>
          お使いの環境に必要なコーデックが不足しているため、動画または音声が正しく再生できない場合があります。以下のコマンドを実行して、不足しているパッケージをインストールしてください。
        </p>
        <div className={styles.commands}>
          <div className={styles.commandItem}>
            <p className={styles.commandLabel}>Debian/Ubuntu系</p>
            <code className={styles.commandCode}>
              sudo apt install gstreamer1.0-plugins-bad gstreamer1.0-libav
            </code>
          </div>
          <div className={styles.commandItem}>
            <p className={styles.commandLabel}>Fedora系</p>
            <code className={styles.commandCode}>
              sudo dnf install gstreamer1-plugins-bad-free gstreamer1-libav
            </code>
          </div>
          <div className={styles.commandItem}>
            <p className={styles.commandLabel}>Arch系</p>
            <code className={styles.commandCode}>
              sudo pacman -S gst-plugins-bad gst-libav
            </code>
          </div>
        </div>
        <p className={styles.note}>
          インストール後、アプリを再起動すると解消されているか自動で再チェックされます。解消するまで、この警告は次回起動時にも表示されます。
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="閉じる"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
