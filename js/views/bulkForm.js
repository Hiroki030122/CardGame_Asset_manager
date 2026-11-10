// まとめて登録（モーダル）。SPEC.md 5-3。名前を 1 行に 1 枚ずつ貼り付けて、確認してから登録する。
import { h, openModal, toast, listOf, loadPref, savePref } from "../ui.js";
import { getState, errorMessage } from "../store.js";
import { LEDGERS, LEDGER_LABELS } from "../model.js";
import { planBulk } from "../merge.js";
import { registerMany } from "../actions.js";

const MAX_LINES = 500;

export function openBulkForm({ ledger = loadPref("registerLedger", "cards") } = {}) {
  if (!LEDGERS.includes(ledger)) ledger = "cards";
  let text = "";
  let proxy = false;

  const body = h("div", { class: "modal-form" });
  const titleOf = () => `${LEDGER_LABELS[ledger]}をまとめて登録`;
  const modal = openModal({ title: titleOf(), content: body });
  showInput();

  function showInput() {
    const area = h("textarea", { rows: 10, placeholder: "カード名を 1 行に 1 枚ずつ貼り付け", "aria-label": "カード名" }, text);
    const check = h("input", { type: "checkbox" });
    check.checked = proxy;
    const group = h("div", { class: "segmented", role: "group", "aria-label": "登録先" });
    for (const l of LEDGERS) {
      const btn = h("button", { type: "button", "aria-pressed": String(l === ledger) }, LEDGER_LABELS[l]);
      btn.addEventListener("click", () => {
        if (l === ledger) return;
        text = area.value;
        proxy = check.checked;
        ledger = l;
        savePref("registerLedger", l);
        modal.dialog.querySelector("h2").textContent = titleOf();
        showInput();
      });
      group.append(btn);
    }
    const form = h("form", { class: "modal-form", novalidate: true },
      h("div", { class: "modal-body" },
        h("div", { class: "field" }, h("span", { class: "label" }, "登録先"), group),
        h("p", { class: "muted" },
          "名前を 1 行に 1 枚ずつ貼り付けます。同じ名前の行が何行かあれば、その行数が枚数になります。ほかの項目は、あとで編集できます。"),
        area,
        h("label", { class: "check" }, check, "プロキシとして登録（貼り付けた分すべて）")),
      h("div", { class: "modal-foot" },
        h("button", { type: "button", class: "sub", onclick: () => modal.close() }, "閉じる"),
        h("button", { type: "submit" }, "確認へ")));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      text = area.value;
      proxy = check.checked;
      showConfirm();
    });
    body.replaceChildren(form);
    area.focus();
  }

  function showConfirm() {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) {
      toast("名前を入れてください", "error");
      return;
    }
    if (lines.length > MAX_LINES) {
      toast(`1 回に登録できるのは ${MAX_LINES} 行までです（${lines.length} 行あります）`, "error");
      return;
    }

    const data = getState().data;
    if (!data) {
      toast("データを読み込めていません", "error");
      return;
    }
    const plan = planBulk(data, ledger, lines, proxy);
    const mark = proxy ? "（プロキシ）" : "";

    const registerBtn = h("button", { type: "button" }, "登録する");
    registerBtn.addEventListener("click", async () => {
      registerBtn.disabled = true;
      try {
        const done = await registerMany(ledger, lines, proxy);
        toast(`登録しました（新規 ${done.created.length} 件、枚数加算 ${done.added.length} 件）`);
        modal.close();
      } catch (err) {
        console.error(err);
        toast(`登録できませんでした（${errorMessage(err)}）`, "error");
        registerBtn.disabled = false;
      }
    });

    body.replaceChildren(h("div", { class: "modal-form" },
      h("div", { class: "modal-body" },
        h("p", null, `新規 ${plan.created.length} 件、枚数加算 ${plan.added.length} 件${proxy ? "（すべてプロキシ）" : ""}`),
        listOf([
          ...plan.created.map(({ item }) => `${item.name}${mark} … 新規（${item.owned} 枚）`),
          ...plan.added.map(({ no, name, delta }) => `${name}${mark} … 登録済み（No.${no}）→ 枚数 +${delta}`),
        ]),
        h("p", { class: "muted" }, "新規の番号は、登録するときに空いている番号から振られます。")),
      h("div", { class: "modal-foot" },
        h("button", { type: "button", class: "sub", onclick: showInput }, "戻る"),
        registerBtn)));
  }
}
