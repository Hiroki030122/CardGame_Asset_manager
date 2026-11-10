// 設定。アカウント、JSON の取り込み／書き出し、選択肢の編集、データの大きさ。
import { h, section, simpleTable, chips, toast, confirmDialog, promptDialog } from "../ui.js";
import {
  gameId, isTestGame, CHUNK_SIZE, CHUNK_WARN_BYTES, LEDGER_LABELS, SETTING_LABELS, getState, errorMessage,
} from "../store.js";
import { login, logout } from "../firebase.js";
import { exportJson, importJson } from "../excel.js";
import { choiceUsage, nextCubeId } from "../calc.js";
import {
  addChoice, setChoiceOrder, changeChoice, createCube, renameCube, setCubeUsesGR, setCubeUsesHyper, setCubeOrder, deleteCube,
} from "../actions.js";
import { changeMulti } from "./cubeOps.js";

export function render(ctx) {
  const { state } = ctx;
  const parts = [accountSection(ctx), transferSection(ctx)];
  if (state.readError) parts.push(h("p", { class: "error-text" }, "データを読み込めませんでした。"));
  else if (state.loading) parts.push(h("p", { class: "muted" }, "読み込み中…"));
  else if (state.data) parts.push(cubesSection(state.data, ctx.admin), choicesSection(state.data.settings, ctx.admin), sizeSection(state.chunks));
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
      admin ? h("button", { class: "sub", onclick: importJson }, "JSON を取り込む") : null),
    admin ? null : h("p", { class: "muted" }, "取り込みは管理者だけができます。"));
}

// ---- キューブ（追加・名前変更・並べ替え・削除・GR・同名の複数枚） ----

function cubesSection(data, admin) {
  const ids = Object.keys(data.cubes);
  const rows = ids.map((id, i) => {
    const cube = data.cubes[id];
    const gr = h("input", { type: "checkbox" });
    gr.checked = cube.usesGR;
    gr.addEventListener("change", () => setCubeUsesGR(id, gr.checked).catch(() => {}));
    const hyper = h("input", { type: "checkbox" });
    hyper.checked = cube.usesHyper;
    hyper.addEventListener("change", () => setCubeUsesHyper(id, hyper.checked).catch(() => {}));
    const multi = h("input", { type: "checkbox" });
    multi.checked = cube.multi;
    multi.addEventListener("change", async () => {
      await changeMulti(id, multi.checked);
      multi.checked = !!getState().data?.cubes[id]?.multi;
    });
    const move = (to) => {
      const next = [...ids];
      [next[i], next[to]] = [next[to], next[i]];
      setCubeOrder(next).catch(() => {});
    };
    return h("li", { class: "cube-setting" },
      h("div", { class: "cube-setting-head" },
        h("strong", { class: "choice-name" }, cube.name),
        h("span", { class: "muted" }, `メインデッキ ${cube.cards.length} 種類・超次元 ${(cube.hypers ?? []).length} 種類・GR ${(cube.gr ?? []).length} 種類`),
        admin
          ? h("span", { class: "stepper" },
            h("button", { type: "button", class: "sub small", disabled: i === 0, "aria-label": `${cube.name}を上へ`, onclick: () => move(i - 1) }, "↑"),
            h("button", { type: "button", class: "sub small", disabled: i === ids.length - 1, "aria-label": `${cube.name}を下へ`, onclick: () => move(i + 1) }, "↓"),
            h("button", { type: "button", class: "sub small", onclick: () => onRenameCube(id) }, "名前変更"),
            h("button", { type: "button", class: "sub small", onclick: () => onDeleteCube(id) }, "削除"))
          : null),
      h("div", { class: "cube-setting-opts" },
        admin
          ? [
            h("label", { class: "check" }, gr, "GR を使う"),
            h("label", { class: "check" }, hyper, "超次元を使う"),
            h("label", { class: "check" }, multi, "同名カードを所持数まで複数枚入れられる"),
          ]
          : [
            h("span", null, cube.usesGR ? "GR を使う" : "GR を使わない"),
            h("span", null, cube.usesHyper ? "超次元を使う" : "超次元を使わない"),
            h("span", null, cube.multi ? "同名カード：複数枚OK" : "同名カード：1 枚だけ"),
          ]));
  });
  return section("キューブ",
    rows.length ? h("ul", { class: "cube-settings" }, rows) : h("p", { class: "muted" }, "キューブがありません。"),
    admin ? h("button", { type: "button", class: "sub small", onclick: onAddCube }, "＋ キューブを追加") : null);
}

const cubeNameCheck = (exceptId) => (text) => (
  Object.entries(getState().data?.cubes ?? {}).some(([id, c]) => id !== exceptId && c.name === text) ? "同じ名前のキューブがあります" : "");

async function onAddCube() {
  const data = getState().data;
  if (!data) return;
  const name = await promptDialog({ title: "キューブを追加", label: "名前", okText: "追加", validate: cubeNameCheck(null) });
  if (!name) return;
  const latest = getState().data;
  try {
    await createCube(name, nextCubeId(latest.cubes), Object.keys(latest.cubes).length);
    toast(`「${name}」を追加しました`);
  } catch (err) {
    console.error(err);
    toast(`追加できませんでした（${errorMessage(err)}）`, "error");
  }
}

