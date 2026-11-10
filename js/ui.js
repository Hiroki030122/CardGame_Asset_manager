// 画面の共通部品。文字は必ずテキストノードで入れる（innerHTML は使わない）。

// h("button", { class: "sub", onclick: fn }, "文字", 子要素…)
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

export function section(title, ...children) {
  return h("section", { class: "panel" }, title ? h("h2", null, title) : null, ...children);
}

export function listOf(items) {
  return h("ul", null, items.map((t) => h("li", null, t)));
}

export function toast(message, kind = "info") {
  const el = h("div", { class: `toast ${kind}`, role: kind === "error" ? "alert" : null }, message);
  document.getElementById("toasts").append(el);
  setTimeout(() => el.remove(), kind === "error" ? 8000 : 4000);
}

// 確認ダイアログ。OK なら true。cancelText: null でボタン 1 つのお知らせになる。
export function confirmDialog({ title, message = [], okText = "OK", cancelText = "キャンセル", danger = false }) {
  return new Promise((resolve) => {
    const lines = (Array.isArray(message) ? message : [message]).map((m) => (m instanceof Node ? m : h("p", null, m)));
    const cancelBtn = cancelText ? h("button", { value: "cancel", class: "sub" }, cancelText) : null;
    const okBtn = h("button", { value: "ok", class: danger ? "danger" : null }, okText);
    const dialog = h("dialog", { class: "dialog" },
      h("form", { method: "dialog" },
        h("h2", null, title),
        lines,
        h("div", { class: "dialog-buttons" }, cancelBtn, okBtn)));
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(dialog.returnValue === "ok");
    });
    document.body.append(dialog);
    dialog.showModal();
    (danger && cancelBtn ? cancelBtn : okBtn).focus();
  });
}

// 3 択以上のダイアログ。選んだ choices[].value を返す。キャンセルなら null。
export function choiceDialog({ title, message = [], choices, cancelText = "キャンセル" }) {
  return new Promise((resolve) => {
    const lines = (Array.isArray(message) ? message : [message]).map((m) => (m instanceof Node ? m : h("p", null, m)));
    const buttons = choices.map((c) => h("button", { value: c.value, class: c.danger ? "danger" : c.sub ? "sub" : null }, c.label));
    const dialog = h("dialog", { class: "dialog" },
      h("form", { method: "dialog" },
        h("h2", null, title),
        lines,
        h("div", { class: "dialog-buttons" }, h("button", { value: "", class: "sub" }, cancelText), buttons)));
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(dialog.returnValue || null);
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

// 文字を 1 つ入れるダイアログ。入れた文字を返す（allowEmpty なら空文字もあり）。キャンセルなら null。
// validate(値) が文字を返したら、そのエラーを出して閉じない。
export function promptDialog({ title, label, value = "", okText = "OK", validate = null, allowEmpty = false }) {
  return new Promise((resolve) => {
    let result = null;
    const input = h("input", { type: "text", value, autocomplete: "off", "aria-label": label });
    const error = h("p", { class: "error-text", hidden: true });
    const form = h("form", null,
      h("h2", null, title),
      h("label", { class: "field" }, h("span", { class: "label" }, label), input),
      error,
      h("div", { class: "dialog-buttons" },
        h("button", { type: "button", class: "sub", onclick: () => dialog.close() }, "キャンセル"),
        h("button", { type: "submit" }, okText)));
    const dialog = h("dialog", { class: "dialog" }, form);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input.value.trim();
      const message = text ? (validate?.(text) ?? "") : allowEmpty ? "" : "入力してください";
      if (message) {
        error.textContent = message;
        error.hidden = false;
        return;
      }
      result = text;
      dialog.close();
    });
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(result);
    });
    document.body.append(dialog);
    dialog.showModal();
    input.focus();
    input.select();
  });
}

export function downloadFile(filename, text, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h("a", { href: url, download: filename, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ファイルを選ばせる。キャンセルなら null。
export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = h("input", { type: "file", accept, hidden: true });
    const done = (file) => { input.remove(); resolve(file); };
    input.addEventListener("change", () => done(input.files[0] ?? null));
    input.addEventListener("cancel", () => done(null));
    document.body.append(input);
    input.click();
  });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("コピーしました");
  } catch {
    await confirmDialog({
      title: "コピーできませんでした",
      message: ["長押しで選んでコピーしてください。", h("p", { class: "copy-box" }, text)],
      okText: "閉じる",
      cancelText: null,
    });
  }
}

