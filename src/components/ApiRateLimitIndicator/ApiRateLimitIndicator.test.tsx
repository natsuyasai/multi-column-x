import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as apiRateLimitLabels from "@/constants/apiRateLimitLabels";
import type { Account, ApiRateLimitBucket } from "@/types";
import { ApiRateLimitIndicator } from "./ApiRateLimitIndicator";

const NOW_SEC = Math.floor(Date.now() / 1000);

const accounts: Account[] = [
  {
    id: "acc-1",
    label: "アカウントA",
    dataDirectory: "/data/a",
    color: "#1d9bf0",
    createdAt: "2026-05-02T00:00:00Z",
  },
  {
    id: "acc-2",
    label: "アカウントB",
    dataDirectory: "/data/b",
    color: "#e0245e",
    createdAt: "2026-05-02T00:00:00Z",
  },
  {
    id: "acc-3",
    label: "アカウントC",
    dataDirectory: "/data/c",
    color: "#17bf63",
    createdAt: "2026-05-02T00:00:00Z",
  },
];

function bucket(
  bucketKey: string,
  remaining: number,
  limit: number,
): ApiRateLimitBucket {
  return {
    bucketKey,
    remaining,
    limit,
    reset: NOW_SEC + 300,
    updatedAt: Date.now(),
  };
}

const normalRateLimits: Record<string, Record<string, ApiRateLimitBucket>> = {
  "acc-1": {
    HomeTimeline: bucket("HomeTimeline", 900, 900),
  },
};

const mixedSeverityRateLimits: Record<
  string,
  Record<string, ApiRateLimitBucket>
> = {
  "acc-1": {
    HomeTimeline: bucket("HomeTimeline", 900, 900),
  },
  "acc-2": {
    SearchTimeline: bucket("SearchTimeline", 10, 100), // warning (10%)
    NotificationsTimeline: bucket("NotificationsTimeline", 2, 100), // critical (2%)
  },
  // acc-3 はデータなし
};

