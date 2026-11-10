// 超次元の対応の表示部品。「超次元」ページと、各キューブの画面の「超次元の対応」で使う。
// 見方は2つ：「対応表示」（メインデッキのカードと超次元のカードを 1 組ずつ並べる）と、
// 「ドラフト時に入手できる超次元」（対応のあるメインデッキのカードごとに、付いてくる超次元をカードの形で並べる）。
import { h, costText, kindText, proxyBadge, loadPref, savePref, CIV_CLASSES } from "../ui.js";
import { nameKey } from "../store.js";
import { linkPairs, linksByHyper, linksByParent, linkSummary, cubeLinks } from "../calc.js";
import { removeHyperLink } from "./cubeOps.js";

// 小さなカード（2 枚を並べて「対応」を表す）。tag：「メインデッキ」「超次元」の見出し
function miniCard(item, { route, tag, count = 1, bad = "" }) {
  const strip = h("span", { class: "mini-strip" },
    (item.civs.length ? item.civs : [null]).map((c) => h("span", { class: `seg ${c ? CIV_CLASSES[c] ?? "" : "civ-zero"}` })));
  return h("a", { class: `mini-card${bad ? " bad" : ""}`, href: `#/${route}/${item.no}` },
    strip,
    h("span", { class: "mini-body" },
      h("span", { class: "mini-tag" }, tag, count > 1 ? ` ×${count}` : ""),
      h("span", { class: "mini-name" }, item.name, item.proxy ? [" ", proxyBadge()] : null),
      h("span", { class: "mini-meta" }, `コスト ${costText(item)}`, kindText(item) ? `・${kindText(item)}` : "", item.civs.length ? `・${item.civs.join("")}` : "・ゼロ文明"),
      bad ? h("span", { class: "mini-bad" }, bad) : null));
}

