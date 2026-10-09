import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { H264SetupDialog } from "@/components/H264SetupDialog/H264SetupDialog";

// アプリは documentElement の data-theme でテーマを切り替えるため、Story でもそれに合わせる
function ThemeRoot({
  theme,
  children,
}: {
  theme: "light" | "dark";
  children: ReactNode;
}) {
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.getAttribute("data-theme");
    el.setAttribute("data-theme", theme);
    return () => {
      if (prev === null) el.removeAttribute("data-theme");
      else el.setAttribute("data-theme", prev);
    };
  }, [theme]);
  return <>{children}</>;
}

const meta: Meta<typeof H264SetupDialog> = {
  title: "Components/H264SetupDialog",
  component: H264SetupDialog,
  parameters: { layout: "fullscreen" },
  args: {
    downloadState: "idle",
    downloadError: null,
    onDownload: fn(),
    onDismiss: fn(),
    onClose: fn(),
    onRelaunch: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof H264SetupDialog>;

const withTheme =
  (theme: "light" | "dark") =>
  (Story: React.ComponentType): React.ReactElement => (
    <ThemeRoot theme={theme}>
      <Story />
    </ThemeRoot>
  );

export const Idle: Story = {
  name: "案内（ライト）",
  decorators: [withTheme("light")],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // 「今はしない」で onDismiss が呼ばれる
    await userEvent.click(canvas.getByRole("button", { name: "今はしない" }));
    await expect(args.onDismiss).toHaveBeenCalledTimes(1);
    await expect(args.onClose).not.toHaveBeenCalled();
  },
};

export const IdleDark: Story = {
  name: "案内（ダーク）",
  decorators: [withTheme("dark")],
};

export const Downloading: Story = {
  name: "ダウンロード中（ライト）",
  args: { downloadState: "downloading" },
  decorators: [withTheme("light")],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("ダウンロード中…")).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "ダウンロードして有効化" }),
    ).toBeDisabled();
  },
};

export const DownloadingDark: Story = {
  name: "ダウンロード中（ダーク）",
  args: { downloadState: "downloading" },
  decorators: [withTheme("dark")],
};

export const Success: Story = {
  name: "成功（ライト）",
  args: { downloadState: "success" },
  decorators: [withTheme("light")],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "今すぐ再起動" }));
    await expect(args.onRelaunch).toHaveBeenCalledTimes(1);
  },
};

export const SuccessDark: Story = {
  name: "成功（ダーク）",
  args: { downloadState: "success" },
  decorators: [withTheme("dark")],
};

export const ErrorState: Story = {
  name: "失敗（ライト）",
  args: {
    downloadState: "error",
    downloadError:
      "ダウンロードに失敗しました。ネットワークを確認してください。",
  },
  decorators: [withTheme("light")],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "ネットワークを確認してください",
    );
    // 「再試行」で onDownload が呼ばれる
    await userEvent.click(canvas.getByRole("button", { name: "再試行" }));
    await expect(args.onDownload).toHaveBeenCalledTimes(1);
  },
};

export const ErrorDark: Story = {
  name: "失敗（ダーク）",
  args: {
    downloadState: "error",
    downloadError:
      "ダウンロードに失敗しました。ネットワークを確認してください。",
  },
  decorators: [withTheme("dark")],
};
