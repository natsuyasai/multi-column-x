// TS/Rust デフォルト設定のドリフト検出。
// Rust 側の対応テスト: src-tauri/src/commands/settings.rs の default_settings_match_contract_fixture
// デフォルト値を変更したら contracts/default-settings.json を再生成すること。
import { describe, it, expect } from "vitest";
import { DEFAULT_GLOBAL_SETTINGS } from "./index";
import fixture from "../../contracts/default-settings.json";

describe("TS/Rust デフォルト設定の契約", () => {
  it("DEFAULT_GLOBAL_SETTINGSがRust側Defaultと一致する", () => {
    // defaultAccountId は Rust では Option::None（JSON null）、TS ではキー省略で表現する。
    // この表現差のみ許容し、残りのフィールドは構造ごと比較する。
    const { defaultAccountId, ...expected } = fixture.globalSettings;
    expect(defaultAccountId).toBeNull();
    expect(DEFAULT_GLOBAL_SETTINGS).toEqual(expected);
  });

  it("fixtureのaccounts/columnsは空配列である", () => {
    expect(fixture.accounts).toEqual([]);
    expect(fixture.columns).toEqual([]);
  });
});
