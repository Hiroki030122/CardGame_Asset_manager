// キューブの出し入れの操作（確認・チェック・トースト）。一覧・キューブ・個別ページの各画面と、入れるカードの選択から呼ぶ。
// ledger は cards（メインデッキ）／hypers（超次元）／gr（GR）。キューブの中のリスト名と同じ。
import { h, toast, confirmDialog, promptDialog, listOf, openModal } from "../ui.js";
import { getState, subscribe } from "../store.js";
import { LEDGER_LABELS, cubeUses } from "../model.js";
import { ledgerUse, cubeAddCheck, linkAddCheck, hyperRemoveCheck } from "../calc.js";
import { addToCube, removeFromCube, setCubeCardMemo, setCubeMulti, addLink, removeLink } from "../actions.js";

const entryOf = (cube, ledger, no) => cube?.[ledger]?.find((c) => c.no === no) ?? null;

// 入れられない理由の文
export function addBlockedText(data, cubeId, ledger, item, check) {
  const cube = data.cubes[cubeId];
  const label = LEDGER_LABELS[ledger];
  if (check.reason === "stock") {
    const use = ledgerUse(item, data.cubes, ledger);
    return `「${item.name}」は所持が足りないため、${cube.name}に入れられません（所持 ${item.owned}・使用 ${use.used}）`;
  }
  if (check.reason === "name") {
    return check.card.no === item.no
      ? `「${item.name}」はすでに${cube.name}に入っています（同名カードは 1 枚だけのモードです）`
      : `同名の「${check.card.name}」（${label} No.${check.card.no}）が${cube.name}に入っているため、入れられません（同名カードは 1 枚だけのモードです）`;
  }
  if (check.reason === "unused") return `${cube.name}は${label}を使わない設定です`;
  return "入れられません";
}

// 1 枚入れる。入れたら true
export function addCard(cubeId, ledger, item) {
  const data = getState().data;
  const cube = data?.cubes[cubeId];
  if (!cube) return false;
  const check = cubeAddCheck(data, cubeId, ledger, item);
  if (!check.ok) {
    toast(addBlockedText(data, cubeId, ledger, item, check), "error");
    return false;
  }
  addToCube(cubeId, ledger, item.no, !!entryOf(cube, ledger, item.no)).catch(() => {});
  return true;
}

// 1 枚外す。最後の 1 枚（または all）のときは確認する。超次元は、外すと対応の数が枚数を超えるなら外せない
export async function removeCard(cubeId, ledger, item, { all = false } = {}) {
  const data = getState().data;
  const cube = data?.cubes[cubeId];
  const entry = entryOf(cube, ledger, item.no);
  if (!entry) return;
  if (ledger === "hypers") {
    const check = hyperRemoveCheck(data, cubeId, item.no, all ? 0 : entry.count - 1);
    if (!check.ok) {
      toast(`「${item.name}」には対応が ${check.links} 件付いています。先に対応を外してください`, "error");
      return;
    }
  }
  if (all || entry.count <= 1) {
    const ok = await confirmDialog({
      title: "キューブから外しますか？",
      message: `「${item.name}」を${cube.name}から外します。${entry.count > 1 && all ? `（${entry.count} 枚すべて）` : ""}`,
      okText: "外す",
      danger: true,
    });
    if (!ok) return;
  }
  const latest = entryOf(getState().data?.cubes[cubeId], ledger, item.no);
  if (!latest) return;
  removeFromCube(cubeId, ledger, item.no, latest.count, { all }).catch(() => {});
}

// キューブでのメモ（空にもできる）
export async function editCardMemo(cubeId, ledger, item) {
  const cube = getState().data?.cubes[cubeId];
  const entry = entryOf(cube, ledger, item.no);
  if (!entry) return;
  const memo = await promptDialog({
    title: `「${item.name}」の${cube.name}でのメモ`,
    label: "メモ",
    value: entry.memo,
    okText: "保存",
    allowEmpty: true,
  });
  if (memo === null || memo === entry.memo) return;
  setCubeCardMemo(cubeId, ledger, item.no, memo).catch(() => {});
}

