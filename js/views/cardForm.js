// 登録・編集フォーム（モーダル）。SPEC.md 5-3。新規登録では、登録先（メインデッキ／超次元／GR）を選べる。
import { h, openModal, toggleChips, toast, confirmDialog, loadPref, savePref } from "../ui.js";
import { getState, findByName, errorMessage } from "../store.js";
import { ITEM_FIELDS, LEDGERS, LEDGER_LABELS, KIND_SETTING } from "../model.js";
import { registerItem, changeOwned, updateItem } from "../actions.js";

const CHIP_FIELDS = { civs: "civs", attrs: "attributes", roles: "roles" };
const LABELS = {
  name: "名前", proxy: "プロキシ（印刷した代用カード）", cost: "コスト", cost2: "コスト2", cost3: "コスト3",
  kind: "区分", kind2: "区分", kind3: "区分", civs: "文明", attrs: "属性", roles: "役割", back: "裏面", memo: "メモ", owned: "枚数",
};
// 超次元の面（コストと区分の組）
const FACES = [["cost", "kind", "面1"], ["cost2", "kind2", "面2"], ["cost3", "kind3", "面3"]];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 設定の選択肢に、今の値で一覧に無いもの（名前を変えた・消したもの）を足す
const withExtra = (options, values) => [...options, ...values.filter((v) => !options.includes(v))];

// 続けて登録しやすいよう、選んだ登録先は覚えておく
let lastLedger = loadPref("registerLedger", "cards");

