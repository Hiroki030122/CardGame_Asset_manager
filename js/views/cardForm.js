// 登録・編集フォーム（モーダル）。SPEC.md 5-3。
import { h, openModal, toggleChips, toast, confirmDialog } from "../ui.js";
import { ITEM_FIELDS, LEDGER_LABELS, getState, findByName, errorMessage } from "../store.js";
import { registerItem, changeOwned, updateItem } from "../actions.js";

const CHIP_FIELDS = { civs: "civs", attrs: "attributes", roles: "roles" };
const KIND_SETTINGS = { cards: "kinds", hypers: "hyperKinds" };
const LABELS = {
  name: "名前", proxy: "プロキシ（印刷した代用カード）", cost: "コスト", cost2: "コスト2", kind: "区分",
  civs: "文明", attrs: "属性", roles: "役割", back: "裏面", memo: "メモ", owned: "枚数",
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 設定の選択肢に、今の値で一覧に無いもの（名前を変えた・消したもの）を足す
const withExtra = (options, values) => [...options, ...values.filter((v) => !options.includes(v))];

// item を渡すと編集、無ければ新規登録
export function openCardForm({ ledger = "cards", item = null } = {}) {
  const editing = !!item;
  const fields = ITEM_FIELDS[ledger];
  const settings = getState().data.settings;
  const inputs = {};
  const sets = {};
  const chipBoxes = {};

  const notice = h("p", { class: "notice", hidden: true });
  const submitBtn = h("button", { type: "submit" });

  const field = (label, control) => h("label", { class: "field" }, h("span", { class: "label" }, label), control);

  function chipOptions(f) {
    const base = settings[CHIP_FIELDS[f]];
    return item ? withExtra(base, item[f]) : base;
  }

  function buildChips(f) {
    sets[f] = new Set(item ? item[f] : []);
    return toggleChips(chipOptions(f), sets[f], null, { civ: f === "civs" });
  }

  inputs.name = h("input", { type: "text", required: true, autocomplete: "off", value: item?.name ?? "" });
  inputs.proxy = h("input", { type: "checkbox" });
  inputs.proxy.checked = !!item?.proxy;
  inputs.name.addEventListener("input", refreshNotice);
  inputs.proxy.addEventListener("change", refreshNotice);

  const numberInput = (value, min = 0) =>
    h("input", { type: "number", inputmode: "numeric", min, step: 1, value: value ?? "" });

  const body = [];
  body.push(field(LABELS.name, inputs.name), notice);
  body.push(h("label", { class: "check" }, inputs.proxy, LABELS.proxy));

  const numbers = [];
  if (fields.includes("cost")) numbers.push(field(LABELS.cost, inputs.cost = numberInput(item?.cost)));
  if (fields.includes("cost2")) numbers.push(field(LABELS.cost2, inputs.cost2 = numberInput(item?.cost2)));
  numbers.push(field(editing ? "所持枚数" : LABELS.owned, inputs.owned = numberInput(item ? item.owned : 1)));
  body.push(h("div", { class: "field-row" }, numbers));

  if (fields.includes("kind")) {
    const kinds = settings[KIND_SETTINGS[ledger]];
    const options = item?.kind ? withExtra(kinds, [item.kind]) : kinds;
    inputs.kind = h("select", null,
      h("option", { value: "" }, "（なし）"),
      options.map((k) => h("option", { value: k, selected: item?.kind === k }, k)));
    body.push(field(LABELS.kind, inputs.kind));
  }

  for (const f of Object.keys(CHIP_FIELDS)) {
    if (!fields.includes(f)) continue;
    chipBoxes[f] = h("div", null, buildChips(f));
    body.push(h("div", { class: "field" }, h("span", { class: "label" }, LABELS[f]), chipBoxes[f]));
  }

  if (fields.includes("back")) {
    inputs.back = h("input", { type: "text", value: item?.back ?? "" });
    body.push(field(LABELS.back, inputs.back));
  }
  inputs.memo = h("textarea", { rows: 2 }, item?.memo ?? "");
  body.push(field(LABELS.memo, inputs.memo));

  const form = h("form", { class: "modal-form", novalidate: true },
    h("div", { class: "modal-body" }, body),
    h("div", { class: "modal-foot" },
      h("button", { type: "button", class: "sub", onclick: () => modal.close() }, editing ? "キャンセル" : "閉じる"),
      submitBtn));
  form.addEventListener("submit", onSubmit);

  const title = editing ? `No.${item.no} を編集` : `${LEDGER_LABELS[ledger]}を登録`;
  const modal = openModal({ title, content: form });
  refreshNotice();
  inputs.name.focus();

  function currentDup() {
    const list = getState().data?.[ledger] ?? [];
    return findByName(list, inputs.name.value, inputs.proxy.checked, item?.no ?? null);
  }

  function refreshNotice() {
    const dup = currentDup();
    notice.hidden = !dup;
    submitBtn.textContent = editing ? "保存" : dup ? "枚数を足す" : "登録";
    if (!dup) return;
    const kind = dup.proxy ? "プロキシ" : "本物";
    notice.textContent = editing
      ? `同じ名前の${kind}が No.${dup.no} にあります。`
      : `登録済み（No.${dup.no}・${kind}）。登録すると枚数が増えます（ほかの項目は変わりません）。`;
  }

  function readValues() {
    const v = {};
    v.name = inputs.name.value.trim();
    if (!v.name) return { error: "名前を入れてください" };
    v.proxy = inputs.proxy.checked;
    for (const f of ["cost", "cost2"]) {
      if (!inputs[f]) continue;
      const s = inputs[f].value.trim();
      v[f] = s === "" ? null : Number(s);
      if (v[f] !== null && !(Number.isInteger(v[f]) && v[f] >= 0)) return { error: `${LABELS[f]}は 0 以上の整数にしてください` };
    }
    v.owned = Number(inputs.owned.value.trim() || 0);
    if (!(Number.isInteger(v.owned) && v.owned >= 0)) return { error: "枚数は 0 以上の整数にしてください" };
    if (inputs.kind) v.kind = inputs.kind.value;
    for (const f of Object.keys(sets)) v[f] = chipOptions(f).filter((o) => sets[f].has(o));
    if (inputs.back) v.back = inputs.back.value;
    v.memo = inputs.memo.value;
    return { values: v };
  }

  async function onSubmit(e) {
    e.preventDefault();
    const { values, error } = readValues();
    if (error) {
      toast(error, "error");
      return;
    }
    if (editing) await saveEdit(values);
    else await saveNew(values);
  }

  async function saveNew(values) {
    const dup = currentDup();
    if (dup) {
      if (values.owned === 0) {
        toast("枚数が 0 なので、何も変えませんでした");
        return;
      }
      changeOwned(ledger, dup, values.owned).catch(() => {});
      toast(`No.${dup.no}「${dup.name}」の枚数を +${values.owned} しました`);
      resetForm();
      return;
    }
    submitBtn.disabled = true;
    try {
      const no = await registerItem(ledger, values);
      toast(`No.${no} で登録しました`);
      resetForm();
    } catch (err) {
      console.error(err);
      toast(`登録できませんでした（${errorMessage(err)}）`, "error");
    } finally {
      submitBtn.disabled = false;
    }
  }

  async function saveEdit(values) {
    const latest = getState().data?.[ledger].find((it) => it.no === item.no);
    if (!latest) {
      toast("このカードは削除されています", "error");
      modal.close();
      return;
    }
    const changes = {};
    for (const f of fields) if (values[f] !== undefined && !same(values[f], latest[f])) changes[f] = values[f];
    if (!Object.keys(changes).length) {
      modal.close();
      return;
    }
    const dup = currentDup();
    if (dup && ("name" in changes || "proxy" in changes)) {
      const ok = await confirmDialog({
        title: "同じ名前があります",
        message: `同じ名前の${dup.proxy ? "プロキシ" : "本物"}が No.${dup.no} にあります。このまま保存しますか？`,
        okText: "保存する",
      });
      if (!ok) return;
    }
    updateItem(ledger, item.no, changes).catch(() => {});
    toast("保存しました");
    modal.close();
  }

  // 続けて登録しやすいよう、プロキシのチェックは残す
  function resetForm() {
    inputs.name.value = "";
    for (const f of ["cost", "cost2", "back"]) if (inputs[f]) inputs[f].value = "";
    if (inputs.kind) inputs.kind.value = "";
    inputs.memo.value = "";
    inputs.owned.value = "1";
    for (const f of Object.keys(chipBoxes)) chipBoxes[f].replaceChildren(buildChips(f));
    refreshNotice();
    inputs.name.focus();
  }
}