// 同名を複数枚入れられるモードの切り替え（3 つのリストすべてに効く）
export async function changeMulti(cubeId, multi) {
  const data = getState().data;
  const cube = data?.cubes[cubeId];
  if (!cube || cube.multi === multi) return;
  if (multi) {
    setCubeMulti(cubeId, true, cube).catch(() => {});
    toast(`${cube.name}：同名カードを所持数まで複数枚入れられるようにしました`);
    return;
  }

  const nameOf = (ledger, no) => data[ledger].find((c) => c.no === no)?.name ?? `No.${no}`;
  const many = ["cards", "hypers", "gr"].flatMap((ledger) =>
    (cube[ledger] ?? []).filter((c) => c.count > 1).map((c) => `${LEDGER_LABELS[ledger]}の${nameOf(ledger, c.no)}：${c.count} 枚 → 1 枚`));
  const ok = await confirmDialog({
    title: "同名カードを 1 枚だけにしますか？",
    message: [
      many.length ? "複数枚入っているカードは、1 枚に減らします。" : "複数枚入っているカードはありません。",
      many.length ? listOf(many) : null,
      "同名のカードが別々に入っている場合は、そのまま残ります（赤く目印が出ます）。新しく入れることはできません。",
    ].filter(Boolean),
    okText: "切り替える",
    danger: many.length > 0,
  });
  if (!ok) return;
  const latest = getState().data?.cubes[cubeId];
  if (!latest) return;
  setCubeMulti(cubeId, false, latest).catch(() => {});
  toast(`${latest.name}：同名カードは 1 枚だけにしました`);
}

// 1 つのキューブ分の「名前・枚数・−・＋」。name: false なら名前を出さず枚数だけ（キューブ画面の一覧用）
export function cubeControl(id, cube, ledger, item, { name = true } = {}) {
  const n = entryOf(cube, ledger, item.no)?.count ?? 0;
  const mark = n ? (cube.multi ? ` ×${n}` : " ✓") : "";
  const label = h("span", { class: n ? "cube-label in" : "cube-label" }, name ? `${cube.name}${mark}` : `×${n}`);
  const minus = h("button", {
    type: "button", class: "sub small", disabled: n === 0, "aria-label": `「${item.name}」を${cube.name}から 1 枚外す`,
  }, "−");
  const plus = h("button", { type: "button", class: "sub small", "aria-label": `「${item.name}」を${cube.name}に 1 枚入れる` }, "＋");
  minus.addEventListener("click", () => removeCard(id, ledger, item));
  plus.addEventListener("click", () => addCard(id, ledger, item));
  return h("span", { class: "cube-ctl" }, label, minus, plus);
}

// 管理者向け：1 枚のカードを、そのリストを使うキューブに出し入れする小さな画面（開いたまま、データが変わるたびに更新する）
export function openCubeMenu(ledger, itemNo) {
  const body = h("div", { class: "modal-form" });
  const unsubscribe = subscribe((kind) => { if (kind === "data") render(); });
  const modal = openModal({ title: "キューブに入れる・外す", content: body, onClose: unsubscribe });
  render();

  function render() {
    const data = getState().data;
    const item = data?.[ledger].find((c) => c.no === itemNo);
    if (!item) {
      modal.close();
      return;
    }
    const use = ledgerUse(item, data.cubes, ledger);
    const rows = Object.entries(data.cubes)
      .filter(([, cube]) => cubeUses(cube, ledger))
      .map(([id, cube]) => h("li", { class: "cube-row" }, cubeControl(id, cube, ledger, item)));
    body.replaceChildren(
      h("div", { class: "modal-body" },
        h("p", null, h("strong", null, `${LEDGER_LABELS[ledger]} No.${item.no} ${item.name}`)),
        h("p", { class: "muted" }, `所持 ${item.owned}・使用 ${use.used}・残り ${use.remaining}`),
        rows.length ? h("ul", { class: "cube-rows" }, rows) : h("p", { class: "muted" }, `${LEDGER_LABELS[ledger]}を使うキューブがありません（設定のキューブで切り替えられます）。`)),
      h("div", { class: "modal-foot" }, h("button", { type: "button", class: "sub", onclick: () => modal.close() }, "閉じる")));
  }
}

