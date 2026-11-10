// カード一覧（メインデッキ／超次元／GR）とキューブの一覧。SPEC.md 5-2b・5-5。検索画面（横断検索）の結果の表示にも使う。
// ledger（cards／hypers／gr）で対象の台帳を切り替える。cubeId を渡すと、そのキューブに入れた ledger のリストだけを出す。
import { h, toggleChips, civChips, chips, costText, kindText, proxyBadge, loadPref, savePref } from "../ui.js";
import { nameKey } from "../store.js";
import { LEDGERS, LEDGER_LABELS, KIND_SETTING } from "../model.js";
import { ledgerUse, cubeProblems } from "../calc.js";
import { changeOwned } from "../actions.js";
import { openCardForm } from "./cardForm.js";
import { openBulkForm } from "./bulkForm.js";
import { cubeControl, openCubeMenu, editCardMemo, hyperLinkChips, parentChips } from "./cubeOps.js";
import { openHyperPicker } from "./hyperPicker.js";

const PAGE = 100;
const NONE = "__none__";
const SORTS = { no: "番号", name: "名前", cost: "コスト", owned: "所持枚数", used: "使用数", remaining: "残り" };
const DETAIL_ROUTE = { cards: "card", hypers: "hyper", gr: "gr" };

// 絞り込みの状態は、台帳とキューブごとに別々に覚える（画面を離れても残る）
const scopes = new Map();
function scopeState(key) {
  if (!scopes.has(key)) scopes.set(key, { filters: blankFilters(), limit: PAGE, filtersOpen: false });
  return scopes.get(key);
}
let mode = loadPref("searchView", "cards");

// 表示（カード／表）の切り替えは、カード一覧と検索で共通
export function getViewMode() {
  return mode;
}
// 画面にある一覧すべての描き直し（表示の切り替えを、同じ画面の別の一覧にも反映する）
const viewListeners = new Set();
export function setViewMode(value) {
  mode = value;
  savePref("searchView", mode);
  for (const l of viewListeners) {
    if (l.el.isConnected) l.run();
    else viewListeners.delete(l);
  }
}

// 表の列は台帳ごとに覚える。初めは数字を中心に、区分・属性・役割・メモなどは「表の列」で出せる
const DEFAULT_HIDDEN = {
  cards: ["kind", "attrs", "roles", "memo", "cubeMemo"],
  hypers: ["attrs", "roles", "back", "memo", "cubeMemo"],
  gr: ["roles", "memo", "cubeMemo"],
};
const hiddenByLedger = {};
function hiddenColsFor(ledger) {
  hiddenByLedger[ledger] ??= new Set(loadPref(`searchHiddenColumns3.${ledger}`, DEFAULT_HIDDEN[ledger]));
  return hiddenByLedger[ledger];
}

export function blankFilters() {
  return {
    q: "", civs: new Set(), civMode: "any", kind: "", attr: "", role: "",
    costMin: "", costMax: "", cube: {}, proxy: "", minus: false, sort: "no", desc: false,
  };
}

