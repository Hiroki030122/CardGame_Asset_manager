// 検索（ホーム）。SPEC.md 5-2。段階 2a では所持カードだけ（超次元・GR は段階 4）。
import { h, toggleChips, civChips, chips, costText, proxyBadge, loadPref, savePref } from "../ui.js";
import { nameKey } from "../store.js";
import { cubeIndex, cardUse } from "../calc.js";
import { changeOwned } from "../actions.js";
import { openCardForm } from "./cardForm.js";

const PAGE = 100;
const NONE = "__none__";
const SORTS = { no: "番号", name: "名前", cost: "コスト", owned: "所持枚数", remaining: "残り" };

// 画面を離れても絞り込みは残す
const filters = blankFilters();
let limit = PAGE;
let mode = loadPref("searchView", "cards");
let hiddenCols = new Set(loadPref("searchHiddenColumns", ["memo"]));
let filtersOpen = false;

function blankFilters() {
  return {
    q: "", civs: new Set(), civMode: "any", kind: "", attr: "", role: "",
    costMin: "", costMax: "", cube: {}, proxy: "", minus: false, sort: "no", desc: false,
  };
}

export function mount(el, ctx) {
  let current = ctx;
  let controlsKey = "";
  const refs = {};
  const controls = h("div");
  const summary = h("p", { class: "muted result-count" });
  const results = h("div");
  const more = h("div", { class: "more" });
  el.append(controls, summary, results, more);
  if (ctx.admin) {
    el.append(h("button", { class: "fab", onclick: () => openCardForm({ ledger: "cards" }) }, "＋ 登録"));
  }

  function update(next) {
    current = next;
    const { settings, cubes } = next.state.data;
    const key = JSON.stringify([settings, Object.entries(cubes).map(([id, c]) => [id, c.name])]);
    if (key !== controlsKey) {
      controlsKey = key;
      controls.replaceChildren(buildControls());
    }
    renderResults();
  }

  const changed = () => {
    limit = PAGE;
    refreshFilterCount();
    renderResults();
  };

  // ---- 検索欄・絞り込み ----

  function buildControls() {
    const { settings, cubes } = current.state.data;

    const search = h("input", {
      type: "search", value: filters.q, placeholder: "名前の一部、または番号", "aria-label": "検索",
    });
    search.addEventListener("input", () => { filters.q = search.value; changed(); });

    refs.viewButtons = { cards: viewButton("cards", "カード"), table: viewButton("table", "表") };

    const select = (value, options, onChange, label) => {
      const s = h("select", { "aria-label": label },
        options.map(([v, text]) => h("option", { value: v, selected: v === value }, text)));
      s.addEventListener("change", () => onChange(s.value));
      return s;
    };
    const all = [["", "すべて"]];
    const listOptions = (list) => list.map((v) => [v, v]);
    const field = (label, ...controls) => h("div", { class: "field" }, h("span", { class: "label" }, label), ...controls);

    const costInput = (key) => {
      const input = h("input", { type: "number", inputmode: "numeric", min: 0, value: filters[key], "aria-label": key === "costMin" ? "コストの下限" : "コストの上限" });
      input.addEventListener("input", () => { filters[key] = input.value; changed(); });
      return input;
    };

    const minus = h("input", { type: "checkbox" });
    minus.checked = filters.minus;
    minus.addEventListener("change", () => { filters.minus = minus.checked; changed(); });

    refs.sort = select(filters.sort, Object.entries(SORTS), (v) => { filters.sort = v; renderResults(); }, "並べ替え");
    refs.desc = h("input", { type: "checkbox" });
    refs.desc.checked = filters.desc;
    refs.desc.addEventListener("change", () => { filters.desc = refs.desc.checked; renderResults(); });

    refs.filterCount = h("span", { class: "badge" });
    const details = h("details", { class: "filters", open: filtersOpen },
      h("summary", null, "絞り込み・並べ替え ", refs.filterCount),
      h("div", { class: "filter-grid" },
        field("文明",
          toggleChips(settings.civs, filters.civs, changed, { civ: true }),
          select(filters.civMode, [["any", "どれか含む"], ["all", "すべて含む"]], (v) => { filters.civMode = v; changed(); }, "文明の条件")),
        field("区分", select(filters.kind, [...all, ...listOptions(settings.kinds), [NONE, "（なし）"]], (v) => { filters.kind = v; changed(); }, "区分")),
        field("属性", select(filters.attr, [...all, ...listOptions(settings.attributes)], (v) => { filters.attr = v; changed(); }, "属性")),
        field("役割", select(filters.role, [...all, ...listOptions(settings.roles)], (v) => { filters.role = v; changed(); }, "役割")),
        field("コスト", h("div", { class: "inline range" }, costInput("costMin"), "〜", costInput("costMax"))),
        Object.entries(cubes).map(([id, cube]) => field(cube.name,
          select(filters.cube[id] ?? "", [...all, ["in", "入っている"], ["out", "入っていない"]], (v) => { filters.cube[id] = v; changed(); }, cube.name))),
        field("本物／プロキシ", select(filters.proxy, [...all, ["real", "本物だけ"], ["proxy", "プロキシだけ"]], (v) => { filters.proxy = v; changed(); }, "本物／プロキシ")),
        field("残り", h("label", { class: "check" }, minus, "マイナス（足りない）だけ")),
        field("並べ替え", h("div", { class: "inline" }, refs.sort, h("label", { class: "check" }, refs.desc, "逆順"))),
        field("表の列", columnChooser()),
      ),
      h("div", { class: "buttons" },
        h("button", { type: "button", class: "sub small", onclick: clearFilters }, "絞り込みを解除"),
        h("button", { type: "button", class: "sub small", onclick: () => { details.open = false; } }, "閉じる")));
    details.addEventListener("toggle", () => { filtersOpen = details.open; });

    const node = h("div", null,
      h("div", { class: "search-bar" }, search,
        h("div", { class: "segmented", role: "group", "aria-label": "表示の切り替え" }, refs.viewButtons.cards, refs.viewButtons.table)),
      details);
    refreshFilterCount();
    return node;
  }

  function viewButton(value, label) {
    const btn = h("button", { type: "button", "aria-pressed": String(mode === value) }, label);
    btn.addEventListener("click", () => {
      mode = value;
      savePref("searchView", mode);
      for (const [v, b] of Object.entries(refs.viewButtons)) b.setAttribute("aria-pressed", String(v === mode));
      renderResults();
    });
    return btn;
  }

  function columnChooser() {
    return h("div", { class: "chips" }, columns(current.state.data).filter((c) => !c.fixed).map((c) => {
      const box = h("input", { type: "checkbox" });
      box.checked = !hiddenCols.has(c.key);
      box.addEventListener("change", () => {
        if (box.checked) hiddenCols.delete(c.key);
        else hiddenCols.add(c.key);
        savePref("searchHiddenColumns", [...hiddenCols]);
        renderResults();
      });
      return h("label", { class: "check" }, box, c.label);
    }));
  }

  function clearFilters() {
    const { q, sort, desc } = filters;
    Object.assign(filters, blankFilters(), { q, sort, desc });
    controls.replaceChildren(buildControls());
    changed();
  }

  function refreshFilterCount() {
    if (!refs.filterCount) return;
    const n = [
      filters.civs.size > 0, filters.kind, filters.attr, filters.role, filters.costMin !== "" || filters.costMax !== "",
      ...Object.values(filters.cube), filters.proxy, filters.minus,
    ].filter(Boolean).length;
    refs.filterCount.textContent = n ? `${n} 件の条件` : "";
    refs.filterCount.hidden = !n;
  }

  // ---- 結果 ----

  function renderResults() {
    const data = current.state.data;
    const rows = computeRows(data);
    const shown = rows.slice(0, limit);
    summary.textContent = rows.length === data.cards.length
      ? `${rows.length} 件`
      : `${rows.length} 件（全 ${data.cards.length} 件中）`;

    if (!rows.length) {
      results.replaceChildren(h("p", { class: "muted" }, data.cards.length
        ? "条件に合うカードがありません。"
        : current.admin ? "まだ所持カードがありません。右下の「＋ 登録」から登録できます。" : "まだ所持カードがありません。"));
    } else {
      results.replaceChildren(mode === "table" ? tableView(shown, data) : cardsView(shown, data));
    }

    more.replaceChildren(rows.length > limit
      ? h("button", { type: "button", class: "sub", onclick: () => { limit += PAGE; renderResults(); } },
        `もっと見る（あと ${rows.length - limit} 件）`)
      : "");
  }

  function setSort(key) {
    if (filters.sort === key) filters.desc = !filters.desc;
    else Object.assign(filters, { sort: key, desc: false });
    refs.sort.value = filters.sort;
    refs.desc.checked = filters.desc;
    renderResults();
  }

  function cardsView(rows, data) {
    return h("div", { class: "card-grid" }, rows.map(({ card, use }) =>
      h("article", {
        class: "card-tile",
        onclick: (e) => { if (!e.target.closest("button, a")) location.hash = `#/card/${card.no}`; },
      },
      h("div", { class: "tile-top" },
        h("span", null, `No.${card.no}`),
        card.proxy ? proxyBadge() : null,
        h("span", { class: "cost" }, `コスト ${costText(card)}`)),
      h("a", { class: "tile-name", href: `#/card/${card.no}` }, card.name),
      h("div", { class: "tile-row" }, civChips(card.civs), card.kind ? h("span", { class: "muted" }, card.kind) : null),
      card.attrs.length || card.roles.length
        ? h("div", { class: "tile-row" }, chips(card.attrs), chips(card.roles, "role"))
        : null,
      h("div", { class: "tile-bottom" },
        h("span", null, `所持 ${card.owned}`),
        remainingText(use.remaining),
        cubeMarks(use, data),
        current.admin ? ownedButtons(card) : null))));
  }

  function tableView(rows, data) {
    const cols = columns(data).filter((c) => c.fixed || !hiddenCols.has(c.key));
    const head = h("tr", null,
      cols.map((c) => h("th", { scope: "col", class: c.class },
        c.sort
          ? h("button", { type: "button", class: "th-sort", onclick: () => setSort(c.sort) }, c.label, sortMark(c.sort))
          : c.label)),
      current.admin ? h("th", { scope: "col" }, "枚数") : null);
    const body = rows.map((r) => h("tr", null,
      cols.map((c) => h("td", { class: c.class }, c.cell(r))),
      current.admin ? h("td", null, ownedButtons(r.card)) : null));
    return h("div", { class: "table-wrap tall" },
      h("table", { class: "grid" }, h("thead", null, head), h("tbody", null, body)));
  }

  function sortMark(key) {
    return filters.sort === key ? (filters.desc ? " ▼" : " ▲") : "";
  }

  update(ctx);
  return { update };
}

