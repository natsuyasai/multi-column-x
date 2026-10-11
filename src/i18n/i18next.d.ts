import type { resources } from "./resources";

declare module "i18next" {
  interface CustomTypeOptions {
    // 全名前空間を既定にすることで、引数なしの useTranslation() でも
    // `t("ns:key")` の完全キーが型チェックされる
    defaultNS: (keyof (typeof resources)["ja"])[];
    resources: (typeof resources)["ja"];
  }
}
