// キューブ画面（#/cube/<id>[/<表示>]）。SPEC.md 5-5。上に表示の切り替えとミニ集計、続けてメインデッキ・超次元・GR の 3 つのリスト、超次元の対応。
// 3 つのリストは、このキューブに入れたものだけを出す（台帳の全部を並べない）。リストごとに「＋ … を入れる」がある。
// 表示の切り替え：すべて／メインデッキ／超次元／GR／対応／分布。情報が増えても、見たいものだけを出せる。
import { h, section, stackedBar, barChart, CIV_CLASSES, loadPref, savePref } from "../ui.js";
import { LEDGER_LABELS, cubeUses } from "../model.js";
import { cubeSummary, cubeProblems } from "../calc.js";
import * as cardList from "./cardList.js";
import { openCubePicker } from "./cubePicker.js";
import { changeMulti } from "./cubeOps.js";
import { createLinkView } from "./linkView.js";

const LISTS = ["cards", "hypers", "gr"];

// needs：その台帳のリストを使うキューブだけに出す表示
const VIEWS = [
  { key: "all", label: "すべて" },
  { key: "cards", label: "メインデッキ" },
  { key: "hypers", label: "超次元", needs: "hypers" },
  { key: "gr", label: "GR", needs: "gr" },
  { key: "links", label: "対応", needs: "hypers" },
  { key: "charts", label: "分布" },
];

export function mount(el, ctx) {
  const cubeId = ctx.route.param;
  const nav = h("nav", { class: "segmented view-switch", "aria-label": "表示の切り替え" });
  const head = h("div");
  const linkView = createLinkView();
  const linkWrap = h("section", { class: "cube-list" },
    h("div", { class: "cube-list-head" }, h("h2", { class: "list-heading" }, "超次元の対応")), linkView.el);
  const parts = {};
  // 3 つのリストの入れ物（使わない・今の表示に要らないリストは、update で隠す）
  for (const ledger of LISTS) {
    const titleEl = h("h2", { class: "list-heading" });
    const addHost = h("span", { class: "list-add" });
    const listHost = h("div");
    const wrap = h("section", { class: "cube-list" }, h("div", { class: "cube-list-head" }, titleEl, addHost), listHost);
    parts[ledger] = {
      wrap, titleEl, addHost,
      list: cardList.mount(listHost, ctx, { ledger, cubeId, switcher: false, controls: ledger === "cards" }),
    };
  }
  el.append(nav, head, ...LISTS.map((l) => parts[l].wrap), linkWrap);

  function update(next) {
    const data = next.state.data;
    const cube = data?.cubes[cubeId];
    if (!cube) {
      location.hash = "#/search";
      return;
    }

    // 表示：URL の指定 → 端末が覚えている表示 → すべて
    const available = VIEWS.filter((v) => !v.needs || cubeUses(cube, v.needs));
    const fromUrl = next.route.sub;
    let view = fromUrl ?? loadPref("cubeView", "all");
    if (!available.some((v) => v.key === view)) view = "all";
    if (fromUrl && available.some((v) => v.key === fromUrl)) savePref("cubeView", fromUrl);
    const show = (key) => view === "all" || view === key;
    nav.replaceChildren(...available.map((v) => h("a", {
      href: `#/cube/${cubeId}/${v.key}`,
      "aria-current": v.key === view ? "page" : null,
    }, v.label)));

    head.replaceChildren(headPanel(cubeId, data, cube, next.admin, show("charts")));
    for (const ledger of LISTS) {
      const { wrap, titleEl, addHost, list } = parts[ledger];
      wrap.hidden = !cubeUses(cube, ledger) || !show(ledger);
      if (wrap.hidden) continue;
      const entries = cube[ledger] ?? [];
      const copies = entries.reduce((n, e) => n + (e.count ?? 1), 0);
      titleEl.textContent = `${LEDGER_LABELS[ledger]}（${entries.length} 種類・${copies} 枚）`;
      addHost.replaceChildren(next.admin
        ? h("button", { type: "button", class: "small", onclick: () => openCubePicker(cubeId, ledger) }, `＋ ${LEDGER_LABELS[ledger]}を入れる`)
        : "");
      list.update(next);
    }
    // 超次元の対応：超次元を使うキューブだけ
    linkWrap.hidden = cube.usesHyper === false || !show("links");
    if (!linkWrap.hidden) linkView.update({ data, cubeId, admin: next.admin });
  }

  update(ctx);
  return { update };
}

function headPanel(cubeId, data, cube, admin, charts) {
  const sum = cubeSummary(data, cubeId);
  const problems = cubeProblems(data, cubeId);

  const civSegments = [
    ...data.settings.civs.map((c) => ({ label: c, value: sum.civ.byCiv[c] ?? 0, class: CIV_CLASSES[c] })),
    { label: "ゼロ文明", value: sum.civ.zero, class: "civ-zero" },
  ];
  const costBins = sum.cost.map((value, i) => ({ label: i === 10 ? "10+" : String(i), value }));
  const stat = (label, value, warn = false) => [h("dt", null, label), h("dd", { class: warn ? "minus" : null }, String(value))];

  return section(null,
    h("div", { class: "cube-head" },
      h("span", { class: "badge" }, cube.multi ? "同名カード：所持数まで複数枚OK" : "同名カード：1 枚だけ"),
      admin
        ? h("button", { type: "button", class: "sub small", onclick: () => changeMulti(cubeId, !cube.multi) },
          cube.multi ? "1 枚だけにする" : "複数枚OKにする")
        : null),
    h("dl", { class: "stats" },
      stat("メインデッキの種類", sum.kinds),
      stat("枚数", sum.copies),
      stat("足りないカード", sum.shortage, sum.shortage > 0)),
    problems.length
      ? h("p", { class: "warn-text" },
        `⚠ 同名カードは 1 枚だけのモードなのに、複数枚・同名が複数入っているカードがあります（${new Set(problems.map((p) => `${p.ledger}:${p.no}`)).size} 種類）。`)
      : null,
    charts ? [
      h("h3", { class: "sub-title" }, "メインデッキの文明（延べ）"),
      stackedBar(civSegments, { label: `${cube.name}の文明の延べ枚数` }),
      h("h3", { class: "sub-title" }, "メインデッキのコスト"),
      barChart(costBins, { label: `${cube.name}のコストごとの枚数` }),
      h("p", { class: "muted" }, "グラフはメインデッキの集計です。多色は各文明に数え、コスト2も 1 つとして数えます。"),
    ] : null);
}
