// キューブのメインデッキのカードに付ける超次元を選ぶ（モーダル）。そのキューブに入れた超次元だけを並べる。
// 続けて付けられるよう開いたままにして、データが変わるたびに更新する。
import { h, openModal, civChips, costText, kindText, proxyBadge } from "../ui.js";
import { getState, subscribe, nameKey } from "../store.js";
import { linkAddCheck } from "../calc.js";
import { addHyperLink } from "./cubeOps.js";

const MAX_ROWS = 50;

export function openHyperPicker(cubeId, parentNo) {
  let query = "";
  const list = h("div", { class: "picker-list" });
  const input = h("input", { type: "search", placeholder: "超次元の名前の一部、または番号", "aria-label": "検索" });
  input.addEventListener("input", () => { query = input.value; render(); });
  const memo = h("input", { type: "text", "aria-label": "メモ", placeholder: "対応のメモ（空でよい）" });

  const body = h("div", { class: "modal-form" },
    h("div", { class: "modal-body" }, input, memo, list),
    h("div", { class: "modal-foot" }, h("button", { type: "button", class: "sub", onclick: () => modal.close() }, "閉じる")));

  const data0 = getState().data;
  const parent = data0?.cards.find((c) => c.no === parentNo);
  const cubeName = data0?.cubes[cubeId]?.name ?? "キューブ";
  const unsubscribe = subscribe((kind) => { if (kind === "data") render(); });
  const modal = openModal({
    title: `${cubeName}：「${parent?.name ?? `No.${parentNo}`}」に付ける超次元`,
    content: body,
    onClose: unsubscribe,
  });
  render();
  input.focus();

  function render() {
    const data = getState().data;
    const cube = data?.cubes[cubeId];
    if (!cube || !cube.cards.some((c) => c.no === parentNo)) {
      modal.close();
      return;
    }
    const q = nameKey(query).toLowerCase();
    const qNo = /^\d+$/.test(q) ? Number(q) : null;
    const inCube = (cube.hypers ?? [])
      .map((e) => ({ entry: e, hyper: data.hypers.find((x) => x.no === e.no) }))
      .filter((x) => x.hyper);
    const matched = inCube.filter(({ hyper }) => !q || hyper.no === qNo || nameKey(hyper.name).toLowerCase().includes(q));

    const rows = matched.slice(0, MAX_ROWS).map(({ entry, hyper }) => {
      const here = cube.hyperLinks.filter((l) => l.parent === parentNo && l.hyper === hyper.no).length;
      const all = cube.hyperLinks.filter((l) => l.hyper === hyper.no).length;
      const check = linkAddCheck(data, cubeId, parentNo, hyper.no);
      const attach = h("button", { type: "button", disabled: !check.ok }, "＋ 付ける");
      attach.addEventListener("click", () => addHyperLink(cubeId, parentNo, hyper, memo.value.trim()));
      return h("div", { class: "picker-row" },
        h("div", { class: "picker-main" },
          h("div", null, `No.${hyper.no} `, h("strong", null, hyper.name), " ", hyper.proxy ? proxyBadge() : null),
          h("div", { class: "tile-row" }, civChips(hyper.civs), h("span", { class: "muted" }, `コスト ${costText(hyper)}`),
            kindText(hyper) ? h("span", { class: "muted" }, kindText(hyper)) : null),
          h("div", { class: "muted" }, `このキューブに ${entry.count ?? 1} 枚・対応 ${all} 件`, here ? `（このカードに ${here} 件）` : ""),
          check.ok ? null : h("div", { class: "warn-text" }, "入れた枚数まで対応を付けているため、付けられません（超次元を増やすか、対応を外してください）")),
        attach);
    });

    list.replaceChildren(
      ...(rows.length ? rows : [h("p", { class: "muted" }, inCube.length
        ? "該当する超次元がありません。"
        : "このキューブには、まだ超次元が入っていません。先に、キューブの「超次元」の欄から入れてください。")]),
      ...(matched.length > MAX_ROWS ? [h("p", { class: "muted" }, `${MAX_ROWS} 件まで表示しています。名前で絞り込んでください。`)] : []));
  }
}
