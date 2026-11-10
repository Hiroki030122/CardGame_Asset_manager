// Excel・JSON の取り込みと書き出し（Excel は段階 6 で追加）。
import {
  SCHEMA_VERSION, LEDGERS, LEDGER_LABELS, ITEM_FIELDS, DEFAULT_SETTINGS, DEFAULT_CUBES, gameId, getState, errorMessage,
} from "./store.js";
import { replaceAll, appendData } from "./actions.js";
import { planAppend, planTotals } from "./merge.js";
import { h, listOf, toast, confirmDialog, choiceDialog, downloadFile, pickFile } from "./ui.js";

const MAX_ERRORS_SHOWN = 20;
const KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// 書き出したファイル名を返す
export function exportJson(data, { backup = false } = {}) {
  const filename = `${gameId}${backup ? "-backup" : ""}-${stamp()}.json`;
  downloadFile(filename, JSON.stringify(data, null, 2));
  return filename;
}

export function describeCounts(data) {
  return [
    ...LEDGERS.map((l) => `${LEDGER_LABELS[l]} ${data[l].length} 件`),
    ...Object.values(data.cubes).map((c) => {
      const copies = (list) => (list ?? []).reduce((n, x) => n + (x.count ?? 1), 0);
      return `${c.name}：メインデッキ ${copies(c.cards)} 枚、超次元 ${copies(c.hypers)} 枚、GR ${copies(c.gr)} 枚、超次元の対応 ${c.hyperLinks.length} 件`;
    }),
  ];
}

// ---- 読み込みと形のチェック ----

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isPosInt = (v) => Number.isInteger(v) && v >= 1;
const isNonNegInt = (v) => Number.isInteger(v) && v >= 0;

function strList(v) {
  if (v == null) return [];
  if (!Array.isArray(v) || !v.every((s) => typeof s === "string")) return null;
  return [...new Set(v.map((s) => s.trim()).filter(Boolean))];
}

function normalizeField(field, v) {
  switch (field) {
    case "name":
      if (typeof v !== "string" || !v.trim()) return { error: "名前がありません" };
      return { value: v.trim() };
    case "cost":
    case "cost2":
    case "cost3":
      if (v == null || v === "") return { value: null };
      if (!isNonNegInt(v)) return { error: `${field} は 0 以上の整数か null にしてください` };
      return { value: v };
    case "kind":
    case "kind2":
    case "kind3":
    case "back":
    case "memo":
      if (v == null) return { value: "" };
      if (typeof v === "number") return { value: String(v) };
      if (typeof v !== "string") return { error: `${field} は文字にしてください` };
      return { value: v };
    case "civs":
    case "attrs":
    case "roles": {
      const list = strList(v);
      return list ? { value: list } : { error: `${field} は文字の配列にしてください` };
    }
    case "proxy":
      if (v == null) return { value: false };
      if (typeof v !== "boolean") return { error: "proxy は true か false にしてください" };
      return { value: v };
    case "owned":
      if (v == null) return { value: 0 };
      if (!isNonNegInt(v)) return { error: "owned（枚数）は 0 以上の整数にしてください" };
      return { value: v };
    default:
      return { value: v };
  }
}