// filters：外から渡す共通の絞り込み状態（検索画面用）。controls: false なら検索欄・絞り込みを出さない。
// heading：見出し付き（「メインデッキ（3 件）」）。active()：false の間は結果を描かない（検索の条件が空のとき）。
// onSort：表の見出しで並べ替えを変えたときに呼ぶ（検索画面が、並べ替えの表示と他の台帳の結果を更新する）。
export function mount(el, ctx, {
  ledger = "cards", cubeId = null, switcher = true, filters: sharedFilters = null, controls: showControls = true,
  heading = false, active = () => true, onSort = null,
} = {}) {
  const st = sharedFilters
    ? { filters: sharedFilters, limit: PAGE, filtersOpen: false }
    : scopeState(`${ledger}|${cubeId ?? ""}`);
  const filters = st.filters;
  const hiddenCols = hiddenColsFor(ledger);
  let current = ctx;
  let controlsKey = "";
  const refs = {};
  const controls = h("div");
  const summary = h("p", { class: "muted result-count" });
  const headingEl = h("h2", { class: "list-heading" });
  const results = h("div");
  const more = h("div", { class: "more" });
  let lastCount = 0;
  viewListeners.add({ el, run: () => renderResults() });
  if (!cubeId && switcher) el.append(ledgerSwitch(ledger));
  if (heading) el.append(headingEl);
  el.append(controls, summary, results, more);
  if (ctx.admin && !cubeId && showControls) {
    el.append(h("div", { class: "fab-group" },
      h("button", { class: "sub", onclick: () => openBulkForm({ ledger }) }, "まとめて登録"),
      h("button", { onclick: () => openCardForm({ ledger }) }, "＋ 登録")));
  }

  function update(next) {
    current = next;
    if (showControls) {
      const { settings, cubes } = next.state.data;
      const key = JSON.stringify([settings, Object.entries(cubes).map(([id, c]) => [id, c.name])]);
      if (key !== controlsKey) {
        controlsKey = key;
        controls.replaceChildren(buildControls());
      }
    }
    renderResults();
  }

  const changed = () => {
    st.limit = PAGE;
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
    const field = (label, ...children) => h("div", { class: "field" }, h("span", { class: "label" }, label), ...children);

    const costInput = (key) => {
      const input = h("input", { type: "number", inputmode: "numeric", min: 0, value: filters[key], "aria-label": key === "costMin" ? "コストの下限" : "コストの上限" });
      input.addEventListener("input", () => { filters[key] = input.value; changed(); });
      return input;
    };

    const minus = h("input", { type: "checkbox" });
    minus.checked = filters.minus;
    minus.addEventListener("change", () => { filters.minus = minus.checked; changed(); });

    const sorts = Object.entries(SORTS);
    refs.sort = select(filters.sort, sorts, (v) => { filters.sort = v; renderResults(); }, "並べ替え");
    refs.desc = h("input", { type: "checkbox" });
    refs.desc.checked = filters.desc;
    refs.desc.addEventListener("change", () => { filters.desc = refs.desc.checked; renderResults(); });

    refs.filterCount = h("span", { class: "badge" });
    const details = h("details", { class: "filters", open: st.filtersOpen },
      h("summary", null, "絞り込み・並べ替え ", refs.filterCount),
      h("div", { class: "filter-grid" },
        field("文明",
          toggleChips(settings.civs, filters.civs, changed, { civ: true }),
          select(filters.civMode, [["any", "どれか含む"], ["all", "すべて含む"]], (v) => { filters.civMode = v; changed(); }, "文明の条件")),
        field("区分", select(filters.kind, [...all, ...listOptions(settings[KIND_SETTING[ledger]]), [NONE, "（なし）"]], (v) => { filters.kind = v; changed(); }, "区分")),
        field("属性", select(filters.attr, [...all, ...listOptions(settings.attributes)], (v) => { filters.attr = v; changed(); }, "属性")),
        field("役割", select(filters.role, [...all, ...listOptions(settings.roles)], (v) => { filters.role = v; changed(); }, "役割")),
        field("コスト", h("div", { class: "inline range" }, costInput("costMin"), "〜", costInput("costMax"))),
        cubeId ? null : Object.entries(cubes).map(([id, cube]) => field(cube.name,
          select(filters.cube[id] ?? "", [...all, ["in", "入っている"], ["out", "入っていない"]], (v) => { filters.cube[id] = v; changed(); }, cube.name))),
        field("本物／プロキシ", select(filters.proxy, [...all, ["real", "本物だけ"], ["proxy", "プロキシだけ"]], (v) => { filters.proxy = v; changed(); }, "本物／プロキシ")),
        field("残り", h("label", { class: "check" }, minus, "マイナス（足りない）だけ")),
        field("並べ替え", h("div", { class: "inline" }, refs.sort, h("label", { class: "check" }, refs.desc, "逆順"))),
        field("表の列", columnChooser()),
      ),
      h("div", { class: "buttons" },
        h("button", { type: "button", class: "sub small", onclick: clearFilters }, "絞り込みを解除"),
        h("button", { type: "button", class: "sub small", onclick: () => { details.open = false; } }, "閉じる")));
    details.addEventListener("toggle", () => { st.filtersOpen = details.open; });

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
      for (const [v, b] of Object.entries(refs.viewButtons)) b.setAttribute("aria-pressed", String(v === value));
      setViewMode(value);
    });
    return btn;
  }

  function columnChooser() {
    return h("div", { class: "chips" }, columns(current.state.data, ledger, cubeId).filter((c) => !c.fixed).map((c) => {
      const box = h("input", { type: "checkbox" });
      box.checked = !hiddenCols.has(c.key);
      box.addEventListener("change", () => {
        if (box.checked) hiddenCols.delete(c.key);
        else hiddenCols.add(c.key);
        savePref(`searchHiddenColumns3.${ledger}`, [...hiddenCols]);
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
    if (!active()) {
      lastCount = 0;
      headingEl.textContent = "";
      summary.textContent = "";
      results.replaceChildren();
      more.replaceChildren();
      return;
    }
    const data = current.state.data;
    const { rows, base } = computeRows(data, filters, ledger, cubeId);
    lastCount = rows.length;
    const shown = rows.slice(0, st.limit);
    headingEl.textContent = `${LEDGER_LABELS[ledger]}（${rows.length} 件）`;
    summary.textContent = heading ? "" : (rows.length === base ? `${rows.length} 件` : `${rows.length} 件（全 ${base} 件中）`);

    if (!rows.length) {
      results.replaceChildren(h("p", { class: "muted" }, heading ? "該当なし" : emptyText(base)));
    } else {
      results.replaceChildren(mode === "table" ? tableView(shown, data) : cardsView(shown, data));
    }

    more.replaceChildren(rows.length > st.limit
      ? h("button", { type: "button", class: "sub", onclick: () => { st.limit += PAGE; renderResults(); } },
        `もっと見る（あと ${rows.length - st.limit} 件）`)
      : "");
  }

  function emptyText(base) {
    if (base) return "条件に合うカードがありません。";
    const label = LEDGER_LABELS[ledger];
    if (cubeId) {
      return current.admin ? `まだ${label}が入っていません。上の「＋ ${label}を入れる」から入れられます。` : `まだ${label}が入っていません。`;
    }
    return current.admin
      ? `まだ${label}がありません。右下の「＋ 登録」で、登録先に「${label}」を選んで登録できます。`
      : `まだ${label}がありません。`;
  }

  function setSort(key) {
    if (filters.sort === key) filters.desc = !filters.desc;
    else Object.assign(filters, { sort: key, desc: false });
    if (refs.sort) refs.sort.value = filters.sort;
    if (refs.desc) refs.desc.checked = filters.desc;
    renderResults();
    onSort?.();
  }

  // 管理者向けの操作。キューブの出し入れは「キューブ…」の画面にまとめる
  const cubeMenuButton = (card) => h("button", { type: "button", class: "sub small", onclick: () => openCubeMenu(ledger, card.no) }, "キューブ…");

  // キューブ画面の行：そのキューブの「− ×枚数 ＋」、メインデッキで超次元を使うキューブなら「＋ 超次元」、メモ
  function cubeRowControls(card, data) {
    const cube = data.cubes[cubeId];
    return h("span", { class: "row-ctls" },
      cubeControl(cubeId, cube, ledger, card, { name: false }),
      ledger === "cards" && cube.usesHyper !== false
        ? h("button", { type: "button", class: "sub small", onclick: () => openHyperPicker(cubeId, card.no) }, "＋ 超次元")
        : null,
      h("button", { type: "button", class: "sub small", onclick: () => editCardMemo(cubeId, ledger, card) }, "メモ"));
  }

  function rowControls(card, data) {
    if (!current.admin) return null;
    if (cubeId) return cubeRowControls(card, data);
    return h("span", { class: "row-ctls" }, ownedButtons(ledger, card), cubeMenuButton(card));
  }

  function cardsView(rows, data) {
    return h("div", { class: "card-grid" }, rows.map((row) => {
      const { card, use, entry } = row;
      const cube = cubeId ? data.cubes[cubeId] : null;
      // キューブ画面：メインデッキには付いている超次元、超次元には呼んでいる付属先を出す
      const links = !cube ? null
        : ledger === "cards" && cube.usesHyper !== false ? hyperLinkChips(data, cubeId, card, current.admin)
          : ledger === "hypers" ? parentChips(data, cubeId, card, current.admin) : null;
      const cubeInfo = entry
        ? [entry.count > 1 ? h("span", null, `${entry.count} 枚`) : null,
          entry.memo ? h("span", { class: "muted ellipsis" }, `メモ：${entry.memo}`) : null,
          problemText(row.problems)].filter(Boolean)
        : [];
      const detail = `#/${DETAIL_ROUTE[ledger]}/${card.no}`;
      return h("article", {
        class: `card-tile${use.remaining < 0 ? " short" : ""}`,
        onclick: (e) => { if (!e.target.closest("button, a")) location.hash = detail; },
      },
      h("div", { class: "tile-top" },
        h("span", null, `No.${card.no}`),
        card.proxy ? proxyBadge() : null,
        h("span", { class: "cost" }, `コスト ${costText(card)}`)),
      h("a", { class: "tile-name", href: detail }, card.name),
      h("div", { class: "tile-row" },
        civChips(card.civs),
        kindText(card) ? h("span", { class: "muted" }, kindText(card)) : null,
        chips(card.attrs), chips(card.roles, "role")),
      ledger === "hypers" && card.back ? h("div", { class: "tile-row muted" }, `裏面：${card.back}`) : null,
      cubeInfo.length ? h("div", { class: "tile-row" }, cubeInfo) : null,
      links,
      h("div", { class: "tile-bottom" },
        h("span", null, `所持 ${card.owned}`),
        h("span", null, `使用 ${use.used}`),
        remainingText(use.remaining)),
      rowControls(card, data));
    }));
  }

  function tableView(rows, data) {
    const cols = columns(data, ledger, cubeId, current.admin).filter((c) => c.fixed || !hiddenCols.has(c.key));
    const showOps = current.admin;
    const head = h("tr", null,
      cols.map((c) => h("th", { scope: "col", class: c.class },
        c.sort
          ? h("button", { type: "button", class: "th-sort", onclick: () => setSort(c.sort) }, c.label, sortMark(c.sort))
          : c.label)),
      showOps ? h("th", { scope: "col" }, cubeId ? "操作" : "キューブ") : null);
    const body = rows.map((r) => h("tr", { class: r.use.remaining < 0 ? "short" : null },
      cols.map((c) => h("td", { class: c.class }, c.cell(r, data))),
      showOps ? h("td", null, cubeId ? cubeRowControls(r.card, data) : cubeMenuButton(r.card)) : null));
    return h("div", { class: "table-wrap tall" },
      h("table", { class: "grid" }, h("thead", null, head), h("tbody", null, body)));
  }

  function sortMark(key) {
    return filters.sort === key ? (filters.desc ? " ▼" : " ▲") : "";
  }

  update(ctx);
  return { update, refresh: renderResults, count: () => lastCount };
}

// メインデッキ／超次元／GR の切り替え（URL で開ける）
function ledgerSwitch(ledger) {
  return h("nav", { class: "segmented ledger-switch", "aria-label": "検索の対象" },
    LEDGERS.map((l) => h("a", {
      href: l === "cards" ? "#/list" : `#/list/${l}`,
      "aria-current": l === ledger ? "page" : null,
    }, LEDGER_LABELS[l])));
}

// ---- 絞り込みと並べ替え（画面の状態から行を作る） ----

// base＝絞り込む前の件数（キューブ画面ではそのキューブに入っている種類数）
function computeRows(data, filters, ledger, cubeId) {
  const cube = cubeId ? data.cubes[cubeId] : null;
  if (cubeId && !cube) return { rows: [], base: 0 };
  const entries = cube ? new Map((cube[ledger] ?? []).map((c) => [c.no, c])) : null;
  const problems = new Map();
  if (cubeId) {
    for (const p of cubeProblems(data, cubeId)) if (p.ledger === ledger) problems.set(p.no, [...(problems.get(p.no) ?? []), p.type]);
  }

  const q = nameKey(filters.q).toLowerCase();
  const qNo = /^\d+$/.test(q) ? Number(q) : null;
  const min = filters.costMin === "" ? null : Number(filters.costMin);
  const max = filters.costMax === "" ? null : Number(filters.costMax);

  let base = 0;
  const rows = [];
  for (const card of data[ledger]) {
    const entry = entries?.get(card.no) ?? null;
    if (entries && !entry) continue;
    base++;
    if (q && card.no !== qNo && !nameKey(card.name).toLowerCase().includes(q)) continue;
    if (filters.proxy === "real" && card.proxy) continue;
    if (filters.proxy === "proxy" && !card.proxy) continue;
    if (filters.civs.size) {
      const hits = [...filters.civs].filter((c) => card.civs.includes(c)).length;
      if (filters.civMode === "all" ? hits < filters.civs.size : hits === 0) continue;
    }
    // 区分は、超次元なら 3 面のどれかが一致すれば合格
    const kinds = [card.kind, card.kind2, card.kind3].filter(Boolean);
    if (filters.kind && (filters.kind === NONE ? kinds.length > 0 : !kinds.includes(filters.kind))) continue;
    if (filters.attr && !card.attrs.includes(filters.attr)) continue;
    if (filters.role && !card.roles.includes(filters.role)) continue;
    if (min !== null || max !== null) {
      const costs = [card.cost, card.cost2, card.cost3].filter((c) => c != null);
      if (!costs.some((c) => (min === null || c >= min) && (max === null || c <= max))) continue;
    }
    const use = ledgerUse(card, data.cubes, ledger);
    if (!cubeId && Object.entries(filters.cube).some(([id, v]) => (v === "in" && !use.byCube[id]) || (v === "out" && use.byCube[id]))) continue;
    if (filters.minus && use.remaining >= 0) continue;
    rows.push({ card, use, entry, problems: problems.get(card.no) ?? [] });
  }

  const value = {
    no: (r) => r.card.no,
    name: (r) => r.card.name,
    cost: (r) => r.card.cost,
    owned: (r) => r.card.owned,
    used: (r) => r.use.used,
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
  return { rows, base };
}

// ---- 表示の部品 ----

function columns(data, ledger, cubeId, admin = false) {
  const route = DETAIL_ROUTE[ledger];
  return [
    { key: "no", label: "No.", class: "col-no num", sort: "no", fixed: true, cell: (r) => r.card.no },
    { key: "name", label: "名前", class: "col-name", sort: "name", fixed: true,
      cell: (r) => [h("a", { href: `#/${route}/${r.card.no}` }, r.card.name), r.card.proxy ? [" ", proxyBadge()] : null, problemText(r.problems)] },
    { key: "cost", label: "コスト", class: "num", sort: "cost", cell: (r) => costText(r.card) },
    { key: "kind", label: "区分", cell: (r) => kindText(r.card) },
    { key: "civs", label: "文明", cell: (r) => civChips(r.card.civs) },
    { key: "attrs", label: "属性", cell: (r) => chips(r.card.attrs) },
    { key: "roles", label: "役割", cell: (r) => chips(r.card.roles, "role") },
    ...(ledger === "hypers" ? [{ key: "back", label: "裏面", cell: (r) => r.card.back }] : []),
    ...(cubeId ? [{ key: "count", label: "枚数", class: "num", cell: (r) => r.entry.count }] : []),
    { key: "owned", label: "所持", class: "num", sort: "owned",
      cell: (r) => (admin && !cubeId ? ownedInline(ledger, r.card) : r.card.owned) },
    { key: "used", label: "使用", class: "num", sort: "used", cell: (r) => r.use.used },
    { key: "remaining", label: "残り", class: "num", sort: "remaining", cell: (r) => remainingText(r.use.remaining, false) },
    ...(cubeId ? [{ key: "cubeMemo", label: "キューブのメモ", class: "col-memo", cell: (r) => r.entry.memo }] : []),
    { key: "memo", label: "メモ", class: "col-memo", cell: (r) => r.card.memo },
  ];
}

function remainingText(n, withLabel = true) {
  const text = withLabel ? `残り ${n}` : String(n);
  return n < 0 ? h("span", { class: "minus" }, `${text}（足りない）`) : h("span", null, text);
}

function problemText(types) {
  if (!types?.length) return null;
  const parts = [types.includes("count") ? "複数枚" : null, types.includes("name") ? "同名が複数" : null].filter(Boolean);
  return h("span", { class: "minus", title: "同名カードは 1 枚だけのモードです" }, ` ⚠ ${parts.join("・")}`);
}

// 表の所持のセル：「− 2 ＋」
function ownedInline(ledger, card) {
  const minus = h("button", { type: "button", class: "sub small", disabled: card.owned <= 0, "aria-label": `No.${card.no} の所持を 1 減らす` }, "−");
  const plus = h("button", { type: "button", class: "sub small", "aria-label": `No.${card.no} の所持を 1 増やす` }, "＋");
  minus.addEventListener("click", () => changeOwned(ledger, card, -1).catch(() => {}));
  plus.addEventListener("click", () => changeOwned(ledger, card, 1).catch(() => {}));
  return h("span", { class: "owned-inline" }, minus, h("span", { class: "owned-num" }, String(card.owned)), plus);
}

function ownedButtons(ledger, card) {
  const minus = h("button", {
    type: "button", class: "sub small", disabled: card.owned <= 0, "aria-label": `No.${card.no} の所持を 1 減らす`,
  }, "所持−1");
  const plus = h("button", { type: "button", class: "sub small", "aria-label": `No.${card.no} の所持を 1 増やす` }, "所持+1");
  minus.addEventListener("click", () => changeOwned(ledger, card, -1).catch(() => {}));
  plus.addEventListener("click", () => changeOwned(ledger, card, 1).catch(() => {}));
  return h("span", { class: "stepper" }, minus, plus);
}
