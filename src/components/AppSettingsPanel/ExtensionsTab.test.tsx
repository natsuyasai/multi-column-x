import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExtensionsTab } from "@/components/AppSettingsPanel/ExtensionsTab";
import i18n from "@/i18n";
import { expectNoJapanese } from "@/test-utils/japanese";
import type { DetectResult, ExtensionEntry } from "@/types";

function entry(overrides: Partial<ExtensionEntry> = {}): ExtensionEntry {
  return {
    id: "e1",
    name: "拡張A",
    source: { kind: "folder", path: "C:\\ext\\a" },
    enabled: true,
    hasPopup: true,
    hasOptions: true,
    missing: false,
    ...overrides,
  };
}

type Props = React.ComponentProps<typeof ExtensionsTab>;

function setup(overrides: Partial<Props> = {}, initial: ExtensionEntry[] = []) {
  // 一覧は呼び出しごとに最新の状態を返す（変更後の再取得を再現する）
  let current = initial;
  const props: Props = {
    accountId: "acc-1",
    onExtensionsChanged: vi.fn(),
    listExtensions: vi.fn(async () => current),
    detectChromeExtensions: vi.fn(
      async (): Promise<DetectResult> => ({ browserFound: true, items: [] }),
    ),
    pickFolder: vi.fn(async () => "C:\\ext\\new"),
    addFromFolder: vi.fn(async () => {
      current = [...current, entry({ id: "e-new", name: "新しい拡張" })];
      return current[current.length - 1];
    }),
    addChrome: vi.fn(async () => undefined),
    setEnabled: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    openPage: vi.fn(async () => undefined),
    ...overrides,
  };
  const user = userEvent.setup();
  render(<ExtensionsTab {...props} />);
  return { props, user, setCurrent: (e: ExtensionEntry[]) => (current = e) };
}

