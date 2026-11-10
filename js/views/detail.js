// 個別ページ（#/card/<番号>・#/hyper/<番号>・#/gr/<番号>）。SPEC.md 5-4。
import { h, section, listOf, civChips, chips, costText, kindText, proxyBadge, toast, confirmDialog } from "../ui.js";
import { getState } from "../store.js";
import { LEDGER_LABELS, cubeUses } from "../model.js";
import { ledgerUse, canDelete } from "../calc.js";
import { changeOwned, deleteItem } from "../actions.js";
import { openCardForm } from "./cardForm.js";
import { cubeControl, cubeNames, editCardMemo, removeCard } from "./cubeOps.js";

const LIST_HASH = { cards: "#/list", hypers: "#/list/hypers", gr: "#/list/gr" };
const FACES = [["cost", "kind", "面1"], ["cost2", "kind2", "面2"], ["cost3", "kind3", "面3"]];

export function render({ state, admin, route }, ledger = "cards") {
  const { data } = state;
  const no = Number(route.param);
  const card = data[ledger].find((c) => c.no === no);
  const label = LEDGER_LABELS[ledger];
  const back = h("p", null, h("a", { href: LIST_HASH[ledger] }, `← ${label}の一覧に戻る`));

  if (!card) {
    return [back, section(null, h("p", null, `${label} No.${route.param ?? ""} は見つかりません（削除された可能性があります）。`))];
  }

  const use = ledgerUse(card, data.cubes, ledger);
  const row = (name, value) => [h("dt", null, name), h("dd", null, value)];
  const none = () => h("span", { class: "muted" }, "なし");

  const faceRows = ledger === "hypers"
    ? FACES.filter(([c, k], i) => i === 0 || card[c] != null || card[k]).map(([c, k, name]) =>
      row(name, `コスト ${card[c] ?? "—"}・区分 ${card[k] || "なし"}`))
    : [row("区分", card.kind || none()), row("コスト", costText(card))];

  return [
    back,
    section(null,
      h("div", { class: "detail-head" }, h("span", null, `${label} No.${card.no}`), card.proxy ? proxyBadge() : null),
      h("p", { class: "detail-name" }, card.name),
      h("dl", { class: "fields" },
        faceRows,
        row("文明", civChips(card.civs)),
        row("属性", card.attrs.length ? chips(card.attrs) : none()),
        row("役割", card.roles.length ? chips(card.roles, "role") : none()),
        ledger === "hypers" ? row("裏面", card.back || none()) : null,
        row("メモ", card.memo ? h("span", { class: "pre" }, card.memo) : none()),
        row("所持", String(card.owned)),
        row("使用数", String(use.used)),
        row("残り", use.remaining < 0
          ? h("span", { class: "minus" }, `${use.remaining}（足りない）`)
          : String(use.remaining)),
        row("入っているキューブ", cubeNames(card, data, ledger).length ? chips(cubeNames(card, data, ledger)) : none()))),
    cubeSection(card, data, admin, ledger),
    ledger === "cards" ? linkSection(card, data) : null,
    ledger === "hypers" ? usageSection(card, data) : null,
    admin
      ? section("操作", h("div", { class: "buttons" },
        h("button", { type: "button", onclick: () => openCardForm({ ledger, item: card }) }, "編集"),
        h("button", { type: "button", class: "sub", disabled: card.owned <= 0, onclick: () => changeOwned(ledger, card, -1).catch(() => {}) }, "所持−1"),
        h("button", { type: "button", class: "sub", onclick: () => changeOwned(ledger, card, 1).catch(() => {}) }, "所持+1"),
        h("button", { type: "button", class: "danger", onclick: () => onDelete(ledger, card.no) }, "削除")))
      : null,
  ].filter(Boolean);
}

