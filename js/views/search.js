// 検索（ホーム）。段階 1 では、データが見えることを確かめるための仮の一覧。
import { h, section, simpleTable, civChips, costText } from "../ui.js";

export function render({ state }) {
  const { data } = state;
  return [
    h("p", { class: "note" }, "仮の一覧です（段階 2 で検索画面に置き換えます）。"),
    ledgerTable("所持カード", data.cards),
    ledgerTable("超次元", data.hypers),
    ledgerTable("GR", data.gr),
  ];
}

function ledgerTable(title, items) {
  return section(`${title}（${items.length} 件）`,
    items.length
      ? simpleTable([
        { label: "No.", class: "num", value: (r) => r.no },
        { label: "名前", class: "name", value: (r) => r.name },
        { label: "コスト", class: "num", value: costText },
        { label: "文明", value: (r) => civChips(r.civs) },
        { label: "所持", class: "num", value: (r) => r.owned },
      ], items)
      : h("p", { class: "muted" }, "まだありません。"));
}
