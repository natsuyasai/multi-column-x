import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
    UserTweets: bucket("UserTweets", 10, 100), // warning (10%)
    CreateTweet: bucket("CreateTweet", 2, 100), // critical (2%)
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
    expect(screen.getByText("ホームタイムライン")).toBeInTheDocument();
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

  it("データが無いアカウントは「データなし」の表示になる", () => {
    render(
      <ApiRateLimitIndicator
        accounts={accounts}
        apiRateLimits={mixedSeverityRateLimits}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "APIレート制限" }));

    expect(screen.getByText("アカウントC")).toBeInTheDocument();
    expect(screen.getAllByText("データなし").length).toBeGreaterThan(0);
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
    expect(screen.getAllByText("データなし").length).toBe(accounts.length);
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
    const rateLimitsWithoutDescription: Record<
      string,
      Record<string, ApiRateLimitBucket>
    > = {
      "acc-1": {
        UnknownOperationXYZ: bucket("UnknownOperationXYZ", 100, 100),
      },
    };
    render(
      <ApiRateLimitIndicator
        accounts={accounts}
        apiRateLimits={rateLimitsWithoutDescription}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "APIレート制限" }));

    const row = screen.getByText("UnknownOperationXYZ").closest("li");
    expect(row?.querySelector("p")).not.toBeInTheDocument();
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
});
