// calc.js のテスト。`node tests/calc.test.mjs`、または tests/calc.test.html をブラウザで開いて実行する。
import { cubeIndex, cardUse, usagePlaces, firstFreeNo, canDelete } from "../js/calc.js";

const cubes = {
  A: {
    name: "キューブA", usesGR: true,
    cards: [{ no: 1, memo: "" }, { no: 2, memo: "" }],
    hyperLinks: [{ id: "l1", parent: 2, hyper: 1, memo: "" }],
  },
  B: {
    name: "キューブB", usesGR: false,
    cards: [{ no: 2, memo: "" }],
    hyperLinks: [{ id: "l2", parent: 3, hyper: 1, memo: "" }],
  },
};
const index = cubeIndex(cubes);

function eq(actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`期待 ${e}、実際 ${a}`);
}

const tests = [
  ["どのキューブにも入っていない：使用 0、残り＝所持", () => {
    const u = cardUse({ no: 5, owned: 2 }, index);
    eq(u.byCube, { A: 0, B: 0 });
    eq(u.remaining, 2);
  }],
  ["A だけに入っている：A で 1、残り＝所持 − 1", () => {
    const u = cardUse({ no: 1, owned: 3 }, index);
    eq(u.byCube, { A: 1, B: 0 });
    eq(u.remaining, 2);
  }],
  ["A と B の両方に入っていて所持 1：残り −1（足りない）", () => {
    const u = cardUse({ no: 2, owned: 1 }, index);
    eq(u.byCube, { A: 1, B: 1 });
    eq(u.used, 2);
    eq(u.remaining, -1);
  }],
  ["所持 0 で A に入っている：残り −1", () => {
    eq(cardUse({ no: 1, owned: 0 }, index).remaining, -1);
  }],
  ["キューブが空：使用 0", () => {
    const empty = cubeIndex({ A: { cards: [], hyperLinks: [] }, B: { cards: [], hyperLinks: [] } });
    eq(cardUse({ no: 1, owned: 1 }, empty), { byCube: { A: 0, B: 0 }, used: 0, remaining: 1 });
  }],
  ["使われている場所：キューブに入っている＋付属先", () => {
    eq(usagePlaces("cards", 2, cubes), [
      { cube: "A", type: "card" },
      { cube: "A", type: "parent", count: 1 },
      { cube: "B", type: "card" },
    ]);
  }],
  ["使われている場所：付属先としてだけ使われている", () => {
    eq(usagePlaces("cards", 3, cubes), [{ cube: "B", type: "parent", count: 1 }]);
  }],
  ["使われている場所：どこにも無いカードは空", () => {
    eq(usagePlaces("cards", 9, cubes), []);
  }],
  ["使われている場所：超次元は関連の数", () => {
    eq(usagePlaces("hypers", 1, cubes), [
      { cube: "A", type: "hyper", count: 1 },
      { cube: "B", type: "hyper", count: 1 },
    ]);
  }],
  ["使われている場所：GR はキューブと紐づかない", () => {
    eq(usagePlaces("gr", 1, cubes), []);
  }],
  ["空き番号：空のチャンクは先頭", () => {
    eq(firstFreeNo({}, 1, 500), 1);
    eq(firstFreeNo({}, 501, 1000), 501);
  }],
  ["空き番号：途中の抜けを埋める", () => {
    eq(firstFreeNo({ 1: {}, 2: {}, 4: {} }, 1, 500), 3);
    eq(firstFreeNo({ 2: {}, 3: {} }, 1, 500), 1);
  }],
  ["空き番号：抜けが無ければ最後の次", () => {
    eq(firstFreeNo({ 1: {}, 2: {}, 3: {} }, 1, 500), 4);
  }],
  ["空き番号：チャンクが全部埋まっていれば null", () => {
    const full = {};
    for (let n = 1; n <= 500; n++) full[n] = {};
    eq(firstFreeNo(full, 1, 500), null);
  }],
  ["削除：所持が残っていれば不可", () => {
    eq(canDelete("cards", { no: 9, owned: 2 }, cubes), { ok: false, reasons: [{ type: "owned", count: 2 }] });
  }],
  ["削除：キューブに入っていれば不可（所持 0 でも）", () => {
    const r = canDelete("cards", { no: 1, owned: 0 }, cubes);
    eq(r.ok, false);
    eq(r.reasons, [{ cube: "A", type: "card" }]);
  }],
  ["削除：所持 0 でどこにも使われていなければ可", () => {
    eq(canDelete("cards", { no: 9, owned: 0 }, cubes), { ok: true, reasons: [] });
  }],
];

export function run() {
  return tests.map(([name, fn]) => {
    try {
      fn();
      return { name, ok: true };
    } catch (e) {
      return { name, ok: false, message: e.message };
    }
  });
}

if (globalThis.process?.argv?.[1]?.endsWith("calc.test.mjs")) {
  const results = run();
  for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.ok ? "" : `：${r.message}`}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `${failed} 件失敗` : `すべて成功（${results.length} 件）`);
  process.exitCode = failed ? 1 : 0;
}