async function onRenameCube(id) {
  const cube = getState().data?.cubes[id];
  if (!cube) return;
  const name = await promptDialog({ title: "キューブの名前を変える", label: "新しい名前", value: cube.name, okText: "変更", validate: cubeNameCheck(id) });
  if (!name || name === cube.name) return;
  renameCube(id, name).catch(() => {});
}

async function onDeleteCube(id) {
  const data = getState().data;
  const cube = data?.cubes[id];
  if (!cube) return;
  const kinds = cube.cards.length + (cube.hypers ?? []).length + (cube.gr ?? []).length;
  const filled = kinds > 0 || cube.hyperLinks.length > 0;
  const ok = await confirmDialog({
    title: `「${cube.name}」を削除しますか？`,
    message: [
      filled
        ? `入っているカード（メインデッキ ${cube.cards.length} 種類・超次元 ${(cube.hypers ?? []).length} 種類・GR ${(cube.gr ?? []).length} 種類）と、超次元の対応 ${cube.hyperLinks.length} 件も一緒に消えます。元に戻せません。`
        : "中身は空です。",
      filled ? "削除する前に、今のデータを JSON に自動で書き出します。" : null,
    ].filter(Boolean),
    okText: "削除する",
    danger: filled,
  });
  if (!ok) return;
  const latest = getState().data;
  if (!latest?.cubes[id]) return;
  if (filled) toast(`今のデータを「${exportJson(latest, { backup: true })}」に書き出しました`);
  deleteCube(id, Object.keys(latest.cubes).filter((x) => x !== id)).catch(() => {});
  toast(`「${cube.name}」を削除しました`);
}

const EDITABLE_CHOICES = ["attributes", "roles", "kinds", "hyperKinds", "grKinds"];

function choicesSection(settings, admin) {
  return section("選択肢",
    h("div", { class: "choice-group" },
      h("h3", null, SETTING_LABELS.civs),
      chips(settings.civs),
      h("p", { class: "muted" }, "文明は固定で、編集できません。")),
    EDITABLE_CHOICES.map((key) => choiceGroup(key, settings[key], admin)),
    admin ? null : h("p", { class: "muted" }, "選択肢の編集は管理者だけができます。"));
}

function choiceGroup(key, list, admin) {
  const label = SETTING_LABELS[key];
  const swap = (i, j) => {
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setChoiceOrder(key, next).catch(() => {});
  };
  const rows = list.map((value, i) => h("li", null,
    h("span", { class: "choice-name" }, value),
    admin
      ? h("span", { class: "stepper" },
        h("button", { type: "button", class: "sub small", disabled: i === 0, "aria-label": `${value}を上へ`, onclick: () => swap(i, i - 1) }, "↑"),
        h("button", { type: "button", class: "sub small", disabled: i === list.length - 1, "aria-label": `${value}を下へ`, onclick: () => swap(i, i + 1) }, "↓"),
        h("button", { type: "button", class: "sub small", onclick: () => onRename(key, value) }, "名前変更"),
        h("button", { type: "button", class: "sub small", onclick: () => onDelete(key, value) }, "削除"))
      : null));
  return h("div", { class: "choice-group" },
    h("h3", null, label),
    list.length ? h("ul", { class: "choice-list" }, rows) : h("p", { class: "muted" }, "なし"),
    admin ? h("button", { type: "button", class: "sub small", onclick: () => onAdd(key) }, `＋ ${label}を追加`) : null);
}

const dupMessage = (key) => (text) => (getState().data?.settings[key].includes(text) ? "すでにあります" : "");

async function onAdd(key) {
  const name = await promptDialog({ title: `${SETTING_LABELS[key]}を追加`, label: "名前", okText: "追加", validate: dupMessage(key) });
  if (name) addChoice(key, name, getState().data.settings[key]).catch(() => {});
}

async function onRename(key, from) {
  const to = await promptDialog({
    title: `「${from}」の名前を変える`,
    label: "新しい名前",
    value: from,
    okText: "変更",
    validate: (text) => (text !== from ? dupMessage(key)(text) : ""),
  });
  if (!to || to === from) return;
  const data = getState().data;
  if (!data) return;
  changeChoice(key, from, to, data).catch(() => {});
  const { total } = choiceUsage(data, key, from);
  toast(total ? `「${to}」に変えました（${total} 枚のカードも書き換えました）` : `「${to}」に変えました`);
}

async function onDelete(key, value) {
  const data = getState().data;
  if (!data) return;
  const { total } = choiceUsage(data, key, value);
  const ok = await confirmDialog({
    title: `「${value}」を削除しますか？`,
    message: total
      ? [`${total} 枚のカードで使われています。削除すると、これらのカードからも外れます。`, "元に戻せません。"]
      : "どのカードでも使われていません。",
    okText: "削除する",
    danger: total > 0,
  });
  if (!ok) return;
  const latest = getState().data;
  if (!latest) return;
  changeChoice(key, value, null, latest).catch(() => {});
  toast(`「${value}」を削除しました`);
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
