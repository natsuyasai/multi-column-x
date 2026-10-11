{{include:instructions/base-plan}}

{{include:instructions/requirement-scenario-planning}}

## 実環境調査の結果の取り込み（Multi Column X 固有）

直前の調査 step（investigate）の出力が前 step の出力として渡されている場合、その内容を実環境の事実として計画に取り込む。

- 「実DOM調査: 対象外」なら、その旨を計画レポート冒頭に引き継ぐ。
- 調査結果にある手段・セレクタ・DOM 構造・タイミング・実測値は、計画に事実として残す。「未確認」の項目は未確認のまま残し、推測で埋めない。
- 調査結果が無いのに `mcx-real-webview-investigation` の発動条件に該当する場合は、その旨を計画に書き、Bash で CDP 調査が必要な項目を列挙する。
