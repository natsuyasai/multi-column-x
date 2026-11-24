import { getCurrentWebview } from "@tauri-apps/api/webview";

/**
 * アプリ本体（メイン）WebView へキーボードフォーカスを移す。
 * カラム WebView（別 WebView）が OS フォーカスを持っていると、DOM の focus() では
 * ダイアログへフォーカスが移らず Tab / Esc が効かないため、WebView ごと移す。
 * 前面化はしない（他アプリから前面を奪わない）。
 */
export async function focusMainWebview(): Promise<void> {
  await getCurrentWebview().setFocus();
}
