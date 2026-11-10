// 集計画面（#/stats[/<対象>]）。SPEC.md 4 章・5-7。対象（メインデッキ全体／各キューブ）を選んで、枚数・区分・文明・コスト・属性・役割・クロス集計・所持と使用を見る。
// 最後に、全対象を並べた比較表。計算は calc.js。ここは並べて見せるだけ。
import { h, section, stackedBar, barChart, CIV_CLASSES, loadPref, savePref } from "../ui.js";
import { LEDGER_LABELS, cubeUses } from "../model.js";
import { statsSummary, stockSummary, STAT_NONE_KIND } from "../calc.js";

const LEDGERS = ["cards", "hypers", "gr"];
const num = (n) => h("td", { class: "num" }, String(n));

// 名前と数の表（区分・属性・役割）
function countTable(items, extra) {
  const rows = [...items, ...(extra ? [extra] : [])];
  return h("div", { class: "table-wrap" },
    h("table", { class: "stat-table" },
      h("tbody", null, rows.map((r) => h("tr", null, h("th", { scope: "row" }, r.name), num(r.value))))));
}

// クロス集計。数の多いマスほど濃く。数字は必ず文字でも出す。
function crossView(t) {
  const max = Math.max(1, ...t.cells.flat());
  return h("div", { class: "table-wrap" },
    h("table", { class: "stat-table cross" },
      h("thead", null, h("tr", null, h("th", null, ""), t.cols.map((c) => h("th", { scope: "col", class: "num" }, c)), h("th", { scope: "col", class: "num" }, "合計"))),
      h("tbody", null,
        t.rows.map((r, i) => h("tr", null,
          h("th", { scope: "row" }, r),
          t.cells[i].map((v) => h("td", { class: "num heat", style: v ? `--heat:${Math.round((v / max) * 70)}%` : null }, v ? String(v) : "")),
          num(t.rowTotals[i]))),
        h("tr", { class: "total" }, h("th", { scope: "row" }, "合計"), t.colTotals.map(num), num(t.total)))));
}

const stat = (label, value) => [h("dt", null, label), h("dd", null, String(value))];

// 1 つの台帳の集計（メインデッキ／超次元／GR）
function ledgerBlock(data, target, ledger) {
  const s = statsSummary(data, target, ledger);
  const civSegments = [
    ...data.settings.civs.map((c) => ({ label: c, value: s.civ.byCiv[c] ?? 0, class: CIV_CLASSES[c] })),
    { label: "ゼロ文明", value: s.civ.zero, class: "civ-zero" },
  ];
  const costBins = s.cost.bins.map((value, i) => ({ label: i === 10 ? "10+" : String(i), value }));
  const full = ledger === "cards";
  const unit = target === "all" ? "種類（1 種類を 1 として数える）" : "枚";
  return section(LEDGER_LABELS[ledger],
    h("dl", { class: "stats" },
      stat("種類", s.kinds), stat(target === "all" ? "数える数" : "枚数", s.copies),
      stat("単色", s.single), stat("多色", s.multi), stat("ゼロ文明", s.zero), stat("コスト2あり", s.cost2)),
    h("p", { class: "muted" }, `数え方：${unit}。多色は各文明に 1 ずつ、コスト2も 1 つとして数えます。`),
    h("h3", { class: "sub-title" }, "区分"),
    countTable(s.byKind, { name: STAT_NONE_KIND, value: s.noKind }),
    h("h3", { class: "sub-title" }, "文明（延べ）"),
    stackedBar(civSegments, { label: "文明の延べ" }),
    h("p", { class: "muted" }, `延べ合計 ${s.civ.total}（ゼロ文明は含まない）`),
    h("h3", { class: "sub-title" }, "コスト（延べ）"),
    barChart(costBins, { label: "コストの山" }),
    h("dl", { class: "stats" },
      stat("1 以下", s.cost.low), stat("2〜9", s.cost.mid), stat("10 以上", s.cost.high), stat("延べ合計", s.cost.total)),
    h("h3", { class: "sub-title" }, "属性"),
    countTable(s.byAttr),
    h("h3", { class: "sub-title" }, "役割"),
    countTable(s.byRole),
    full || s.copies > 0 ? [
      h("h3", { class: "sub-title" }, "役割 × 属性"),
      crossView(s.roleAttr),
      h("h3", { class: "sub-title" }, "役割 × 文明"),
      crossView(s.roleCiv),
    ] : null);
}

