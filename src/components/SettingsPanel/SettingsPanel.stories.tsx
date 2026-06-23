import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { SettingsPanel } from "@/components/SettingsPanel/SettingsPanel";
import type { Column } from "@/types";

const columnSettings = {
  autoReloadEnabled: false,
  autoReloadInterval: 600,
  showCountdown: true,
  areaRemoveEnabled: false,
  showCustomMenu: false,
  scrollPosRestoreEnabled: false,
  customCSS: "",
  visibleLinks: [],
  smallImageEnabled: false,
  smallImageWidth: "50%",
  blurImageEnabled: false,
  blurImageAmount: "10px",
  ngWords: [],
};

const column: Column = {
  id: "col-1",
  accountId: "acc-1",
  pageType: "home",
  width: 350,
  order: 0,
  gridRow: 1,
  gridCol: 1,
  heightMode: "auto",
  settings: columnSettings,
};

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

const meta: Meta<typeof SettingsPanel> = {
  title: "Components/SettingsPanel",
  component: SettingsPanel,
  parameters: { layout: "fullscreen" },
  args: {
    column,
    isMobile: false,
    onApply: fn(),
    onClose: fn(),
    onReload: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof SettingsPanel>;

export const Default: Story = {
  name: "デフォルト",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("カラム設定")).toBeInTheDocument();
    // NGワードを入力して適用すると配列として onApply に渡される
    const textarea = canvas.getByPlaceholderText("1行に1ワードで入力");
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "spam{Enter}bot");
    await userEvent.click(canvas.getByRole("button", { name: "適用" }));
    await expect(args.onApply).toHaveBeenCalledWith(
      "col-1",
      expect.objectContaining({ ngWords: ["spam", "bot"] }),
      350,
    );
  },
};

export const LightTheme: Story = {
  name: "ライトテーマ",
  decorators: [
    (Story) => (
      <ThemeRoot theme="light">
        <Story />
      </ThemeRoot>
    ),
  ],
};

export const DarkTheme: Story = {
  name: "ダークテーマ",
  decorators: [
    (Story) => (
      <ThemeRoot theme="dark">
        <Story />
      </ThemeRoot>
    ),
  ],
};
