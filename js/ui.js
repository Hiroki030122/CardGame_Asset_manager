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

export function costText(item) {
  const cost = item.cost ?? "—";
  return item.cost2 != null ? `${cost}//${item.cost2}` : String(cost);
}