// columns: [{ label, class?, value: (row) => 文字 or 要素 }]
export function simpleTable(columns, rows) {
  return h("div", { class: "table-wrap" },
    h("table", null,
      h("thead", null, h("tr", null, columns.map((c) => h("th", { class: c.class, scope: "col" }, c.label)))),
      h("tbody", null, rows.map((r) => h("tr", null, columns.map((c) => h("td", { class: c.class }, c.value(r))))))));
}

const CIV_CLASS = { 火: "civ-fire", 自然: "civ-nature", 水: "civ-water", 光: "civ-light", 闇: "civ-dark" };

export function civChips(civs) {
  if (!civs.length) return h("span", { class: "chips" }, h("span", { class: "chip civ civ-zero" }, "ゼロ"));
  return h("span", { class: "chips" }, civs.map((c) => h("span", { class: `chip civ ${CIV_CLASS[c] ?? ""}` }, c)));
}

export function chips(values, extraClass = "") {
  return h("span", { class: "chips" }, values.map((v) => h("span", { class: `chip ${extraClass}` }, v)));
}

export function proxyBadge() {
  return h("span", { class: "badge proxy" }, "プロキシ");
}

// タップで ON/OFF するチップ。selected（Set）を直接書き換える。
export function toggleChips(options, selected, onChange, { civ = false } = {}) {
  const cls = (opt) => {
    const on = selected.has(opt);
    return `chip-btn${on ? " on" : ""}${civ && on ? ` ${CIV_CLASS[opt] ?? ""}` : ""}`;
  };
  return h("div", { class: "chips toggle" }, options.map((opt) => {
    const btn = h("button", { type: "button", class: cls(opt), "aria-pressed": String(selected.has(opt)) }, opt);
    btn.addEventListener("click", () => {
      if (selected.has(opt)) selected.delete(opt);
      else selected.add(opt);
      btn.className = cls(opt);
      btn.setAttribute("aria-pressed", String(selected.has(opt)));
      onChange?.(selected);
    });
    return btn;
  }));
}

// 入力用のモーダル。content は <form class="modal-form"> など。
export function openModal({ title, content, onClose }) {
  const closeBtn = h("button", { type: "button", class: "icon-btn", "aria-label": "閉じる" }, "×");
  const dialog = h("dialog", { class: "modal" },
    h("div", { class: "modal-head" }, h("h2", null, title), closeBtn),
    content);
  closeBtn.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    dialog.remove();
    onClose?.();
  });
  document.body.append(dialog);
  dialog.showModal();
  return { dialog, close: () => dialog.close() };
}

// 端末に記憶する設定（表示の切り替えなど）。使えない環境では既定値で動く。
export function loadPref(key, fallback) {
  try {
    const v = localStorage.getItem(`cgam.${key}`);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function savePref(key, value) {
  try {
    localStorage.setItem(`cgam.${key}`, JSON.stringify(value));
  } catch {
    // 保存できなくても動作は続ける
  }
}

// コスト（ツインパクトや超次元の面は `5//3//2` の形）
export function costText(item) {
  const costs = [item.cost, item.cost2, item.cost3].filter((c) => c != null);
  return costs.length ? costs.join("//") : "—";
}

// 区分（超次元は面ごとの区分を「 / 」でつなぐ）
export function kindText(item) {
  return [item.kind, item.kind2, item.kind3].filter(Boolean).join(" / ");
}

// 横の帯グラフ。segments: [{ label, value, class }]。名前と数は文字でも出す（色だけに頼らない）。
export function stackedBar(segments, { label = "" } = {}) {
  const shown = segments.filter((s) => s.value > 0);
  const bar = h("div", { class: "stacked", role: "img", "aria-label": label },
    shown.map((s) => h("span", { class: `seg ${s.class ?? ""}`, style: `flex-grow:${Number(s.value)}`, title: `${s.label} ${s.value}` })));
  return h("div", null,
    shown.length ? bar : h("p", { class: "muted" }, "なし"),
    h("ul", { class: "legend" }, shown.map((s) => h("li", null, h("span", { class: `swatch ${s.class ?? ""}` }), `${s.label} ${s.value}`))));
}

// 棒グラフ。bins: [{ label, value }]。各棒の上に数を出す。
export function barChart(bins, { label = "" } = {}) {
  const max = Math.max(1, ...bins.map((b) => b.value));
  return h("div", { class: "bars", role: "img", "aria-label": label },
    bins.map((b) => h("div", { class: "bar-col" },
      h("span", { class: "bar-num" }, b.value ? String(b.value) : ""),
      h("div", { class: "bar-track" }, h("div", { class: "bar", style: `height:${Math.round((b.value / max) * 100)}%` })),
      h("span", { class: "bar-label" }, b.label))));
}

// 文明の色のクラス名（civChips と同じ）
export const CIV_CLASSES = CIV_CLASS;