describe("ExtensionsTab", () => {
  it("追加セクションに信頼できる拡張機能だけを追加する旨の注意が表示される", () => {
    setup();

    expect(
      screen.getByText(
        "追加した拡張機能は、すべてのアカウントの X ページを読み書きできる場合があります。信頼できるものだけを追加してください。",
      ),
    ).toBeInTheDocument();
  });

  it("一部の拡張機能が正しく動作しない場合がある旨の注意が表示される", () => {
    setup();

    expect(
      screen.getByText(i18n.t("settings:extensions.unsupportedNotice")),
    ).toBeInTheDocument();
  });

  it("展開済みの拡張機能フォルダを指定すると全アカウントに追加される", async () => {
    const { props, user } = setup();

    await user.click(
      screen.getByRole("button", { name: "フォルダを指定して追加" }),
    );

    await waitFor(() => {
      expect(props.addFromFolder).toHaveBeenCalledWith("C:\\ext\\new");
    });
    expect(await screen.findByText("新しい拡張")).toBeInTheDocument();
    expect(props.onExtensionsChanged).toHaveBeenCalledTimes(1);
  });

  it("フォルダ選択をキャンセルしても何も追加されず再読込もされない", async () => {
    const { props, user } = setup({ pickFolder: vi.fn(async () => null) });

    await user.click(
      screen.getByRole("button", { name: "フォルダを指定して追加" }),
    );

    await waitFor(() => expect(props.pickFolder).toHaveBeenCalled());
    expect(props.addFromFolder).not.toHaveBeenCalled();
    expect(props.onExtensionsChanged).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("manifestが無いフォルダを指定すると追加されずエラーが表示される", async () => {
    const { props, user } = setup({
      addFromFolder: vi.fn(async () => {
        throw "manifest.json が見つかりません";
      }),
    });

    await user.click(
      screen.getByRole("button", { name: "フォルダを指定して追加" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "manifest.json が見つかりません",
    );
    expect(props.onExtensionsChanged).not.toHaveBeenCalled();
    expect(screen.queryByText("新しい拡張")).not.toBeInTheDocument();
  });

  it("ChromeまたはEdgeにインストール済みの拡張機能が候補として一覧表示される", async () => {
    const { user } = setup({
      detectChromeExtensions: vi.fn(async () => ({
        browserFound: true,
        items: [
          {
            chromeId: "aaa",
            profile: "Default",
            browser: "chrome" as const,
            name: "候補1",
            path: "C:\\chrome\\aaa",
            hasPopup: true,
            hasOptions: false,
            added: false,
          },
          {
            chromeId: "bbb",
            profile: "Default",
            browser: "chrome" as const,
            name: "候補2",
            path: "C:\\chrome\\bbb",
            hasPopup: false,
            hasOptions: true,
            added: false,
          },
        ],
      })),
    });

    await user.click(screen.getByRole("button", { name: "ブラウザから検出" }));

    expect(await screen.findByText("候補1")).toBeInTheDocument();
    expect(screen.getByText("候補2")).toBeInTheDocument();
  });

  it("ChromeもEdgeも見つからないときは検出できない旨が表示される", async () => {
    const { user } = setup({
      detectChromeExtensions: vi.fn(async () => ({
        browserFound: false,
        items: [
          {
            chromeId: "aaa",
            profile: "Default",
            browser: "chrome" as const,
            name: "出てはいけない候補",
            path: "p",
            hasPopup: false,
            hasOptions: false,
            added: false,
          },
        ],
      })),
    });

    await user.click(screen.getByRole("button", { name: "ブラウザから検出" }));

    expect(
      await screen.findByText(i18n.t("settings:extensions.browserNotFound")),
    ).toBeInTheDocument();
    expect(screen.queryByText("出てはいけない候補")).not.toBeInTheDocument();
  });

  it("検出ボタンで検出した候補にプロファイルとともに由来ブラウザ名が表示される", async () => {
    const { user } = setup({
      detectChromeExtensions: vi.fn(
        async (): Promise<DetectResult> => ({
          browserFound: true,
          items: [
            {
              chromeId: "aaa",
              profile: "Default",
              browser: "edge",
              name: "Edge候補",
              path: "p",
              hasPopup: false,
              hasOptions: false,
              added: false,
            },
            {
              chromeId: "bbb",
              profile: "Default",
              browser: "chrome",
              name: "Chrome候補",
              path: "p",
              hasPopup: false,
              hasOptions: false,
              added: false,
            },
          ],
        }),
      ),
    });

    await user.click(screen.getByRole("button", { name: "ブラウザから検出" }));

    const edgeRow = (await screen.findByText("Edge候補")).closest("li");
    const chromeRow = screen.getByText("Chrome候補").closest("li");
    expect(edgeRow).toHaveTextContent("Edge");
    expect(edgeRow).toHaveTextContent("Default");
    expect(edgeRow).not.toHaveTextContent("Chrome");
    expect(chromeRow).toHaveTextContent("Chrome");
    expect(chromeRow).toHaveTextContent("Default");
    expect(chromeRow).not.toHaveTextContent("Edge");
  });

  it("Edge由来で追加済みの拡張機能は取得元にEdgeと表示される", async () => {
    setup({}, [
      entry({
        source: {
          kind: "chrome",
          chromeId: "aaa",
          profile: "Default",
          browser: "edge",
        },
      }),
    ]);

    expect(
      await screen.findByText("Edge（プロファイル: Default）"),
    ).toBeInTheDocument();
  });

  it("ブラウザ未指定の旧データで追加済みの拡張機能は取得元にChromeと表示される", async () => {
    setup({}, [
      entry({
        source: { kind: "chrome", chromeId: "aaa", profile: "Default" },
      }),
    ]);

    expect(
      await screen.findByText("Chrome（プロファイル: Default）"),
    ).toBeInTheDocument();
  });

  it("追加セクションにユーザーデータの保存先パスの案内が表示される", () => {
    setup();

    const text = document.body.textContent ?? "";
    expect(text).toContain(
      "%LOCALAPPDATA%\\{組織名}\\{ブラウザ名}\\User Data\\Default\\Extensions\\<拡張ID>\\<バージョン>",
    );
    expect(text).toContain("組織名のフォルダが無いブラウザもあります");
    expect(text).toContain(
      "%LOCALAPPDATA%\\Google\\Chrome\\User Data\\Default\\Extensions",
    );
    expect(text).toContain(
      "%LOCALAPPDATA%\\Microsoft\\Edge\\User Data\\Default\\Extensions",
    );
    expect(text).toContain("Brave など他のブラウザ");
    expect(text).toContain("「フォルダを指定して追加」で指定してください");
    expect(text).toContain("ユーザーデータの場所を変更している場合");
  });

  it("候補から選んだ拡張機能が全アカウントに追加される", async () => {
    const { props, user } = setup({
      detectChromeExtensions: vi.fn(async () => ({
        browserFound: true,
        items: [
          {
            chromeId: "aaa",
            profile: "Default",
            browser: "chrome" as const,
            name: "候補1",
            path: "p",
            hasPopup: false,
            hasOptions: false,
            added: false,
          },
        ],
      })),
    });
    await user.click(screen.getByRole("button", { name: "ブラウザから検出" }));

    await user.click(
      await screen.findByRole("button", { name: "候補1 を追加" }),
    );

    await waitFor(() => expect(props.addChrome).toHaveBeenCalledWith("aaa"));
    expect(props.onExtensionsChanged).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "候補1 を追加" })).toBeDisabled();
  });

  it("すでに追加済みの拡張機能は候補に追加済みとして表示される", async () => {
    const { user } = setup({
      detectChromeExtensions: vi.fn(async () => ({
        browserFound: true,
        items: [
          {
            chromeId: "aaa",
            profile: "Default",
            browser: "chrome" as const,
            name: "候補1",
            path: "p",
            hasPopup: false,
            hasOptions: false,
            added: true,
          },
        ],
      })),
    });

    await user.click(screen.getByRole("button", { name: "ブラウザから検出" }));

    expect(
      await screen.findByText(i18n.t("settings:extensions.added")),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "候補1 を追加" })).toBeDisabled();
  });

  it("Chrome側で拡張機能が削除されたときは見つかりません表示で無効になる", async () => {
    setup({}, [
      entry({
        source: { kind: "chrome", chromeId: "aaa", profile: "Default" },
        enabled: false,
        missing: true,
      }),
    ]);

    expect(
      await screen.findByText(i18n.t("settings:extensions.missing")),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "拡張A のポップアップを開く" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "拡張A のオプションを開く" }),
    ).toBeDisabled();
  });

  it("拡張機能を無効にすると全アカウントで無効になる", async () => {
    const { props, user } = setup({}, [entry()]);

    await user.click(
      await screen.findByRole("checkbox", { name: "拡張A を有効にする" }),
    );

    await waitFor(() =>
      expect(props.setEnabled).toHaveBeenCalledWith("e1", false),
    );
    expect(props.onExtensionsChanged).toHaveBeenCalledTimes(1);
  });

  it("無効にした拡張機能を有効に戻せる", async () => {
    const { props, user } = setup({}, [entry({ enabled: false })]);

    await user.click(
      await screen.findByRole("checkbox", { name: "拡張A を有効にする" }),
    );

    await waitFor(() =>
      expect(props.setEnabled).toHaveBeenCalledWith("e1", true),
    );
    expect(props.onExtensionsChanged).toHaveBeenCalledTimes(1);
  });

  it("拡張機能を削除すると全アカウントから削除される", async () => {
    const { props, user, setCurrent } = setup({}, [entry()]);
    const removeBtn = await screen.findByRole("button", {
      name: "拡張A を削除",
    });
    setCurrent([]);

    await user.click(removeBtn);

    await waitFor(() => expect(props.remove).toHaveBeenCalledWith("e1"));
    await waitFor(() =>
      expect(screen.queryByText("拡張A")).not.toBeInTheDocument(),
    );
    expect(props.onExtensionsChanged).toHaveBeenCalledTimes(1);
  });

  it("変更に失敗したときはカラムを再読込しない", async () => {
    const { props, user } = setup(
      { setEnabled: vi.fn(async () => Promise.reject("保存に失敗しました")) },
      [entry()],
    );

    await user.click(
      await screen.findByRole("checkbox", { name: "拡張A を有効にする" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "保存に失敗しました",
    );
    expect(props.onExtensionsChanged).not.toHaveBeenCalled();
  });

  it("削除に失敗したときはエラーが表示され再読込されない", async () => {
    const { props, user } = setup(
      {
        remove: vi.fn(async () => Promise.reject(new Error("削除できません"))),
      },
      [entry()],
    );

    await user.click(
      await screen.findByRole("button", { name: "拡張A を削除" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "削除できません",
    );
    expect(props.onExtensionsChanged).not.toHaveBeenCalled();
  });

  it("ポップアップを持つ拡張機能は「ポップアップを開く」から別ウィンドウで開ける", async () => {
    const { props, user } = setup({}, [entry()]);

    await user.click(
      await screen.findByRole("button", { name: "拡張A のポップアップを開く" }),
    );

    await waitFor(() =>
      expect(props.openPage).toHaveBeenCalledWith("e1", "popup", "acc-1"),
    );
    expect(props.onExtensionsChanged).not.toHaveBeenCalled();
  });

  it("ポップアップを持たない拡張機能には「ポップアップを開く」が表示されない", async () => {
    setup({}, [entry({ hasPopup: false })]);

    await screen.findByText("拡張A");
    expect(
      screen.queryByRole("button", { name: "拡張A のポップアップを開く" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "拡張A のオプションを開く" }),
    ).toBeInTheDocument();
  });

  it("オプションページを持つ拡張機能は「オプションを開く」から別ウィンドウで開ける", async () => {
    const { props, user } = setup({}, [entry()]);

    await user.click(
      await screen.findByRole("button", { name: "拡張A のオプションを開く" }),
    );

    await waitFor(() =>
      expect(props.openPage).toHaveBeenCalledWith("e1", "options", "acc-1"),
    );
    expect(props.onExtensionsChanged).not.toHaveBeenCalled();
  });

  it("オプションページを持たない拡張機能には「オプションを開く」が表示されない", async () => {
    setup({}, [entry({ hasOptions: false })]);

    await screen.findByText("拡張A");
    expect(
      screen.queryByRole("button", { name: "拡張A のオプションを開く" }),
    ).not.toBeInTheDocument();
  });

  it("無効な拡張機能のポップアップとオプションは開けない", async () => {
    setup({}, [entry({ enabled: false })]);

    expect(
      await screen.findByRole("button", { name: "拡張A のポップアップを開く" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "拡張A のオプションを開く" }),
    ).toBeDisabled();
  });

  it("開くアカウントが決まらないときはポップアップとオプションが無効でツールチップが出る", async () => {
    setup({ accountId: null }, [entry()]);

    const popup = await screen.findByRole("button", {
      name: "拡張A のポップアップを開く",
    });
    const options = screen.getByRole("button", {
      name: "拡張A のオプションを開く",
    });
    expect(popup).toBeDisabled();
    expect(popup).toHaveAttribute(
      "title",
      i18n.t("settings:extensions.accountRequired"),
    );
    expect(options).toBeDisabled();
    expect(options).toHaveAttribute(
      "title",
      i18n.t("settings:extensions.accountRequired"),
    );
  });

  it("処理中は操作ボタンが無効になり aria-busy が付く", async () => {
    let resolveRemove: () => void = () => {};
    const { user } = setup(
      {
        remove: vi.fn(
          () =>
            new Promise<void>((resolve) => {
              resolveRemove = resolve;
            }),
        ),
      },
      [entry()],
    );
    const removeBtn = await screen.findByRole("button", {
      name: "拡張A を削除",
    });

    await user.click(removeBtn);

    expect(removeBtn).toBeDisabled();
    expect(removeBtn).toHaveAttribute("aria-busy", "true");
    expect(
      screen.getByRole("button", { name: "フォルダを指定して追加" }),
    ).toBeDisabled();

    resolveRemove();
    await waitFor(() => expect(removeBtn).not.toBeDisabled());
  });
});

describe("ExtensionsTab 日本語表示の文言", () => {
  it("追加セクションの説明文と案内が従来と同じ日本語で表示される", () => {
    setup();

    expect(screen.getByText("拡張機能を追加")).toBeInTheDocument();
    expect(
      screen.getByText(
        "展開済みの拡張機能フォルダを指定するか、Chrome / Edge にインストール済みの拡張機能から選んで、全アカウントに追加します。",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Chromium 系ブラウザの拡張機能は、通常 %LOCALAPPDATA%\\{組織名}\\{ブラウザ名}\\User Data\\Default\\Extensions\\<拡張ID>\\<バージョン> にあります（組織名のフォルダが無いブラウザもあります）。",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "拡張機能によっては正しく動作しないものがあります。特に、開いているページの内容を検出してツールバーのボタンから操作する種類の拡張機能は、ポップアップを別ウィンドウで開く仕様のため、動作しない場合があります。",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "追加・削除・有効無効を変更すると、全カラムが自動で再読込されます。",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("追加済みの拡張機能はありません"),
    ).toBeInTheDocument();
  });

  it("Chrome 由来の拡張機能の由来表示が従来と同じ日本語で表示される", async () => {
    setup({}, [
      entry({
        source: {
          kind: "chrome",
          browser: "edge",
          profile: "Default",
          chromeId: "abc",
        },
      }),
    ]);

    expect(
      await screen.findByText("Edge（プロファイル: Default）"),
    ).toBeInTheDocument();
  });
});

describe("ExtensionsTab 英語表示", () => {
  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage("ja");
    });
  });

  async function useEnglish() {
    await act(async () => {
      await i18n.changeLanguage("en");
    });
  }

  it("表示言語が英語のとき拡張機能が無い状態に日本語の文言が表示されない", async () => {
    await useEnglish();
    setup();

    expect(await screen.findByText("No extensions added")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Detect from browser" }),
    ).toBeInTheDocument();
    expectNoJapanese(document.body);
  });

  it("表示言語が英語のとき追加済みの一覧とボタンの属性に日本語の文言が表示されない", async () => {
    await useEnglish();
    setup({}, [
      entry({ id: "e1", name: "Ext A" }),
      entry({
        id: "e2",
        name: "Ext B",
        missing: true,
        source: {
          kind: "chrome",
          browser: "edge",
          profile: "Default",
          chromeId: "abc",
        },
      }),
    ]);

    expect(await screen.findByText("Ext A")).toBeInTheDocument();
    expect(screen.getByText("Edge (profile: Default)")).toBeInTheDocument();
    expect(screen.getByText("Not found")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open popup of Ext A" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open options of Ext A" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete Ext A" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Enable Ext A")).toBeInTheDocument();
    expectNoJapanese(document.body);
  });

  it("表示言語が英語のときアカウント未選択のボタンの title に日本語が表示されない", async () => {
    await useEnglish();
    setup({ accountId: null }, [entry({ name: "Ext A" })]);

    const popup = await screen.findByRole("button", {
      name: "Open popup of Ext A",
    });
    expect(popup).toHaveAttribute("title", "Select an account");
    expectNoJapanese(document.body);
  });

  it("表示言語が英語のとき検出した候補に日本語の文言が表示されない", async () => {
    await useEnglish();
    const { user } = setup({
      detectChromeExtensions: vi.fn(
        async (): Promise<DetectResult> => ({
          browserFound: true,
          items: [
            {
              chromeId: "aaa",
              profile: "Default",
              browser: "edge",
              name: "Candidate A",
              path: "p",
              hasPopup: false,
              hasOptions: false,
              added: true,
            },
            {
              chromeId: "bbb",
              profile: "Default",
              browser: "chrome",
              name: "Candidate B",
              path: "p",
              hasPopup: false,
              hasOptions: false,
              added: false,
            },
          ],
        }),
      ),
    });

    await user.click(
      screen.getByRole("button", { name: "Detect from browser" }),
    );

    expect(
      await screen.findByText("Browser: Edge · Profile: Default"),
    ).toBeInTheDocument();
    expect(screen.getByText("Added")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add Candidate B" }),
    ).toBeInTheDocument();
    expectNoJapanese(document.body);
  });

  it("表示言語が英語のとき候補が無い・ブラウザが見つからない状態に日本語の文言が表示されない", async () => {
    await useEnglish();
    const detect = vi
      .fn<() => Promise<DetectResult>>()
      .mockResolvedValueOnce({ browserFound: true, items: [] })
      .mockResolvedValueOnce({ browserFound: false, items: [] });
    const { user } = setup({ detectChromeExtensions: detect });

    await user.click(
      screen.getByRole("button", { name: "Detect from browser" }),
    );
    expect(await screen.findByText("No candidates")).toBeInTheDocument();
    expectNoJapanese(document.body);

    await user.click(
      screen.getByRole("button", { name: "Detect from browser" }),
    );
    expect(
      await screen.findByText("Chrome / Edge not found"),
    ).toBeInTheDocument();
    expectNoJapanese(document.body);
  });

  it("表示言語が英語のとき一覧の取得に失敗した状態でも固定の文言に日本語が表示されない", async () => {
    await useEnglish();
    // エラー本文は呼び出し元（ここでは英語のテストデータ）が決めるため、固定の文言だけを検査する
    setup({
      listExtensions: vi.fn(async () => {
        throw new Error("Failed to list extensions");
      }),
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Failed to list extensions",
    );
    expectNoJapanese(document.body);
  });

  it("画面を開いたまま言語を切り替えると拡張機能タブの文言も切り替わる", async () => {
    setup({}, [entry({ name: "Ext A" })]);
    expect(
      await screen.findByRole("button", { name: "Ext A を削除" }),
    ).toBeInTheDocument();
    expect(screen.getByText("追加済みの拡張機能")).toBeInTheDocument();

    await useEnglish();

    expect(
      screen.getByRole("button", { name: "Delete Ext A" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Added extensions")).toBeInTheDocument();
    expect(screen.queryByText("追加済みの拡張機能")).not.toBeInTheDocument();
  });
});
