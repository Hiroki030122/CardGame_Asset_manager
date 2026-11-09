// 設定。段階 1 では、アカウント・JSON の取り込み／書き出し・選択肢の表示・データの大きさ。
import { h, section, simpleTable, chips, toast } from "../ui.js";
import { gameId, isTestGame, CHUNK_SIZE, CHUNK_WARN_BYTES, LEDGER_LABELS, SETTING_LABELS } from "../store.js";
import { login, logout } from "../firebase.js";
import { exportJson, importJsonReplace } from "../excel.js";

export function render(ctx) {
  const { state } = ctx;
  const parts = [accountSection(ctx), transferSection(ctx)];
  if (state.readError) parts.push(h("p", { class: "error-text" }, "データを読み込めませんでした。"));
  else if (state.loading) parts.push(h("p", { class: "muted" }, "読み込み中…"));
  else if (state.data) parts.push(choicesSection(state.data.settings), sizeSection(state.chunks));
  return parts;
}

function accountSection({ user, admin }) {
  if (!user) {
    return section("アカウント",
      h("p", null, "ログインしていません（閲覧のみ）。"),
      h("button", { onclick: () => login().catch((e) => toast(e.message, "error")) }, "Google でログイン"));
  }
  return section("アカウント",
    h("p", null, `${user.displayName || ""}（${user.email || user.uid}）でログイン中`),
    h("p", { class: admin ? "muted" : "warn-text" }, admin ? "管理者として編集できます。" : "このアカウントは閲覧のみです。"),
    h("button", { class: "sub", onclick: () => logout() }, "ログアウト"));
}

function transferSection({ state, admin }) {
  const canExport = !!state.data;
  return section("取り込み・書き出し",
    h("p", { class: "muted" }, `データの場所：games/${gameId}`, isTestGame ? "（動作確認用）" : ""),
    h("div", { class: "buttons" },
      h("button", { class: "sub", disabled: !canExport, onclick: () => exportJson(state.data) }, "JSON を書き出す"),
      admin ? h("button", { class: "sub", onclick: importJsonReplace }, "JSON を取り込む（置き換え）") : null),
    admin ? null : h("p", { class: "muted" }, "取り込みは管理者だけができます。"));
}

function choicesSection(settings) {
  return section("選択肢",
    h("dl", { class: "choices" },
      Object.entries(SETTING_LABELS).map(([key, label]) => [
        h("dt", null, label),
        h("dd", null, settings[key].length ? chips(settings[key]) : h("span", { class: "muted" }, "なし")),
      ])),
    h("p", { class: "muted" }, "選択肢の編集は、あとの段階で追加します。"));
}

function sizeSection(chunks) {
  if (!chunks.length) return section("データの大きさ", h("p", { class: "muted" }, "まだカードがありません。"));
  return section("データの大きさ",
    simpleTable([
      { label: "まとまり", value: chunkLabel },
      { label: "件数", class: "num", value: (c) => c.count },
      { label: "大きさ", class: "num", value: (c) => `${Math.ceil(c.bytes / 1024)} KB` },
      { label: "", value: (c) => (c.bytes > CHUNK_WARN_BYTES ? h("span", { class: "warn-text" }, "⚠ 700KB を超えています") : "") },
    ], chunks),
    h("p", { class: "muted" }, `カードは ${CHUNK_SIZE} 件ずつ 1 つのまとまりに保存しています（1 つの上限は 1MB）。`));
}

function chunkLabel(c) {
  if (!c.ledger) return c.id;
  const from = c.index * CHUNK_SIZE + 1;
  return `${LEDGER_LABELS[c.ledger]} No.${from}〜${from + CHUNK_SIZE - 1}`;
}