// ---- 絞り込みと並べ替え（画面の状態から行を作る） ----

function computeRows(data) {
  const index = cubeIndex(data.cubes);
  const q = nameKey(filters.q).toLowerCase();
  const qNo = /^\d+$/.test(q) ? Number(q) : null;
  const min = filters.costMin === "" ? null : Number(filters.costMin);
  const max = filters.costMax === "" ? null : Number(filters.costMax);

  const rows = [];
  for (const card of data.cards) {
    if (q && card.no !== qNo && !nameKey(card.name).toLowerCase().includes(q)) continue;
    if (filters.proxy === "real" && card.proxy) continue;
    if (filters.proxy === "proxy" && !card.proxy) continue;
    if (filters.civs.size) {
      const hits = [...filters.civs].filter((c) => card.civs.includes(c)).length;
      if (filters.civMode === "all" ? hits < filters.civs.size : hits === 0) continue;
    }
    if (filters.kind && (filters.kind === NONE ? card.kind !== "" : card.kind !== filters.kind)) continue;
    if (filters.attr && !card.attrs.includes(filters.attr)) continue;
    if (filters.role && !card.roles.includes(filters.role)) continue;
    if (min !== null || max !== null) {
      const costs = [card.cost, card.cost2].filter((c) => c != null);
      if (!costs.some((c) => (min === null || c >= min) && (max === null || c <= max))) continue;
    }
    const use = cardUse(card, index);
    if (Object.entries(filters.cube).some(([id, v]) => (v === "in" && !use.byCube[id]) || (v === "out" && use.byCube[id]))) continue;
    if (filters.minus && use.remaining >= 0) continue;
    rows.push({ card, use });
  }

  const value = {
    no: (r) => r.card.no,
    name: (r) => r.card.name,
    cost: (r) => r.card.cost,
    owned: (r) => r.card.owned,
    remaining: (r) => r.use.remaining,
  }[filters.sort] ?? ((r) => r.card.no);
  const dir = filters.desc ? -1 : 1;
  rows.sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (x == null || y == null) return (x == null) - (y == null) || a.card.no - b.card.no;
    const c = typeof x === "string" ? x.localeCompare(y, "ja") : x - y;
    return c * dir || a.card.no - b.card.no;
  });
  return rows;
}

