// キューブ画面（#/cube/<id>）。SPEC.md 5-5。上にミニ集計、続けてメインデッキ・超次元・GR の 3 つのリスト、最後に未登録の関連。
// 3 つのリストは、このキューブに入れたものだけを出す（台帳の全部を並べない）。リストごとに「＋ … を入れる」がある。
import { h, section, stackedBar, barChart, CIV_CLASSES } from "../ui.js";
import { LEDGER_LABELS, cubeUses } from "../model.js";
import { cubeSummary, cubeProblems, cubeLinks } from "../calc.js";
import * as cardList from "./cardList.js";
import { openCubePicker } from "./cubePicker.js";
import { changeMulti, removeHyperLink } from "./cubeOps.js";

const LISTS = ["cards", "hypers", "gr"];

export function mount(el, ctx) {
  const cubeId = ctx.route.param;
  const head = h("div");
  const orphans = h("div");
  const parts = {};
  // 3 つのリストの入れ物（使わないリストは、update で隠す）
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
  el.append(head, ...LISTS.map((l) => parts[l].wrap), orphans);

  function update(next) {
    const data = next.state.data;
    const cube = data?.cubes[cubeId];
    if (!cube) {
      location.hash = "#/search";
      return;
    }
    head.replaceChildren(headPanel(cubeId, data, cube, next.admin));
    for (const ledger of LISTS) {
      const { wrap, titleEl, addHost, list } = parts[ledger];
      const used = cubeUses(cube, ledger);
      wrap.hidden = !used;
      if (!used) continue;
      const entries = cube[ledger] ?? [];
      const copies = entries.reduce((n, e) => n + (e.count ?? 1), 0);
      titleEl.textContent = `${LEDGER_LABELS[ledger]}（${entries.length} 種類・${copies} 枚）`;
      addHost.replaceChildren(next.admin
        ? h("button", { type: "button", class: "small", onclick: () => openCubePicker(cubeId, ledger) }, `＋ ${LEDGER_LABELS[ledger]}を入れる`)
        : "");
      list.update(next);
    }
    orphans.replaceChildren(...orphanSection(cubeId, data, cube, next.admin));
  }

  update(ctx);
  return { update };
}

function headPanel(cubeId, data, cube, admin) {
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
    h("h3", { class: "sub-title" }, "メインデッキの文明（延べ）"),
    stackedBar(civSegments, { label: `${cube.name}の文明の延べ枚数` }),
    h("h3", { class: "sub-title" }, "メインデッキのコスト"),
    barChart(costBins, { label: `${cube.name}のコストごとの枚数` }),
    h("p", { class: "muted" }, "グラフはメインデッキの集計です。多色は各文明に数え、コスト2も 1 つとして数えます。"));
}

// 付属先がこのキューブのメインデッキに無い、または超次元がこのキューブに入っていない関連
function orphanSection(cubeId, data, cube, admin) {
  if (cube.usesHyper === false) return [];
  const orphans = cubeLinks(data, cubeId).filter((l) => !l.registered || !l.hyperRegistered);
  if (!orphans.length) return [];
  return [section(`未登録の関連（${orphans.length} 件）`,
    h("p", { class: "muted" }, "付属先のカードか超次元がこのキューブに入っていない関連です。外すか、入れ直してください。"),
    h("ul", { class: "cube-rows" }, orphans.map((l) => h("li", { class: "cube-row" },
      h("span", null, `${l.parentCard.name} → ${l.hyperItem.name}`),
      !l.registered ? h("span", { class: "minus" }, "付属先がメインデッキに無い") : null,
      !l.hyperRegistered ? h("span", { class: "minus" }, "超次元がキューブに無い") : null,
      l.memo ? h("span", { class: "muted" }, `メモ：${l.memo}`) : null,
      admin ? h("button", { type: "button", class: "sub small", onclick: () => removeHyperLink(cubeId, l, l.hyperItem.name) }, "外す") : null))))];
}
