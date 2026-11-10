// 詳細（#/card/<番号>）。SPEC.md 5-4。超次元の関連は段階 4、キューブでのメモは段階 3 で追加する。
import { h, section, listOf, civChips, chips, costText, proxyBadge, toast, confirmDialog } from "../ui.js";
import { getState } from "../store.js";
import { cubeIndex, cardUse, canDelete } from "../calc.js";
import { changeOwned, deleteItem } from "../actions.js";
import { openCardForm } from "./cardForm.js";

export function render({ state, admin, route }) {
  const { data } = state;
  const no = Number(route.param);
  const card = data.cards.find((c) => c.no === no);
  const back = h("p", null, h("a", { href: "#/search" }, "← 検索に戻る"));

  if (!card) {
    return [back, section(null, h("p", null, `No.${route.param ?? ""} のカードは見つかりません（削除された可能性があります）。`))];
  }

  const use = cardUse(card, cubeIndex(data.cubes));
  const row = (label, value) => [h("dt", null, label), h("dd", null, value)];
  const none = h("span", { class: "muted" }, "なし");

  return [
    back,
    section(null,
      h("div", { class: "detail-head" }, h("span", null, `No.${card.no}`), card.proxy ? proxyBadge() : null),
      h("p", { class: "detail-name" }, card.name),
      h("dl", { class: "fields" },
        row("区分", card.kind || none),
        row("コスト", costText(card)),
        row("文明", civChips(card.civs)),
        row("属性", card.attrs.length ? chips(card.attrs) : none),
        row("役割", card.roles.length ? chips(card.roles, "role") : none),
        row("メモ", card.memo ? h("span", { class: "pre" }, card.memo) : none),
        row("所持", String(card.owned)),
        Object.entries(data.cubes).map(([id, cube]) => row(`${cube.name}で使用`, String(use.byCube[id]))),
        row("残り", use.remaining < 0
          ? h("span", { class: "minus" }, `${use.remaining}（足りない）`)
          : String(use.remaining)))),
    admin
      ? section("操作", h("div", { class: "buttons" },
        h("button", { type: "button", onclick: () => openCardForm({ ledger: "cards", item: card }) }, "編集"),
        h("button", { type: "button", class: "sub", disabled: card.owned <= 0, onclick: () => changeOwned("cards", card, -1).catch(() => {}) }, "−1"),
        h("button", { type: "button", class: "sub", onclick: () => changeOwned("cards", card, 1).catch(() => {}) }, "+1"),
        h("button", { type: "button", class: "danger", onclick: () => onDelete(card.no) }, "削除")))
      : null,
  ];
}

function placeText(place, cubes) {
  const name = cubes[place.cube]?.name ?? place.cube;
  if (place.type === "card") return `${name}に入っています`;
  if (place.type === "parent") return `${name}の超次元の関連で、付属先になっています（${place.count} 件）`;
  return `${name}の超次元の関連で使われています（${place.count} 件）`;
}

async function onDelete(no) {
  const data = getState().data;
  const card = data?.cards.find((c) => c.no === no);
  if (!card) return;

  const { ok: deletable, reasons } = canDelete("cards", card, data.cubes);
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
    message: [`No.${card.no}「${card.name}」を削除します。元に戻せません。`, "この番号は、次に登録するカードに使われることがあります。"],
    okText: "削除する",
    danger: true,
  });
  if (!ok) return;
  deleteItem("cards", no).catch(() => {});
  toast(`No.${no} を削除しました`);
  location.hash = "#/search";
}