// ---- 表示の部品 ----

function columns(data) {
  return [
    { key: "no", label: "No.", class: "col-no num", sort: "no", fixed: true, cell: (r) => r.card.no },
    { key: "name", label: "名前", class: "col-name", sort: "name", fixed: true,
      cell: (r) => [h("a", { href: `#/card/${r.card.no}` }, r.card.name), r.card.proxy ? [" ", proxyBadge()] : null] },
    { key: "cost", label: "コスト", class: "num", sort: "cost", cell: (r) => costText(r.card) },
    { key: "kind", label: "区分", cell: (r) => r.card.kind },
    { key: "civs", label: "文明", cell: (r) => civChips(r.card.civs) },
    { key: "attrs", label: "属性", cell: (r) => chips(r.card.attrs) },
    { key: "roles", label: "役割", cell: (r) => chips(r.card.roles, "role") },
    { key: "owned", label: "所持", class: "num", sort: "owned", cell: (r) => r.card.owned },
    { key: "remaining", label: "残り", class: "num", sort: "remaining", cell: (r) => remainingText(r.use.remaining, false) },
    ...Object.entries(data.cubes).map(([id, cube]) => ({
      key: `cube:${id}`, label: cube.name, cell: (r) => (r.use.byCube[id] ? "✓" : "—"),
    })),
    { key: "memo", label: "メモ", class: "col-memo", cell: (r) => r.card.memo },
  ];
}

function remainingText(n, withLabel = true) {
  const text = withLabel ? `残り ${n}` : String(n);
  return n < 0 ? h("span", { class: "minus" }, `${text}（足りない）`) : h("span", null, text);
}

function cubeMarks(use, data) {
  return h("span", { class: "chips" }, Object.entries(data.cubes).map(([id, cube]) =>
    h("span", { class: use.byCube[id] ? "cube-mark in" : "cube-mark", title: cube.name },
      `${id} ${use.byCube[id] ? "✓" : "—"}`)));
}

function ownedButtons(card) {
  const minus = h("button", {
    type: "button", class: "sub small", disabled: card.owned <= 0, "aria-label": `No.${card.no} の枚数を 1 減らす`,
  }, "−1");
  const plus = h("button", { type: "button", class: "sub small", "aria-label": `No.${card.no} の枚数を 1 増やす` }, "+1");
  minus.addEventListener("click", () => changeOwned("cards", card, -1).catch(() => {}));
  plus.addEventListener("click", () => changeOwned("cards", card, 1).catch(() => {}));
  return h("span", { class: "stepper" }, minus, plus);
}