// 論理形式の JSON 文字列を読み、{ data } か { errors } を返す
export function parseLogicalJson(text) {
  let raw;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    return { errors: ["JSON として読めませんでした。ファイルを確かめてください。"] };
  }
  if (!isObject(raw)) return { errors: ["中身の形が違います（{ … } で始まる JSON が必要です）。"] };
  // 1 には proxy が無いので本物（proxy: false）、2 には multi・count が無いので 入れられないモード・1 枚として読む
  if (![1, 2, SCHEMA_VERSION].includes(raw.schemaVersion)) {
    return { errors: [`この形式（schemaVersion: ${raw.schemaVersion ?? "なし"}）には対応していません。`] };
  }

  const errors = [];
  const data = { schemaVersion: SCHEMA_VERSION, settings: {}, counters: {}, cards: [], hypers: [], gr: [], cubes: {} };

  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const v = raw.settings?.[key];
    const list = v === undefined ? [...DEFAULT_SETTINGS[key]] : strList(v);
    if (!list) errors.push(`settings.${key} は文字の配列にしてください。`);
    else data.settings[key] = list;
  }

  for (const ledger of LEDGERS) {
    const v = raw.counters?.[ledger];
    if (v == null) data.counters[ledger] = 0;
    else if (!isNonNegInt(v)) errors.push(`counters.${ledger} は 0 以上の整数にしてください。`);
    else data.counters[ledger] = v;
  }

  for (const ledger of LEDGERS) {
    const list = raw[ledger] ?? [];
    if (!Array.isArray(list)) {
      errors.push(`${ledger} は配列にしてください。`);
      continue;
    }
    const seen = new Set();
    list.forEach((src, i) => {
      const where = `${LEDGER_LABELS[ledger]}の ${i + 1} 件目`;
      if (!isObject(src)) return errors.push(`${where}：形が違います。`);
      if (!isPosInt(src.no)) return errors.push(`${where}：番号（no）は 1 以上の整数にしてください。`);
      if (seen.has(src.no)) return errors.push(`${where}：番号 ${src.no} が重複しています。`);
      seen.add(src.no);
      const item = { no: src.no };
      for (const f of ITEM_FIELDS[ledger]) {
        const r = normalizeField(f, src[f]);
        if (r.error) errors.push(`${where}（No.${src.no}）：${r.error}`);
        else item[f] = r.value;
      }
      data[ledger].push(item);
    });
    data[ledger].sort((a, b) => a.no - b.no);
  }

  const cardNos = new Set(data.cards.map((c) => c.no));
  const hyperNos = new Set(data.hypers.map((c) => c.no));
  const grNos = new Set(data.gr.map((c) => c.no));
  const rawCubes = raw.cubes ?? {};
  if (!isObject(rawCubes)) errors.push("cubes の形が違います。");

  for (const [id, src] of Object.entries(isObject(rawCubes) ? rawCubes : {})) {
    const where = `キューブ ${id}`;
    if (!KEY_PATTERN.test(id)) { errors.push(`${where}：キューブの ID は英数字にしてください。`); continue; }
    if (!isObject(src)) { errors.push(`${where}：形が違います。`); continue; }
    const name = src.name ?? DEFAULT_CUBES[id]?.name ?? `キューブ${id}`;
    const usesGR = src.usesGR ?? DEFAULT_CUBES[id]?.usesGR ?? false;
    const usesHyper = src.usesHyper ?? true;
    const multi = src.multi ?? false;
    if (typeof name !== "string") errors.push(`${where}：name は文字にしてください。`);
    if (typeof usesGR !== "boolean") errors.push(`${where}：usesGR は true か false にしてください。`);
    if (typeof usesHyper !== "boolean") errors.push(`${where}：usesHyper は true か false にしてください。`);
    if (typeof multi !== "boolean") errors.push(`${where}：multi は true か false にしてください。`);

    // キューブの中のリスト（メインデッキ・超次元・GR）。台帳にある番号だけ、同じカードは 1 回まで
    const lists = {};
    for (const [ledger, nos] of [["cards", cardNos], ["hypers", hyperNos], ["gr", grNos]]) {
      const label = LEDGER_LABELS[ledger];
      lists[ledger] = [];
      const inCube = new Set();
      (Array.isArray(src[ledger]) ? src[ledger] : []).forEach((c, i) => {
        const at = `${where} の${label} ${i + 1} 枚目`;
        if (!isObject(c) || !isPosInt(c.no)) return errors.push(`${at}：番号（no）がありません。`);
        if (!nos.has(c.no)) return errors.push(`${at}：${label}に No.${c.no} がありません。`);
        if (inCube.has(c.no)) return errors.push(`${at}：No.${c.no} が 2 回入っています。`);
        inCube.add(c.no);
        const memo = normalizeField("memo", c.memo);
        if (memo.error) return errors.push(`${at}：${memo.error}`);
        const count = c.count ?? 1;
        if (!isPosInt(count)) return errors.push(`${at}：枚数（count）は 1 以上の整数にしてください。`);
        if (count > 1 && multi !== true) {
          return errors.push(`${at}：枚数が 2 以上ですが、このキューブは同名を複数枚入れられないモードです（multi を true にしてください）。`);
        }
        lists[ledger].push({ no: c.no, memo: memo.value, count });
      });
      if (src[ledger] != null && !Array.isArray(src[ledger])) errors.push(`${where}：${ledger} は配列にしてください。`);
    }

    const hyperLinks = [];
    const linkIds = new Set();
    (Array.isArray(src.hyperLinks) ? src.hyperLinks : []).forEach((l, i) => {
      const at = `${where} の超次元の対応 ${i + 1} 件目`;
      if (!isObject(l)) return errors.push(`${at}：形が違います。`);
      const linkId = l.id ?? crypto.randomUUID();
      if (typeof linkId !== "string" || !KEY_PATTERN.test(linkId)) return errors.push(`${at}：id は英数字とハイフンにしてください。`);
      if (linkIds.has(linkId)) return errors.push(`${at}：id「${linkId}」が重複しています。`);
      if (!cardNos.has(l.parent)) return errors.push(`${at}：付属先のメインデッキ No.${l.parent} がありません。`);
      if (!hyperNos.has(l.hyper)) return errors.push(`${at}：超次元 No.${l.hyper} がありません。`);
      const memo = normalizeField("memo", l.memo);
      if (memo.error) return errors.push(`${at}：${memo.error}`);
      linkIds.add(linkId);
      hyperLinks.push({ id: linkId, parent: l.parent, hyper: l.hyper, memo: memo.value });
    });
    if (src.hyperLinks != null && !Array.isArray(src.hyperLinks)) errors.push(`${where}：hyperLinks は配列にしてください。`);

    data.cubes[id] = { name, usesGR, usesHyper, multi, cards: lists.cards, hypers: lists.hypers, gr: lists.gr, hyperLinks };
  }
  return errors.length ? { errors } : { data };
}

