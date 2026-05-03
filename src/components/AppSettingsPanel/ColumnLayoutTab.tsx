import React from "react";
import type { Column } from "../../types";

interface ColumnLayoutTabProps {
  columns: Column[];
  onApply: (columns: Column[]) => void;
  onCancel: () => void;
}

export const ColumnLayoutTab: React.FC<ColumnLayoutTabProps> = ({
  onCancel,
}) => {
  return (
    <div style={{ padding: 20, color: "#666" }}>
      カラム配置設定（実装予定）
      <br />
      <button onClick={onCancel}>閉じる</button>
    </div>
  );
};