// cubeLink: true なら、「キューブの画面で付ける」へのリンクを出す
export function createLinkView({ cubeLink = false } = {}) {
  // 見方は端末に覚える（前の "hyper" は "pairs" として読む）。絞り込みは画面を開いている間だけ
  const saved = loadPref("linkViewMode", "pairs");
  const st = { mode: saved === "parent" ? "parent" : "pairs", q: "" };
  let current = null; // { data, cubeId, admin }

  const summary = h("div", { class: "link-summary" });
  const shortage = h("div", { class: "link-summary" });
  const rows = h("div", { class: "link-rows" });
  const orphans = h("div", { class: "link-orphans" });
  const note = h("p", { class: "muted" });

  const search = h("input", { type: "search", placeholder: "名前で絞り込む", "aria-label": "名前で絞り込む" });
  search.addEventListener("input", () => { st.q = search.value; renderRows(); });
  const modes = { pairs: h("button", { type: "button" }, "対応表示"), parent: h("button", { type: "button" }, "ドラフト時に入手できる超次元") };
  for (const [mode, btn] of Object.entries(modes)) {
    btn.addEventListener("click", () => {
      st.mode = mode;
      savePref("linkViewMode", mode);
      syncToolbar();
      renderRows();
    });
  }
  const toolbar = h("div", { class: "link-toolbar" },
    h("div", { class: "segmented", role: "group", "aria-label": "見方の切り替え" }, modes.pairs, modes.parent),
    search);
  const el = h("div", { class: "link-view" }, toolbar, summary, shortage, note, rows, orphans);

  function syncToolbar() {
    for (const [mode, btn] of Object.entries(modes)) btn.setAttribute("aria-pressed", String(st.mode === mode));
  }

  const matches = (name, no) => {
    const q = nameKey(st.q).toLowerCase();
    return !q || nameKey(name).toLowerCase().includes(q) || String(no) === q;
  };

  // 対応を 1 つ外す「−」（管理者のみ）
  function removeButton(label, link, hyperName) {
    if (!current.admin) return null;
    const btn = h("button", { type: "button", class: "chip-x pair-x", "aria-label": `${label}の対応を 1 つ外す` }, "−");
    btn.addEventListener("click", () => removeHyperLink(current.cubeId, link, hyperName));
    return btn;
  }

  // 対応表示：1 組ずつ、左にメインデッキ、右に超次元
  function pairRows(data, cubeId) {
    return linkPairs(data, cubeId)
      .filter((p) => matches(p.parentCard.name, p.parentCard.no) || matches(p.hyperItem.name, p.hyperItem.no))
      .map((p) => {
        const n = p.links.length;
        const label = `${p.parentCard.name}と${p.hyperItem.name}`;
        return h("div", { class: `pair-row${p.registered && p.hyperRegistered ? "" : " bad"}` },
          miniCard(p.parentCard, { route: "card", tag: "メインデッキ", count: n, bad: p.registered ? "" : "付属先がメインデッキに無い" }),
          miniCard(p.hyperItem, { route: "hyper", tag: "超次元", count: n, bad: p.hyperRegistered ? "" : "超次元がキューブに無い" }),
          removeButton(label, p.links[n - 1], p.hyperItem.name));
      });
  }

  // ドラフト時に入手できる超次元：対応のあるカードごとに、付いてくる超次元をカードの形で並べる
  function parentRows(data, cubeId) {
    return linksByParent(data, cubeId)
      .filter((x) => matches(x.card.name, x.card.no) || x.links.some((l) => matches(l.hyperItem.name, l.hyperItem.no)))
      .filter((x) => x.links.length > 0)
      .map((x) => {
        const groups = new Map();
        for (const l of x.links) groups.set(l.hyperItem.no, [...(groups.get(l.hyperItem.no) ?? []), l]);
        return h("article", { class: "parent-block" },
          miniCard(x.card, { route: "card", tag: x.count > 1 ? `メインデッキ ×${x.count}` : "メインデッキ" }),
          h("div", { class: "parent-hypers" }, [...groups].map(([, ls]) => h("div", { class: "hyper-slot" },
              miniCard(ls[0].hyperItem, { route: "hyper", tag: "超次元", count: ls.length, bad: ls[0].hyperRegistered ? "" : "超次元がキューブに無い" }),
              removeButton(ls[0].hyperItem.name, ls[ls.length - 1].link, ls[0].hyperItem.name)))));
      });
  }

  function renderSummary(data, cubeId) {
    const s = linkSummary(data, cubeId);
    const chip = (text, cls = "") => h("span", { class: `badge ${cls}` }, text);
    summary.replaceChildren(...[
      chip(`超次元 ${s.hyperKinds} 種類・${s.hyperCopies} 枚`),
      chip(`対応 ${s.links} 件`),
      s.uncovered > 0 ? chip(`対応が足りない超次元 ${s.uncovered} 枚`, "warn") : (s.hyperCopies > 0 && s.orphans === 0 ? chip("すべて対応済み", "ok") : null),
      s.orphans > 0 ? chip(`未登録の対応 ${s.orphans} 件`, "bad") : null,
    ].filter(Boolean));
    // どの超次元があと何枚足りないか
    const lacking = linksByHyper(data, cubeId).filter((x) => x.free > 0);
    shortage.replaceChildren(...lacking.map((x) => h("span", { class: "badge warn" }, `${x.hyper.name} あと ${x.free} 枚`)));
  }

  function renderRows() {
    if (!current) return;
    const { data, cubeId } = current;
    const list = st.mode === "pairs" ? pairRows(data, cubeId) : parentRows(data, cubeId);
    const cube = data.cubes[cubeId];
    if (list.length) {
      rows.replaceChildren(...list);
      return;
    }
    let message = "条件に合うものがありません。";
    if (st.mode === "pairs" && !(cube?.hyperLinks ?? []).length) {
      message = (cube?.hypers ?? []).length
        ? "まだ対応がありません。キューブの画面で、メインデッキのカードの「＋ 超次元」から付けられます。"
        : "このキューブには、まだ超次元が入っていません。キューブの画面の「超次元」の欄から入れてください。";
    } else if (st.mode === "parent" && !(cube?.hyperLinks ?? []).length) {
      message = "まだ対応がありません。キューブの画面で、メインデッキのカードの「＋ 超次元」から付けられます。";
    }
    rows.replaceChildren(h("p", { class: "muted" }, message));
  }

  function renderOrphans() {
    const { data, cubeId, admin } = current;
    const list = cubeLinks(data, cubeId).filter((l) => !l.registered || !l.hyperRegistered);
    if (!list.length) {
      orphans.replaceChildren();
      return;
    }
    orphans.replaceChildren(
      h("h3", { class: "sub-title" }, `未登録の対応（${list.length} 件）`),
      h("p", { class: "muted" }, "付属先のカードか超次元がこのキューブに入っていない対応です。外すか、入れ直してください。"),
      h("ul", { class: "cube-rows" }, list.map((l) => h("li", { class: "cube-row" },
        h("span", null, `${l.parentCard.name} と ${l.hyperItem.name}`),
        !l.registered ? h("span", { class: "minus" }, "付属先がメインデッキに無い") : null,
        !l.hyperRegistered ? h("span", { class: "minus" }, "超次元がキューブに無い") : null,
        l.memo ? h("span", { class: "muted" }, `メモ：${l.memo}`) : null,
        admin ? h("button", { type: "button", class: "sub small", onclick: () => removeHyperLink(cubeId, l, l.hyperItem.name) }, "外す") : null))));
  }

  syncToolbar();
  return {
    el,
    update(next) {
      current = next;
      note.replaceChildren(cubeLink
        ? h("a", { href: `#/cube/${next.cubeId}` }, `対応を付けたり外したりするのは、${next.data.cubes[next.cubeId]?.name ?? "キューブ"}の画面です`)
        : "");
      renderSummary(next.data, next.cubeId);
      renderRows();
      renderOrphans();
    },
  };
}