// キューブごとに、入っている枚数・メモ・出し入れ（そのリストを使うキューブだけ）
function cubeSection(card, data, admin, ledger) {
  const rows = Object.entries(data.cubes).filter(([, cube]) => cubeUses(cube, ledger)).map(([id, cube]) => {
    const entry = (cube[ledger] ?? []).find((c) => c.no === card.no);
    return h("li", { class: "cube-row" },
      admin ? cubeControl(id, cube, ledger, card) : h("span", { class: entry ? "cube-label in" : "cube-label" }, `${cube.name}${entry ? (cube.multi ? ` ×${entry.count}` : " ✓") : ""}`),
      entry && entry.memo ? h("span", { class: "muted" }, `メモ：${entry.memo}`) : null,
      admin && entry
        ? h("span", { class: "buttons" },
          h("button", { type: "button", class: "sub small", onclick: () => editCardMemo(id, ledger, card) }, "メモ"),
          h("button", { type: "button", class: "sub small", onclick: () => removeCard(id, ledger, card, { all: true }) }, "外す"))
        : null);
  });
  return section("キューブ", rows.length
    ? h("ul", { class: "cube-rows" }, rows)
    : h("p", { class: "muted" }, `${LEDGER_LABELS[ledger]}を使うキューブがありません。`));
}

// メインデッキ：キューブごとの超次元の対応（見るだけ。付け外しはキューブ画面）
function linkSection(card, data) {
  const rows = [];
  for (const [id, cube] of Object.entries(data.cubes)) {
    if (!cube.usesHyper) continue;
    const groups = new Map();
    for (const l of cube.hyperLinks) if (l.parent === card.no) groups.set(l.hyper, (groups.get(l.hyper) ?? 0) + 1);
    if (!groups.size) continue;
    const text = [...groups].map(([no, n]) => `${data.hypers.find((x) => x.no === no)?.name ?? `No.${no}`}${n > 1 ? ` ×${n}` : ""}`).join("、");
    rows.push(h("li", { class: "cube-row" }, h("a", { href: `#/cube/${id}` }, cube.name), h("span", null, text)));
  }
  if (!rows.length) return null;
  return section("付いている超次元", h("ul", { class: "cube-rows" }, rows),
    h("p", { class: "muted" }, "付け外しは、キューブの画面で行います。"));
}

// 超次元：どのキューブのどのカードに付いているか
function usageSection(hyper, data) {
  const rows = [];
  for (const [id, cube] of Object.entries(data.cubes)) {
    if (!cube.usesHyper) continue;
    const groups = new Map();
    for (const l of cube.hyperLinks) if (l.hyper === hyper.no) groups.set(l.parent, (groups.get(l.parent) ?? 0) + 1);
    if (!groups.size) continue;
    const inCube = new Set(cube.cards.map((c) => c.no));
    const text = [...groups].map(([no, n]) => {
      const name = data.cards.find((x) => x.no === no)?.name ?? `No.${no}`;
      return `${name}${n > 1 ? ` ×${n}` : ""}${inCube.has(no) ? "" : "（付属先が未登録）"}`;
    }).join("、");
    rows.push(h("li", { class: "cube-row" }, h("a", { href: `#/cube/${id}` }, cube.name), h("span", null, text)));
  }
  return section("使っているキューブ・カード",
    rows.length ? h("ul", { class: "cube-rows" }, rows) : h("p", { class: "muted" }, "どのキューブのカードにも付いていません。"));
}

function placeText(place, cubes) {
  const name = cubes[place.cube]?.name ?? place.cube;
  if (place.type === "card") return `${name}に入っています`;
  if (place.type === "parent") return `${name}の超次元の対応で、付属先になっています（${place.count} 件）`;
  return `${name}の超次元の対応で使われています（${place.count} 件）`;
}

async function onDelete(ledger, no) {
  const data = getState().data;
  const card = data?.[ledger].find((c) => c.no === no);
  if (!card) return;

  const { ok: deletable, reasons } = canDelete(ledger, card, data.cubes);
  if (!deletable) {
    await confirmDialog({
      title: "削除できません",
      message: [
        "次の理由で削除できません。所持を 0 枚にして、使っている場所から外してから削除してください。",
        listOf(reasons.map((r) => (r.type === "owned" ? `所持が ${r.count} 枚あります` : placeText(r, data.cubes)))),
      ],
      okText: "閉じる",
      cancelText: null,
    });
    return;
  }

  const ok = await confirmDialog({
    title: "削除しますか？",
    message: [`${LEDGER_LABELS[ledger]} No.${card.no}「${card.name}」を削除します。元に戻せません。`, "この番号は、次に登録するカードに使われることがあります。"],
    okText: "削除する",
    danger: true,
  });
  if (!ok) return;
  deleteItem(ledger, no).catch(() => {});
  toast(`No.${no} を削除しました`);
  location.hash = LIST_HASH[ledger];
}
