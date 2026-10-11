import type { Preview } from "@storybook/react-vite";
import i18n from "../src/i18n";

const preview: Preview = {
  globalTypes: {
    locale: {
      description: "表示言語",
      toolbar: {
        title: "言語",
        icon: "globe",
        items: ["ja", "en"],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { locale: "ja" },
  decorators: [
    (Story, context) => {
      void i18n.changeLanguage(context.globals.locale);
      return <Story />;
    },
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: "todo",
    },
  },
};

export default preview;
