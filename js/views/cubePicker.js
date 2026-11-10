// キューブに入れるカードを選ぶ（モーダル）。メインデッキ・超次元・GR で共通（ledger）。
// 続けて入れられるよう開いたままにして、データが変わるたびに更新する。
import { h, openModal, civChips, costText, kindText, proxyBadge } from "../ui.js";
import { getState, subscribe, nameKey } from "../store.js";
import { LEDGER_LABELS } from "../model.js";
import { ledgerUse, cubeAddCheck } from "../calc.js";
import { addCard, addBlockedText } from "./cubeOps.js";

const MAX_ROWS = 50;

export function openCubePicker(cubeId, ledger = "cards") {
  let query = "";
  const label = LEDGER_LABELS[ledger];
  const list = h("div", { class: "picker-list" });
  const input = h("input", { type: "search", placeholder: "名前の一部、または番号", "aria-label": "検索" });
  input.addEventListener("input", () => { query = input.value; render(); });

  const body = h("div", { class: "modal-form" },
    h("div", { class: "modal-body" }, input, list),
    h("div", { class: "modal-foot" }, h("button", { type: "button", class: "sub", onclick: () => modal.close() }, "閉じる")));

  const unsubscribe = subscribe((kind) => { if (kind === "data") render(); });
  const cubeName = getState().data?.cubes[cubeId]?.name ?? "キューブ";
  const modal = openModal({ title: `${cubeName}に${label}を入れる`, content: body, onClose: unsubscribe });
  render();
  input.focus();

  function render() {
    const data = getState().data;
    const cube = data?.cubes[cubeId];
    if (!cube) {
      modal.close();
      return;
    }
    const q = nameKey(query).toLowerCase();
    const qNo = /^\d+$/.test(q) ? Number(q) : null;
    const matched = data[ledger].filter((c) => !q || c.no === qNo || nameKey(c.name).toLowerCase().includes(q));

    const rows = matched.slice(0, MAX_ROWS).map((card) => {
      const use = ledgerUse(card, data.cubes, ledger);
      const inHere = (cube[ledger] ?? []).find((c) => c.no === card.no)?.count ?? 0;
      const check = cubeAddCheck(data, cubeId, ledger, card);
      const plus = h("button", { type: "button", disabled: !check.ok }, "＋ 入れる");
      plus.addEventListener("click", () => addCard(cubeId, ledger, card));
      return h("div", { class: "picker-row" },
        h("div", { class: "picker-main" },
          h("div", null, `No.${card.no} `, h("strong", null, card.name), " ", card.proxy ? proxyBadge() : null),
          h("div", { class: "tile-row" }, civChips(card.civs), h("span", { class: "muted" }, `コスト ${costText(card)}`),
            kindText(card) ? h("span", { class: "muted" }, kindText(card)) : null),
          h("div", { class: "muted" },
            `所持 ${card.owned}・使用 ${use.used}・残り ${use.remaining}`, inHere ? `・ここに ${inHere} 枚` : ""),
          check.ok ? null : h("div", { class: "warn-text" }, addBlockedText(data, cubeId, ledger, card, check))),
        plus);
    });

    list.replaceChildren(...(rows.length ? rows : [h("p", { class: "muted" }, data[ledger].length
      ? "該当するカードがありません。"
      : `まだ${label}がありません。登録するときに、登録先で「${label}」を選んでください。`)]),
    ...(matched.length > MAX_ROWS ? [h("p", { class: "muted" }, `${MAX_ROWS} 件まで表示しています。名前で絞り込んでください。`)] : []));
  }
}
