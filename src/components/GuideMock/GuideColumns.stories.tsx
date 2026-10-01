import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { GuideColumns } from "@/components/GuideMock/GuideColumns";

const meta: Meta<typeof GuideColumns> = {
  title: "Components/GuideMock/GuideColumns",
  component: GuideColumns,
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof GuideColumns>;

export const Default: Story = {
  name: "デフォルト",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // 3カラム（ホーム / 通知 / 検索）のヘッダーが描画される
    await expect(
      canvas.getByText("サンプルユーザー - ホーム"),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText("サンプルユーザー - 通知"),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText("サンプルユーザー - 検索: サンプル"),
    ).toBeInTheDocument();
  },
};
