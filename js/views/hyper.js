// 「超次元」タブ（#/hyper）。SPEC.md 5-6。キューブごとの関連の概要。超次元の一覧はカード一覧（#/list/hypers）で見る。
// 関連を付けるのはキューブ画面。ここでは見る・外すだけ。
import { h, section } from "../ui.js";
import { cubeLinks } from "../calc.js";
import { removeHyperLink } from "./cubeOps.js";

export function mount(el, ctx) {
  const overview = h("div");
  el.append(overview);

  function update(next) {
    overview.replaceChildren(
      ...overviewSections(next.state.data, next.admin),
      h("p", { class: "muted" }, h("a", { href: "#/list/hypers" }, "超次元の一覧は、カード一覧で見られます")));
  }

  update(ctx);
  return { update };
}

function overviewSections(data, admin) {
  const cubes = Object.entries(data.cubes).filter(([, c]) => c.usesHyper);
  if (!cubes.length) {
    return [section("キューブごとの関連", h("p", { class: "muted" }, "超次元を使うキューブがありません（設定のキューブで「超次元を使う」をオンにできます）。"))];
  }
  return cubes.map(([id, cube]) => {
    const links = cubeLinks(data, id).sort((a, b) => a.parent - b.parent || a.hyper - b.hyper);
    const have = (cube.hypers ?? []).reduce((n, x) => n + (x.count ?? 1), 0);
    return section(`${cube.name}の関連（${links.length} 件・入れた超次元 ${have} 枚）`,
      h("p", { class: "muted" }, h("a", { href: `#/cube/${id}` }, "キューブの画面で付けたり外したりできます")),
      links.length
        ? h("ul", { class: "cube-rows" }, links.map((l) => h("li", { class: "cube-row" },
          h("a", { href: `#/card/${l.parent}` }, l.parentCard.name),
          h("span", null, "→"),
          h("a", { href: `#/hyper/${l.hyper}` }, l.hyperItem.name),
          l.registered ? null : h("span", { class: "minus" }, "付属先が未登録"),
          l.hyperRegistered ? null : h("span", { class: "minus" }, "超次元がキューブに無い"),
          l.memo ? h("span", { class: "muted" }, `メモ：${l.memo}`) : null,
          admin ? h("button", { type: "button", class: "sub small", onclick: () => removeHyperLink(id, l, l.hyperItem.name) }, "外す") : null)))
        : h("p", { class: "muted" }, "まだ関連がありません。"));
  });
}