describe("ApiRateLimitIndicator", () => {
  it("トリガーボタンが表示される", () => {
    render(<ApiRateLimitIndicator accounts={accounts} apiRateLimits={{}} />);
    expect(
      screen.getByRole("button", { name: "APIレート制限" }),
    ).toBeInTheDocument();
  });

  it("トリガーボタンをクリックするとポップオーバーが開く", () => {
    render(
      <ApiRateLimitIndicator
        accounts={accounts}
        apiRateLimits={normalRateLimits}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "APIレート制限" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("アカウントA")).toBeInTheDocument();
    expect(screen.getAllByText("ホームタイムライン").length).toBeGreaterThan(0);
    expect(screen.getByText("900/900")).toBeInTheDocument();
  });

  it("もう一度クリックすると閉じる", () => {
    render(
      <ApiRateLimitIndicator
        accounts={accounts}
        apiRateLimits={normalRateLimits}
      />,
    );
    const trigger = screen.getByRole("button", { name: "APIレート制限" });

    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Escキーを押すと閉じる", () => {
    render(
      <ApiRateLimitIndicator
        accounts={accounts}
        apiRateLimits={normalRateLimits}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "APIレート制限" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("ポップオーバー外をクリックすると閉じる", () => {
    render(
      <ApiRateLimitIndicator
        accounts={accounts}
        apiRateLimits={normalRateLimits}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "APIレート制限" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("ポップオーバー外クリックで閉じたときonOpenChangeがfalseで呼ばれる", () => {
    const onOpenChange = vi.fn();
    render(
      <ApiRateLimitIndicator
        accounts={accounts}
        apiRateLimits={normalRateLimits}
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "APIレート制限" }));
    expect(onOpenChange).toHaveBeenLastCalledWith(true);

    fireEvent.mouseDown(document.body);

    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("ポップオーバー内をクリックしても閉じない", () => {
    render(
      <ApiRateLimitIndicator
        accounts={accounts}
        apiRateLimits={normalRateLimits}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "APIレート制限" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByText("アカウントA"));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("データが無いアカウントはカラム関連項目が未計測プレースホルダーとして表示される", () => {
    render(
      <ApiRateLimitIndicator
        accounts={accounts}
        apiRateLimits={mixedSeverityRateLimits}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "APIレート制限" }));

    expect(screen.getByText("アカウントC")).toBeInTheDocument();
    expect(screen.getAllByText("-/-").length).toBeGreaterThan(0);
    expect(screen.queryByText("データなし")).not.toBeInTheDocument();
  });

  it("remaining/limitの比率が低いバケットには警告クラスが付く", () => {
    render(
      <ApiRateLimitIndicator
        accounts={accounts}
        apiRateLimits={mixedSeverityRateLimits}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "APIレート制限" }));

    const warningRow = screen.getByText("10/100").closest("li");
    const criticalRow = screen.getByText("2/100").closest("li");

    expect(warningRow?.className).toMatch(/warning/i);
    expect(criticalRow?.className).toMatch(/critical/i);
  });

  it("全アカウントでデータが1件も無い場合でもポップオーバーが開く", () => {
    render(<ApiRateLimitIndicator accounts={accounts} apiRateLimits={{}} />);

    fireEvent.click(screen.getByRole("button", { name: "APIレート制限" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getAllByText("-/-").length).toBe(accounts.length * 5);
  });

  it("最も深刻なseverityに応じてトリガーボタンの見た目が変化する", () => {
    render(
      <ApiRateLimitIndicator
        accounts={accounts}
        apiRateLimits={mixedSeverityRateLimits}
      />,
    );
    const trigger = screen.getByRole("button", { name: "APIレート制限" });
    expect(trigger.className).toMatch(/critical/i);
  });

  it("カラム関連でないapiがcritical状態でも、トリガーボタンは深刻表示にならない", () => {
    const rateLimitsWithNonColumnCritical: Record<
      string,
      Record<string, ApiRateLimitBucket>
    > = {
      "acc-1": {
        DeleteTweet: bucket("DeleteTweet", 1, 100), // critical (1%) だが非カラム関連
      },
    };
    render(
      <ApiRateLimitIndicator
        accounts={accounts}
        apiRateLimits={rateLimitsWithNonColumnCritical}
      />,
    );
    const trigger = screen.getByRole("button", { name: "APIレート制限" });

    expect(trigger.className).not.toMatch(/critical/i);
    expect(trigger.className).not.toMatch(/warning/i);
  });

  it("トリガークリックで開いたときonOpenChangeがtrueで呼ばれる", () => {
    const onOpenChange = vi.fn();
    render(
      <ApiRateLimitIndicator
        accounts={accounts}
        apiRateLimits={normalRateLimits}
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "APIレート制限" }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("再クリックで閉じたときonOpenChangeがfalseで呼ばれる", () => {
    const onOpenChange = vi.fn();
    render(
      <ApiRateLimitIndicator
        accounts={accounts}
        apiRateLimits={normalRateLimits}
        onOpenChange={onOpenChange}
      />,
    );
    const trigger = screen.getByRole("button", { name: "APIレート制限" });
    fireEvent.click(trigger);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(trigger);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("辞書に説明がある場合はポップオーバーに説明文が表示される", () => {
    render(
      <ApiRateLimitIndicator
        accounts={accounts}
        apiRateLimits={normalRateLimits}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "APIレート制限" }));

    expect(
      screen.getByText(
        "フォロー中ユーザーのツイートをアルゴリズム順で並べたタイムラインを取得するAPI。",
      ),
    ).toBeInTheDocument();
  });

  it("辞書に説明が無いbucketKeyの場合は説明文の要素が表示されない", () => {
    // カラム関連のbucketKeyはすべて辞書に説明文が定義済みのため、
    // 「説明文が無い」ケースを再現するにはgetApiRateLimitDescriptionをスタブする。
    const getDescriptionSpy = vi
      .spyOn(apiRateLimitLabels, "getApiRateLimitDescription")
      .mockReturnValue(undefined);

    const rateLimitsWithoutDescription: Record<
      string,
      Record<string, ApiRateLimitBucket>
    > = {
      "acc-1": {
        HomeTimeline: bucket("HomeTimeline", 100, 100),
      },
    };
    render(
      <ApiRateLimitIndicator
        accounts={accounts}
        apiRateLimits={rateLimitsWithoutDescription}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "APIレート制限" }));

    const row = screen.getByText("100/100").closest("li");
    expect(row?.querySelector("p")).not.toBeInTheDocument();

    getDescriptionSpy.mockRestore();
  });

  it("Escキーで閉じたときonOpenChangeがfalseで呼ばれる", () => {
    const onOpenChange = vi.fn();
    render(
      <ApiRateLimitIndicator
        accounts={accounts}
        apiRateLimits={normalRateLimits}
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "APIレート制限" }));
    expect(onOpenChange).toHaveBeenLastCalledWith(true);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("カラム関連でないAPIのbucketはポップオーバーに表示されない", () => {
    const rateLimitsWithNonColumnBucket: Record<
      string,
      Record<string, ApiRateLimitBucket>
    > = {
      "acc-1": {
        UserTweets: bucket("UserTweets", 100, 100),
      },
    };
    render(
      <ApiRateLimitIndicator
        accounts={accounts}
        apiRateLimits={rateLimitsWithNonColumnBucket}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "APIレート制限" }));

    expect(screen.getByText("アカウントA")).toBeInTheDocument();
    expect(
      screen.queryByText("ユーザーのツイート取得"),
    ).not.toBeInTheDocument();
    // UserTweetsは非関連のため無視され、カラム関連5項目は全アカウントとも未計測プレースホルダーになる
    expect(screen.getAllByText("-/-").length).toBe(accounts.length * 5);
  });

  it("カラム関連のAPIと非関連のAPIが混在する場合、関連するAPIのみ表示される", () => {
    const rateLimitsMixed: Record<
      string,
      Record<string, ApiRateLimitBucket>
    > = {
      "acc-1": {
        HomeTimeline: bucket("HomeTimeline", 900, 900),
        UserTweets: bucket("UserTweets", 100, 100),
      },
    };
    render(
      <ApiRateLimitIndicator
        accounts={accounts}
        apiRateLimits={rateLimitsMixed}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "APIレート制限" }));

    expect(screen.getAllByText("ホームタイムライン").length).toBeGreaterThan(0);
    expect(screen.getByText("900/900")).toBeInTheDocument();
    expect(
      screen.queryByText("ユーザーのツイート取得"),
    ).not.toBeInTheDocument();
    // 観測されていない他のカラム関連項目（3アカウント×5項目-観測済み1件=14件）は未計測プレースホルダーとして残る
    expect(screen.getAllByText("-/-").length).toBe(accounts.length * 5 - 1);
  });

  it("CreateTweet（投稿）のリミットもポップオーバーに表示される", () => {
    const rateLimitsWithCreateTweet: Record<
      string,
      Record<string, ApiRateLimitBucket>
    > = {
      "acc-1": {
        CreateTweet: bucket("CreateTweet", 50, 100),
      },
    };
    render(
      <ApiRateLimitIndicator
        accounts={accounts}
        apiRateLimits={rateLimitsWithCreateTweet}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "APIレート制限" }));

    const row = screen.getByText("50/100").closest("li");
    expect(row?.textContent).toContain("ツイート投稿");
  });

  it("観測されていないカラム関連APIは未計測として残量欄に「-/-」を表示する", () => {
    render(<ApiRateLimitIndicator accounts={accounts} apiRateLimits={{}} />);
    fireEvent.click(screen.getByRole("button", { name: "APIレート制限" }));

    expect(screen.getAllByText("-/-").length).toBe(accounts.length * 5);
  });

  it("観測されていないカラム関連APIの説明文には未計測である旨が付記される", () => {
    render(<ApiRateLimitIndicator accounts={accounts} apiRateLimits={{}} />);
    fireEvent.click(screen.getByRole("button", { name: "APIレート制限" }));

    expect(
      screen.getAllByText(
        (_, element) =>
          element?.tagName === "P" &&
          (element.textContent ?? "").includes(
            "フォロー中ユーザーのツイートをアルゴリズム順で並べたタイムラインを取得するAPI。（まだ使用されていないため未計測）",
          ),
      ).length,
    ).toBeGreaterThan(0);
  });

  it("観測されていない項目にはwarning/criticalクラスが付かない", () => {
    render(<ApiRateLimitIndicator accounts={accounts} apiRateLimits={{}} />);
    fireEvent.click(screen.getByRole("button", { name: "APIレート制限" }));

    const unobservedRows = screen
      .getAllByText("-/-")
      .map((el) => el.closest("li"));
    for (const row of unobservedRows) {
      expect(row?.className).not.toMatch(/warning|critical/i);
    }
  });
});