// 閲覧用：入っているキューブの名前（枚数）
export function cubeNames(item, data, ledger = "cards") {
  const parts = [];
  for (const cube of Object.values(data.cubes)) {
    const n = entryOf(cube, ledger, item.no)?.count ?? 0;
    if (n) parts.push(cube.multi || n > 1 ? `${cube.name} ×${n}` : cube.name);
  }
  return parts;
}

// ---- 超次元の対応（キューブの中で、メインデッキのカードと、キューブに入れた超次元を結びつける） ----

// 対応を 1 つ付ける。付けたら true
export function addHyperLink(cubeId, parentNo, hyper, memo = "") {
  const data = getState().data;
  if (!data?.cubes[cubeId]) return false;
  const check = linkAddCheck(data, cubeId, parentNo, hyper.no);
  if (!check.ok) {
    const reasons = {
      parent: "付属先のカードがこのキューブのメインデッキに入っていません",
      hyper: `「${hyper.name}」がこのキューブに入っていません。先に超次元を入れてください`,
      full: `「${hyper.name}」はこのキューブに ${check.count} 枚で、対応がすでに ${check.links} 件あります。超次元を増やすか、対応を外してください`,
    };
    toast(reasons[check.reason] ?? "付けられません", "error");
    return false;
  }
  addLink(cubeId, parentNo, hyper.no, memo).catch(() => {});
  return true;
}

// 対応を 1 つ外す。メモがあるときだけ確認する
export async function removeHyperLink(cubeId, link, hyperName) {
  if (link.memo) {
    const ok = await confirmDialog({
      title: "対応を外しますか？",
      message: `「${hyperName}」の対応を外します。メモ「${link.memo}」も消えます。`,
      okText: "外す",
      danger: true,
    });
    if (!ok) return;
  }
  removeLink(cubeId, link.id).catch(() => {});
}

// メインデッキのカードに付いている超次元。同じ超次元はまとめて「超次元：H ×2」。管理者は「−」で 1 つ外す
export function hyperLinkChips(data, cubeId, card, admin) {
  const links = data.cubes[cubeId].hyperLinks.filter((l) => l.parent === card.no);
  if (!links.length) return null;
  const groups = new Map();
  for (const l of links) groups.set(l.hyper, [...(groups.get(l.hyper) ?? []), l]);
  return h("div", { class: "tile-row" }, [...groups].map(([hyperNo, list]) => {
    const name = data.hypers.find((x) => x.no === hyperNo)?.name ?? `No.${hyperNo}`;
    const label = `超次元：${name}${list.length > 1 ? ` ×${list.length}` : ""}`;
    const chip = h("span", { class: "chip link-chip" }, label);
    if (admin) {
      const minus = h("button", { type: "button", class: "chip-x", "aria-label": `${label}を 1 つ外す` }, "−");
      minus.addEventListener("click", () => removeHyperLink(cubeId, list[list.length - 1], name));
      chip.append(minus);
    }
    return chip;
  }));
}

// 超次元のリストの行に出す「呼んでいる付属先」。対応の数／入れた枚数と、付属先の名前
export function parentChips(data, cubeId, hyper, admin) {
  const cube = data.cubes[cubeId];
  const links = cube.hyperLinks.filter((l) => l.hyper === hyper.no);
  const count = entryOf(cube, "hypers", hyper.no)?.count ?? 0;
  const groups = new Map();
  for (const l of links) groups.set(l.parent, [...(groups.get(l.parent) ?? []), l]);
  const chips = [...groups].map(([parentNo, list]) => {
    const name = data.cards.find((c) => c.no === parentNo)?.name ?? `No.${parentNo}`;
    const label = `${name}${list.length > 1 ? ` ×${list.length}` : ""}`;
    const chip = h("span", { class: "chip link-chip" }, label);
    if (admin) {
      const minus = h("button", { type: "button", class: "chip-x", "aria-label": `${label}との対応を 1 つ外す` }, "−");
      minus.addEventListener("click", () => removeHyperLink(cubeId, list[list.length - 1], hyper.name));
      chip.append(minus);
    }
    return chip;
  });
  return h("div", { class: "tile-row" }, h("span", { class: links.length > count ? "minus" : "muted" }, `対応 ${links.length}/${count}`), chips);
}
