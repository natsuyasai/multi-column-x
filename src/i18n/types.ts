import type { TFunction } from "i18next";
import type { resources } from "./resources";

/** 全名前空間の完全キー（`ns:key`）を受け付ける翻訳関数の型。`useTranslation().t` と `i18n.t` の両方を渡せる */
export type AppTFunction = TFunction<(keyof (typeof resources)["ja"])[]>;