// item を渡すと編集、無ければ新規登録
export function openCardForm({ ledger = lastLedger, item = null } = {}) {
  const editing = !!item;
  const holder = h("div", { class: "modal-form" });
  const titleOf = (led) => (editing ? `No.${item.no} を編集` : `${LEDGER_LABELS[led]}を登録`);
  const startLedger = LEDGERS.includes(ledger) ? ledger : "cards";
  const modal = openModal({ title: titleOf(startLedger), content: holder });
  build(startLedger, {});

  // carry：登録先を切り替えたときに引き継ぐ値（名前・プロキシ・メモ・枚数）
  function build(led, carry) {
    const fields = ITEM_FIELDS[led];
    const settings = getState().data.settings;
    const inputs = {};
    const sets = {};
    const chipBoxes = {};

    const notice = h("p", { class: "notice", hidden: true });
    const submitBtn = h("button", { type: "submit" });
    const field = (label, control) => h("label", { class: "field" }, h("span", { class: "label" }, label), control);
    const numberInput = (value) => h("input", { type: "number", inputmode: "numeric", min: 0, step: 1, value: value ?? "" });

    function chipOptions(f) {
      const base = settings[CHIP_FIELDS[f]];
      return item ? withExtra(base, item[f]) : base;
    }

    function buildChips(f) {
      sets[f] = new Set(item ? item[f] : []);
      return toggleChips(chipOptions(f), sets[f], null, { civ: f === "civs" });
    }

    // 区分の選択（登録先ごとの一覧）。GR は一覧の先頭を初めの値にする
    function kindSelect(f) {
      const kinds = settings[KIND_SETTING[led]];
      const value = item ? item[f] : (f === "kind" && led === "gr" ? kinds[0] ?? "" : "");
      const options = value ? withExtra(kinds, [value]) : kinds;
      inputs[f] = h("select", { "aria-label": LABELS[f] },
        h("option", { value: "" }, "（なし）"),
        options.map((k) => h("option", { value: k, selected: value === k }, k)));
      return inputs[f];
    }

    inputs.name = h("input", { type: "text", required: true, autocomplete: "off", value: item?.name ?? carry.name ?? "" });
    inputs.proxy = h("input", { type: "checkbox" });
    inputs.proxy.checked = item ? !!item.proxy : !!carry.proxy;
    inputs.name.addEventListener("input", refreshNotice);
    inputs.proxy.addEventListener("change", refreshNotice);

    const body = [];

    if (!editing) {
      const group = h("div", { class: "segmented", role: "group", "aria-label": "登録先" });
      for (const l of LEDGERS) {
        const btn = h("button", { type: "button", "aria-pressed": String(l === led) }, LEDGER_LABELS[l]);
        btn.addEventListener("click", () => {
          if (l === led) return;
          lastLedger = l;
          savePref("registerLedger", l);
          modal.dialog.querySelector("h2").textContent = titleOf(l);
          build(l, readCarry());
        });
        group.append(btn);
      }
      body.push(h("div", { class: "field" }, h("span", { class: "label" }, "登録先"), group));
    }

    body.push(field(LABELS.name, inputs.name), notice);
    body.push(h("label", { class: "check" }, inputs.proxy, LABELS.proxy));

    if (led === "hypers") {
      for (const [costField, kindField, label] of FACES) {
        inputs[costField] = numberInput(item ? item[costField] : null);
        body.push(h("div", { class: "face-row" },
          h("span", { class: "face-label" }, label),
          field(LABELS[costField], inputs[costField]),
          field(LABELS[kindField], kindSelect(kindField))));
      }
      inputs.owned = numberInput(item ? item.owned : carry.owned ?? 1);
      body.push(h("div", { class: "field-row" }, field(editing ? "所持枚数" : LABELS.owned, inputs.owned)));
    } else {
      const numbers = [field(LABELS.cost, inputs.cost = numberInput(item?.cost))];
      if (fields.includes("cost2")) numbers.push(field(LABELS.cost2, inputs.cost2 = numberInput(item?.cost2)));
      numbers.push(field(editing ? "所持枚数" : LABELS.owned, inputs.owned = numberInput(item ? item.owned : carry.owned ?? 1)));
      body.push(h("div", { class: "field-row" }, numbers));
      body.push(field(LABELS.kind, kindSelect("kind")));
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
    inputs.memo = h("textarea", { rows: 2 }, item?.memo ?? carry.memo ?? "");
    body.push(field(LABELS.memo, inputs.memo));

    const form = h("form", { class: "modal-form", novalidate: true },
      h("div", { class: "modal-body" }, body),
      h("div", { class: "modal-foot" },
        h("button", { type: "button", class: "sub", onclick: () => modal.close() }, editing ? "キャンセル" : "閉じる"),
        submitBtn));
    form.addEventListener("submit", onSubmit);
    holder.replaceChildren(form);
    refreshNotice();
    inputs.name.focus();

    function readCarry() {
      return { name: inputs.name.value, proxy: inputs.proxy.checked, memo: inputs.memo.value, owned: inputs.owned.value === "" ? undefined : Number(inputs.owned.value) };
    }

    function currentDup() {
      const list = getState().data?.[led] ?? [];
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
      for (const f of ["cost", "cost2", "cost3"]) {
        if (!inputs[f]) continue;
        const s = inputs[f].value.trim();
        v[f] = s === "" ? null : Number(s);
        if (v[f] !== null && !(Number.isInteger(v[f]) && v[f] >= 0)) return { error: `${LABELS[f]}は 0 以上の整数にしてください` };
      }
      v.owned = Number(inputs.owned.value.trim() || 0);
      if (!(Number.isInteger(v.owned) && v.owned >= 0)) return { error: "枚数は 0 以上の整数にしてください" };
      for (const f of ["kind", "kind2", "kind3"]) if (inputs[f]) v[f] = inputs[f].value;
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
        changeOwned(led, dup, values.owned).catch(() => {});
        toast(`${LEDGER_LABELS[led]} No.${dup.no}「${dup.name}」の枚数を +${values.owned} しました`);
        build(led, { proxy: values.proxy });
        return;
      }
      submitBtn.disabled = true;
      try {
        const no = await registerItem(led, values);
        toast(`${LEDGER_LABELS[led]} No.${no} で登録しました`);
        build(led, { proxy: values.proxy });
      } catch (err) {
        console.error(err);
        toast(`登録できませんでした（${errorMessage(err)}）`, "error");
        submitBtn.disabled = false;
      }
    }

    async function saveEdit(values) {
      const latest = getState().data?.[led].find((it) => it.no === item.no);
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
      updateItem(led, item.no, changes).catch(() => {});
      toast("保存しました");
      modal.close();
    }
  }
}
