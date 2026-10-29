// index ページのデータ + 全ページ横断検索用の見出し索引（MCX_DATA.index）
window.MCX_DATA = window.MCX_DATA || { flows: {}, catalogs: {}, details: {} };
window.MCX_DATA.index = window.MCX_DATA.index || [];

// 見出し索引: { page: "react", id: "overview", title: "見出しテキスト" } を追記する
window.MCX_DATA.index.push(
  // { page: "react", id: "overview", title: "…" },
);

Object.assign(window.MCX_DATA.flows, {
  /* id: flow */
});
Object.assign(window.MCX_DATA.catalogs, {
  /* id: catalog */
});
Object.assign(window.MCX_DATA.details, {
  /* id: detail */
});