// 所持と使用（登録された全体の話。対象に関わらず出す）
function stockBlock(data) {
  const cubes = Object.entries(data.cubes);
  return section("所持と使用",
    h("div", { class: "table-wrap" },
      h("table", { class: "stat-table" },
        h("thead", null, h("tr", null,
          h("th", null, ""), h("th", { class: "num" }, "種類"), h("th", { class: "num" }, "所持合計"),
          cubes.map(([, c]) => h("th", { class: "num" }, `${c.name}の使用`)),
          h("th", { class: "num" }, "使用合計"), h("th", { class: "num" }, "足りない種類"), h("th", { class: "num" }, "未使用の種類"), h("th", { class: "num" }, "うちプロキシ"))),
        h("tbody", null, LEDGERS.map((ledger) => {
          const k = stockSummary(data, ledger);
          return h("tr", null,
            h("th", { scope: "row" }, LEDGER_LABELS[ledger]),
            num(k.kinds), num(k.owned),
            cubes.map(([id, c]) => (cubeUses(c, ledger) ? num(k.perCube[id]) : h("td", { class: "num muted" }, "—"))),
            num(k.usedTotal), h("td", { class: `num${k.short ? " minus" : ""}` }, String(k.short)), num(k.unused), num(k.proxyKinds));
        })))),
    h("p", { class: "muted" }, "使用は、各キューブに入れた枚数の合計です。プロキシは本物と区別せず合算しています。"));
}

// 比較表：行＝メインデッキ全体・各キューブ（メインデッキの集計）
function compareBlock(data, targets) {
  const civs = data.settings.civs;
  return section("比較表（メインデッキ）",
    h("div", { class: "table-wrap" },
      h("table", { class: "stat-table" },
        h("thead", null, h("tr", null,
          ["", "種類", "枚数", "単色", "多色", "ゼロ文明", ...civs, "コスト1以下", "コスト2〜9", "コスト10以上", "足りない種類"]
            .map((t, i) => h("th", { scope: "col", class: i ? "num" : null }, t)))),
        h("tbody", null, targets.map((t) => {
          const s = statsSummary(data, t.key, "cards");
          const short = t.key === "all" ? stockSummary(data, "cards").short : cubeShort(data, t.key);
          return h("tr", null,
            h("th", { scope: "row" }, t.label),
            [s.kinds, s.copies, s.single, s.multi, s.zero, ...civs.map((c) => s.civ.byCiv[c] ?? 0), s.cost.low, s.cost.mid, s.cost.high].map(num),
            h("td", { class: `num${short ? " minus" : ""}` }, String(short)));
        })))),
    h("p", { class: "muted" }, "「メインデッキ全体」は登録された 1 種類を 1 として、キューブは入れた枚数ぶん数えています。"));
}

// そのキューブに入っているカードのうち、全体で足りなくなっている種類数
function cubeShort(data, cubeId) {
  const used = {};
  for (const c of Object.values(data.cubes)) for (const e of c.cards ?? []) used[e.no] = (used[e.no] ?? 0) + (e.count ?? 1);
  const owned = new Map(data.cards.map((c) => [c.no, c.owned]));
  return (data.cubes[cubeId].cards ?? []).filter((e) => owned.has(e.no) && owned.get(e.no) - used[e.no] < 0).length;
}

export function mount(el, ctx) {
  const nav = h("nav", { class: "segmented view-switch", "aria-label": "集計の対象" });
  const body = h("div");
  el.append(nav, body);

  function update(next) {
    const data = next.state.data;
    const targets = [{ key: "all", label: "メインデッキ全体" }, ...Object.entries(data.cubes).map(([id, c]) => ({ key: id, label: c.name }))];
    const fromUrl = next.route.param;
    let target = fromUrl ?? loadPref("statsTarget", "all");
    if (!targets.some((t) => t.key === target)) target = "all";
    if (fromUrl && targets.some((t) => t.key === fromUrl)) savePref("statsTarget", fromUrl);

    nav.replaceChildren(...targets.map((t) => h("a", { href: `#/stats/${encodeURIComponent(t.key)}`, "aria-current": t.key === target ? "page" : null }, t.label)));
    const cube = data.cubes[target];
    const ledgers = LEDGERS.filter((l) => target === "all" || cubeUses(cube, l));
    body.replaceChildren(
      ...ledgers.map((l) => ledgerBlock(data, target, l)),
      stockBlock(data),
      compareBlock(data, targets));
  }

  update(ctx);
  return { update };
}
