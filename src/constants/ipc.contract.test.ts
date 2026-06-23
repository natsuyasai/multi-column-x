// TS/Rust IPC 定数のドリフト検出。
// Rust 側の対応テスト: src-tauri/src/ipc_constants.rs の tests モジュール
// （イベント名・ラベル・グローバル変数名の一致と、コマンド名の lib.rs 登録を検証する）。
// 定数を変更したら contracts/ipc-constants.json も合わせて更新すること。
import { describe, it, expect } from "vitest";
import fixture from "../../contracts/ipc-constants.json";
import { INJECT_COMMANDS } from "../../src-tauri/src/inject/_src/constants";
import {
  IPC_COMMANDS,
  IPC_EVENTS,
  WEBVIEW_LABELS,
  WEBVIEW_SCRIPTS,
} from "./ipc";

describe("TS/Rust IPC定数の契約", () => {
  it("IPC_COMMANDSの全コマンド名がfixtureと一致する", () => {
    expect(Object.values(IPC_COMMANDS).sort()).toEqual(
      [...fixture.commands].sort(),
    );
  });

  it("IPC_EVENTSがfixtureのイベント名と一致する", () => {
    expect({ ...IPC_EVENTS }).toEqual(fixture.events);
  });

  it("WEBVIEW_LABELSのプレフィックスがfixtureと一致する", () => {
    // MAIN は Rust 側のみで使用するラベルのため TS 側には定義しない。
    const { MAIN: _main, ...prefixes } = fixture.labels;
    expect({
      COLUMN_PREFIX: WEBVIEW_LABELS.COLUMN_PREFIX,
      POPUP_PREFIX: WEBVIEW_LABELS.POPUP_PREFIX,
      COMPOSE_PREFIX: WEBVIEW_LABELS.COMPOSE_PREFIX,
      ADD_ACCOUNT_PREFIX: WEBVIEW_LABELS.ADD_ACCOUNT_PREFIX,
    }).toEqual(prefixes);
  });

  it("WEBVIEW_SCRIPTSはfixtureのグローバル変数名を参照している", () => {
    expect(WEBVIEW_SCRIPTS.TRIGGER_RELOAD).toContain(
      `window.${fixture.globals.MULTI_COLUMN_X}`,
    );
    expect(WEBVIEW_SCRIPTS.applyNgWords([], [])).toContain(
      `window.${fixture.globals.MULTI_COLUMN_X_CONFIG}`,
    );
  });

  it("inject側INJECT_COMMANDSはIPC_COMMANDS（fixture）の部分集合である", () => {
    for (const cmd of Object.values(INJECT_COMMANDS)) {
      expect(fixture.commands).toContain(cmd);
    }
  });
});
