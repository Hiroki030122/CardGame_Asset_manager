// 検索（ホーム）。SPEC.md 5-2。メインデッキ・超次元・GR をまとめて検索する。条件が空のあいだは一覧を出さない。
// 結果は台帳ごとに見出しを分けて、条件に合うものだけを並べる（表示は cardList.js と同じ部品）。
import { h, toggleChips, loadPref } from "../ui.js";
import { LEDGERS, KIND_SETTING, LEDGER_LABELS } from "../model.js";
import { hasSearchCondition } from "../calc.js";
import { openCardForm } from "./cardForm.js";
import { openBulkForm } from "./bulkForm.js";
import * as cardList from "./cardList.js";

const SORTS = { no: "番号", name: "名前", cost: "コスト", owned: "所持枚数", used: "使用数", remaining: "残り" };
const NONE = "__none__";

// 検索の条件は、画面を離れても残す
const filters = cardList.blankFilters();

export function mount(el, ctx) {
  let current = ctx;
  let controlsKey = "";
  const refs = {};
  const controls = h("div");
  const hint = h("p", { class: "muted search-hint" }, "名前や条件を入れると、メインデッキ・超次元・GR をまとめて検索します。");
  const resultsWrap = h("div", { class: "search-results" });
  const active = () => hasSearchCondition(filters);

  // 台帳ごとの結果。同じ filters を共有して描く
  const lists = LEDGERS.map((ledger) => {
    const host = h("section", { class: "search-group" });
    const api = cardList.mount(host, ctx, {
      ledger, filters, controls: false, heading: true, switcher: false, active,
      onSort: () => { syncSort(); refreshAll(); },
    });
    resultsWrap.append(host);
    return api;
  });

  el.append(controls, hint, resultsWrap);
  if (ctx.admin) {
    el.append(h("div", { class: "fab-group" },
      h("button", { class: "sub", onclick: () => openBulkForm({}) }, "まとめて登録"),
      h("button", { onclick: () => openCardForm({}) }, "＋ 登録")));
  }

  function refreshAll() {
    const on = active();
    hint.hidden = on;
    resultsWrap.hidden = !on;
    refreshFilterCount();
    for (const l of lists) l.refresh();
  }

  function syncSort() {
    if (refs.sort) refs.sort.value = filters.sort;
    if (refs.desc) refs.desc.checked = filters.desc;
  }

  function update(next) {
    current = next;
    const { settings } = next.state.data;
    const key = JSON.stringify(settings);
    if (key !== controlsKey) {
      controlsKey = key;
      controls.replaceChildren(buildControls());
    }
    hint.hidden = active();
    resultsWrap.hidden = !active();
    for (const l of lists) l.update(next);
  }

  function buildControls() {
    const { settings } = current.state.data;
    const select = (value, options, onChange, label) => {
      const s = h("select", { "aria-label": label }, options);
      s.value = value;
      s.addEventListener("change", () => onChange(s.value));
      return s;
    };
    const opt = (v, text) => h("option", { value: v }, text);
    const all = [opt("", "すべて")];
    const field = (label, ...children) => h("div", { class: "field" }, h("span", { class: "label" }, label), ...children);

    const search = h("input", { type: "search", value: filters.q, placeholder: "名前の一部、または番号", "aria-label": "検索" });
    search.addEventListener("input", () => { filters.q = search.value; refreshAll(); });

    const costInput = (key) => {
      const input = h("input", { type: "number", inputmode: "numeric", min: 0, value: filters[key], "aria-label": key === "costMin" ? "コストの下限" : "コストの上限" });
      input.addEventListener("input", () => { filters[key] = input.value; refreshAll(); });
      return input;
    };

    const minus = h("input", { type: "checkbox" });
    minus.checked = filters.minus;
    minus.addEventListener("change", () => { filters.minus = minus.checked; refreshAll(); });

    refs.sort = select(filters.sort, Object.entries(SORTS).map(([k, v]) => opt(k, v)), (v) => { filters.sort = v; refreshAll(); }, "並べ替え");
    refs.desc = h("input", { type: "checkbox" });
    refs.desc.checked = filters.desc;
    refs.desc.addEventListener("change", () => { filters.desc = refs.desc.checked; refreshAll(); });

    // 区分は、3 つの台帳の区分の一覧をまとめて選べる
    const kindGroups = LEDGERS.map((l) => h("optgroup", { label: `${LEDGER_LABELS[l]}の区分` }, settings[KIND_SETTING[l]].map((k) => opt(k, k))));
    const kindSelect = select(filters.kind, [...all, ...kindGroups, opt(NONE, "（なし）")], (v) => { filters.kind = v; refreshAll(); }, "区分");

    refs.viewButtons = {
      cards: viewButton("cards", "カード"),
      table: viewButton("table", "表"),
    };
    refs.filterCount = h("span", { class: "badge" });

    const details = h("details", { class: "filters", open: loadPref("searchFiltersOpen", false) },
      h("summary", null, "絞り込み・並べ替え ", refs.filterCount),
      h("div", { class: "filter-grid" },
        field("文明",
          toggleChips(settings.civs, filters.civs, refreshAll, { civ: true }),
          select(filters.civMode, [opt("any", "どれか含む"), opt("all", "すべて含む")], (v) => { filters.civMode = v; refreshAll(); }, "文明の条件")),
        field("区分", kindSelect),
        field("属性", select(filters.attr, [...all, ...settings.attributes.map((v) => opt(v, v))], (v) => { filters.attr = v; refreshAll(); }, "属性")),
        field("役割", select(filters.role, [...all, ...settings.roles.map((v) => opt(v, v))], (v) => { filters.role = v; refreshAll(); }, "役割")),
        field("コスト", h("div", { class: "inline range" }, costInput("costMin"), "〜", costInput("costMax"))),
        field("本物／プロキシ", select(filters.proxy, [...all, opt("real", "本物だけ"), opt("proxy", "プロキシだけ")], (v) => { filters.proxy = v; refreshAll(); }, "本物／プロキシ")),
        field("残り", h("label", { class: "check" }, minus, "マイナス（足りない）だけ")),
        field("並べ替え", h("div", { class: "inline" }, refs.sort, h("label", { class: "check" }, refs.desc, "逆順")))),
      h("div", { class: "buttons" },
        h("button", { type: "button", class: "sub small", onclick: clearAll }, "条件をすべて解除"),
        h("button", { type: "button", class: "sub small", onclick: () => { details.open = false; } }, "閉じる")));

    const node = h("div", null,
      h("div", { class: "search-bar" }, search,
        h("div", { class: "segmented", role: "group", "aria-label": "表示の切り替え" }, refs.viewButtons.cards, refs.viewButtons.table)),
      details);
    refreshFilterCount();
    return node;
  }

  function viewButton(value, label) {
    const btn = h("button", { type: "button", "aria-pressed": String(cardList.getViewMode() === value) }, label);
    btn.addEventListener("click", () => {
      cardList.setViewMode(value);
      for (const [v, b] of Object.entries(refs.viewButtons)) b.setAttribute("aria-pressed", String(v === value));
      for (const l of lists) l.refresh();
    });
    return btn;
  }

  function clearAll() {
    Object.assign(filters, cardList.blankFilters());
    controls.replaceChildren(buildControls());
    refreshAll();
  }

  function refreshFilterCount() {
    if (!refs.filterCount) return;
    const n = [
      filters.civs.size > 0, filters.kind, filters.attr, filters.role, filters.costMin !== "" || filters.costMax !== "",
      filters.proxy, filters.minus,
    ].filter(Boolean).length;
    refs.filterCount.textContent = n ? `${n} 件の条件` : "";
    refs.filterCount.hidden = !n;
  }

  update(ctx);
  return { update };
}