// ---- 「JSON を取り込む」の流れ（置き換え／追加） ----

export async function importJson() {
  const file = await pickFile(".json,application/json");
  if (!file) return;

  let text;
  try {
    text = await file.text();
  } catch {
    toast("ファイルを読めませんでした", "error");
    return;
  }

  const { data, errors } = parseLogicalJson(text);
  if (errors) {
    const shown = errors.slice(0, MAX_ERRORS_SHOWN);
    if (errors.length > shown.length) shown.push(`ほか ${errors.length - shown.length} 件`);
    await confirmDialog({
      title: "取り込めません",
      message: [`「${file.name}」に次の問題があります。`, listOf(shown)],
      okText: "閉じる",
      cancelText: null,
    });
    return;
  }

  const st = getState();
  if (st.loading || st.readError) {
    toast("今のデータを読み込めていないため、取り込めません。少し待ってからやり直してください。", "error");
    return;
  }
  const current = st.exists ? st.data : null;

  let mode = "replace";
  if (current) {
    mode = await choiceDialog({
      title: "JSON を取り込む",
      message: [
        `「${file.name}」の内容：`,
        listOf(describeCounts(data)),
        "追加：今のデータは残して、この内容を足します。同じ名前のカードは枚数だけ足されます。",
        "置き換え：今のデータはすべて消えて、この内容になります。",
      ],
      choices: [
        { value: "append", label: "追加" },
        { value: "replace", label: "置き換え", danger: true },
      ],
    });
    if (!mode) return;
  }

  if (mode === "append") await appendFlow(data, current);
  else await replaceFlow(data, file, current);
}

async function replaceFlow(data, file, current) {
  const ok = await confirmDialog({
    title: "JSON を取り込む（置き換え）",
    message: [
      `「${file.name}」の内容：`,
      listOf(describeCounts(data)),
      current
        ? "今のデータはすべて消えて、この内容に置き換わります。置き換える直前に、今のデータを JSON に自動で書き出します。"
        : "まだデータが無いので、この内容で作成します。",
    ],
    okText: current ? "次へ" : "取り込む",
  });
  if (!ok) return;

  if (current) {
    const sure = await confirmDialog({
      title: "本当に置き換えますか？",
      message: [
        h("div", null, "今のデータ：", listOf(describeCounts(current))),
        "置き換えた後は、自動で書き出した JSON を取り込み直さない限り元に戻せません。",
      ],
      okText: "置き換える",
      danger: true,
    });
    if (!sure) return;
    const backupName = exportJson(current, { backup: true });
    toast(`今のデータを「${backupName}」に書き出しました`);
  }

  // 書き込みの失敗はヘッダーの保存状態とトーストで知らせる
  replaceAll(data).catch(() => {});
  toast(current ? "置き換えました" : "取り込みました");
}

// 追加の確認に出す、計画の説明
export function describePlan(plan) {
  const lines = [];
  for (const ledger of LEDGERS) {
    const { created, added } = plan.ledgers[ledger];
    if (created.length || added.length) {
      lines.push(`${LEDGER_LABELS[ledger]}：新規 ${created.length} 件、枚数加算 ${added.length} 件`);
    }
  }
  const t = planTotals(plan);
  if (t.cubeCards || t.cubeHypers || t.cubeGr || t.cubeLinks) {
    lines.push(`キューブ：メインデッキ ${t.cubeCards} 種類、超次元 ${t.cubeHypers} 種類、GR ${t.cubeGr} 種類、超次元の対応 ${t.cubeLinks} 件を追加`);
  }
  if (t.settings) lines.push(`選択肢：${t.settings} 件を追加`);
  return lines;
}

async function appendFlow(data, current) {
  const plan = planAppend(current, data);
  const lines = describePlan(plan);
  const message = [lines.length ? listOf(lines) : "足すものがありません。"];
  if (plan.warnings.length) message.push("入れなかったもの：", listOf(plan.warnings.slice(0, MAX_ERRORS_SHOWN)));
  message.push("今のデータは消えません。");

  const ok = await confirmDialog({
    title: "JSON を追加する",
    message,
    okText: lines.length ? "追加する" : "閉じる",
    cancelText: lines.length ? "キャンセル" : null,
  });
  if (!ok || !lines.length) return;

  try {
    const done = await appendData(data);
    const t = planTotals(done);
    toast(`追加しました（新規 ${t.created} 件、枚数加算 ${t.added} 件）`);
  } catch (err) {
    console.error(err);
    toast(`追加できませんでした（${errorMessage(err)}）`, "error");
  }
}
