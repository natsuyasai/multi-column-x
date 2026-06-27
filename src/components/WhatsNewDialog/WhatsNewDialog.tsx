import React from "react";
import styles from "./WhatsNewDialog.module.scss";

interface Props {
  version?: string;
  notes: string;
  onClose: () => void;
}

type Segment =
  | { type: "heading"; text: string }
  | { type: "list"; items: string[] }
  | { type: "paragraph"; text: string };

function parseNotes(notes: string): Segment[] {
  const lines = notes.split("\n");
  const segments: Segment[] = [];

  for (const line of lines) {
    if (/^#{2,3} /.test(line)) {
      segments.push({ type: "heading", text: line.replace(/^#{2,3} /, "") });
    } else if (/^[-*] /.test(line)) {
      const last = segments[segments.length - 1];
      if (last?.type === "list") {
        last.items.push(line.replace(/^[-*] /, ""));
      } else {
        segments.push({ type: "list", items: [line.replace(/^[-*] /, "")] });
      }
    } else if (line.trim() !== "") {
      segments.push({ type: "paragraph", text: line });
    }
    // 空行は無視
  }

  return segments;
}

function renderNotes(notes: string): React.ReactNode {
  const segments = parseNotes(notes);
  return segments.map((seg, i) => {
    switch (seg.type) {
      case "heading":
        return <h3 key={i}>{seg.text}</h3>;
      case "list":
        return (
          <ul key={i}>
            {seg.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        );
      case "paragraph":
        return <p key={i}>{seg.text}</p>;
    }
  });
}

export const WhatsNewDialog: React.FC<Props> = ({
  version,
  notes,
  onClose,
}) => {
  return (
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        <h2 className={styles.title}>アプリが更新されました</h2>
        {version && (
          <p className={styles.version}>バージョン {version} の更新内容</p>
        )}
        {notes && <div className={styles.notes}>{renderNotes(notes)}</div>}
        <div className={styles.actions}>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
