// calc.js のテスト。`node tests/calc.test.mjs`、または tests/calc.test.html をブラウザで開いて実行する。
import {
  cubeIndex, cardUse, usagePlaces, firstFreeNo, canDelete, choiceChanges, choiceUsage,
  cubeEntries, cubeAddCheck, civTotals, costHistogram, cubeSummary, cubeProblems, nextCubeId,
  hyperUse, grUse, linkAddCheck, hyperRemoveCheck, cubeLinks, linksByHyper, linksByParent, linkSummary, linkPairs, hasSearchCondition,
} from "../js/calc.js";

// キューブ 3 つ（X：1 枚だけ、Y：複数枚OK、Z：空）。No.1 は所持 2 で X に 1 枚・Y に 2 枚入っている
const mini = () => ({
  settings: { civs: ["火", "自然", "水", "光", "闇"] },
  hypers: [],
  gr: [],
  cards: [
    { no: 1, name: "A", proxy: false, owned: 2, civs: ["火"], cost: 3, cost2: null },
    { no: 2, name: "A", proxy: true, owned: 1, civs: ["火", "水"], cost: 5, cost2: 2 },
    { no: 3, name: "B", proxy: false, owned: 0, civs: [], cost: 12, cost2: null },
    { no: 4, name: "C", proxy: false, owned: 1, civs: ["闇"], cost: null, cost2: null },
  ],
  cubes: {
    X: { name: "X", usesGR: false, multi: false, cards: [{ no: 1, memo: "", count: 1 }], hypers: [], gr: [], hyperLinks: [] },
    Y: { name: "Y", usesGR: false, multi: true, cards: [{ no: 1, memo: "", count: 2 }, { no: 3, memo: "", count: 1 }], hypers: [], gr: [], hyperLinks: [] },
    Z: { name: "Z", usesGR: false, multi: false, cards: [], hypers: [], gr: [], hyperLinks: [] },
  },
});

const choiceData = {
  cards: [
    { no: 1, attrs: ["SA", "ST"], roles: [], kind: "呪文" },
    { no: 2, attrs: ["ST"], roles: ["除去"], kind: "クリーチャー" },
  ],
  hypers: [
    { no: 1, kind: "サイキック・クリーチャー", kind2: "", kind3: "", attrs: [], roles: [] },
    { no: 2, kind: "ドラグハート・ウエポン", kind2: "ドラグハート・クリーチャー", kind3: "ドラグハート・ウエポン", attrs: ["MF"], roles: ["受け札"] },
  ],
  gr: [{ no: 1, kind: "クリーチャー", attrs: ["SA"], roles: [] }],
};

// 超次元 No.1（所持 4）・No.2（所持 1）、GR No.1（所持 2）。キューブ C は超次元を使わず、キューブ B は GR を使わない
const hdata = () => ({
  cards: [{ no: 1, name: "P1" }, { no: 2, name: "P2" }],
  hypers: [{ no: 1, name: "H1", owned: 4 }, { no: 2, name: "H2", owned: 1 }],
  gr: [{ no: 1, name: "G1", owned: 2 }],
  cubes: {
    A: {
      name: "A", usesHyper: true, usesGR: true, multi: false,
      cards: [{ no: 1, count: 1 }, { no: 2, count: 1 }], hypers: [{ no: 1, count: 2 }], gr: [{ no: 1, count: 1 }],
      hyperLinks: [{ id: "a", parent: 1, hyper: 1 }, { id: "b", parent: 2, hyper: 1 }],
    },
    B: {
      name: "B", usesHyper: true, usesGR: false, multi: true,
      cards: [{ no: 1, count: 1 }], hypers: [{ no: 1, count: 1 }, { no: 2, count: 1 }], gr: [{ no: 1, count: 1 }],
      hyperLinks: [{ id: "e", parent: 1, hyper: 1 }, { id: "g", parent: 2, hyper: 1 }],
    },
    C: { name: "C", usesHyper: false, usesGR: true, multi: false, cards: [], hypers: [{ no: 1, count: 3 }], gr: [{ no: 1, count: 1 }], hyperLinks: [] },
  },
});

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
  ["使われている場所：超次元は対応の数", () => {
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
  ["選択肢の名前変更：使っているカードの値を置き換える（所持カードと GR）", () => {
    eq(choiceChanges(choiceData, "attributes", "SA", "新"), [
      { ledger: "cards", no: 1, field: "attrs", value: ["新", "ST"] },
      { ledger: "gr", no: 1, field: "attrs", value: ["新"] },
    ]);
  }],
  ["選択肢の削除：使っているカードから外す", () => {
    eq(choiceChanges(choiceData, "attributes", "SA", null), [
      { ledger: "cards", no: 1, field: "attrs", value: ["ST"] },
      { ledger: "gr", no: 1, field: "attrs", value: [] },
    ]);
  }],
  ["選択肢の名前変更：すでにある値と同じになっても重ならない", () => {
    eq(choiceChanges(choiceData, "attributes", "SA", "ST")[0].value, ["ST"]);
  }],
  ["選択肢の削除：区分は空にする", () => {
    eq(choiceChanges(choiceData, "kinds", "呪文", null), [{ ledger: "cards", no: 1, field: "kind", value: "" }]);
  }],
  ["選択肢：使っていない値は何も書き換えない", () => {
    eq(choiceChanges(choiceData, "roles", "ドロー", null), []);
  }],
  ["使用数：3 つのキューブの枚数の合計。残りは所持 − 使用数", () => {
    const d = mini();
    const u = cardUse(d.cards[0], cubeIndex(d.cubes));
    eq(u.byCube, { X: 1, Y: 2, Z: 0 });
    eq(u.used, 3);
    eq(u.remaining, -1);
  }],
  ["キューブに入れる：残りが無ければ止める（stock）", () => {
    eq(cubeAddCheck(mini(), "Z", "cards", mini().cards[0]).reason, "stock");
  }],
  ["キューブに入れる：使っていないカードは入れられる", () => {
    eq(cubeAddCheck(mini(), "Z", "cards", mini().cards[3]).ok, true);
  }],
  ["キューブに入れる：1 枚だけのモードでは、本物とプロキシを問わず同名は止める（name）", () => {
    const r = cubeAddCheck(mini(), "X", "cards", mini().cards[1]);
    eq(r.ok, false);
    eq(r.reason, "name");
    eq(r.card.no, 1);
  }],
  ["キューブに入れる：複数枚OKのモードでは、同名でも残りがあれば入れられる", () => {
    eq(cubeAddCheck(mini(), "Y", "cards", mini().cards[1]).ok, true);
  }],
  ["文明の延べ：多色は各文明に枚数ぶん、ゼロ文明は別枠", () => {
    const d = mini();
    const t = civTotals([{ card: d.cards[1], count: 2 }, { card: d.cards[2], count: 1 }], d.settings.civs);
    eq(t.byCiv, { 火: 2, 自然: 0, 水: 2, 光: 0, 闇: 0 });
    eq([t.zero, t.multi, t.total], [1, 2, 4]);
  }],
  ["コストの山：枚数ぶん・cost2・10 以上・コスト無し", () => {
    const d = mini();
    const bins = costHistogram(cubeEntries({ ...d, cubes: { Q: { ...d.cubes.Y, cards: [
      { no: 1, count: 2 }, { no: 2, count: 1 }, { no: 3, count: 1 }, { no: 4, count: 1 },
    ] } } }, "Q"));
    eq(bins, [0, 0, 1, 2, 0, 1, 0, 0, 0, 0, 1]);
  }],
  ["キューブの集計：種類数・枚数・足りない数", () => {
    const sum = cubeSummary(mini(), "Y");
    eq([sum.kinds, sum.copies, sum.shortage], [2, 3, 2]);
    eq(sum.civ.byCiv.火, 2);
  }],
  ["問題のあるカード：1 枚だけのモードで複数枚・同名が複数", () => {
    const d = mini();
    d.cubes.X.cards = [{ no: 1, memo: "", count: 2 }, { no: 2, memo: "", count: 1 }];
    eq(cubeProblems(d, "X"), [
      { ledger: "cards", no: 1, type: "count" }, { ledger: "cards", no: 1, type: "name" }, { ledger: "cards", no: 2, type: "name" },
    ]);
    eq(cubeProblems(d, "Y"), []);
  }],
  ["新しいキューブの ID：使われていない英大文字", () => {
    eq(nextCubeId({ A: 1, B: 1 }), "C");
    eq(nextCubeId({ B: 1 }), "A");
    const full = Object.fromEntries(Array.from({ length: 26 }, (_, i) => [String.fromCharCode(65 + i), 1]));
    eq(nextCubeId(full), "cube-2");
  }],
  ["選択肢の使用数：台帳ごとに数える", () => {
    eq(choiceUsage(choiceData, "attributes", "SA"), { total: 2, byLedger: { cards: 1, gr: 1 } });
    eq(choiceUsage(choiceData, "hyperKinds", "サイキック・クリーチャー"), { total: 1, byLedger: { hypers: 1 } });
    eq(choiceUsage(choiceData, "roles", "ドロー"), { total: 0, byLedger: {} });
  }],
  ["超次元の使用：キューブに入れた枚数の合計（超次元を使わないキューブは数えない）", () => {
    const d = hdata();
    const u = hyperUse(d.hypers[0], d.cubes);
    eq(u.byCube, { A: 2, B: 1, C: 0 });
    eq([u.used, u.remaining], [3, 1]);
    eq(hyperUse(d.hypers[1], d.cubes).remaining, 0);
  }],
  ["GR の使用：GR を使うキューブに入れた枚数の合計", () => {
    const d = hdata();
    const u = grUse(d.gr[0], d.cubes);
    eq(u.byCube, { A: 1, B: 0, C: 1 });
    eq([u.used, u.remaining], [2, 0]);
  }],
  ["超次元・GR を入れる：残りが無ければ止める／1 枚だけのモードでは同名を止める／使わないキューブには入れない", () => {
    const d = hdata();
    eq(cubeAddCheck(d, "A", "hypers", d.hypers[1]).reason, "stock");
    eq(cubeAddCheck(d, "A", "hypers", d.hypers[0]).reason, "name");
    d.cubes.A.multi = true;
    eq(cubeAddCheck(d, "A", "hypers", d.hypers[0]).ok, true);
    eq(cubeAddCheck(d, "B", "gr", d.gr[0]).reason, "unused");
    eq(cubeAddCheck(d, "C", "hypers", d.hypers[0]).reason, "unused");
    eq(cubeAddCheck(d, "A", "gr", d.gr[0]).reason, "stock");
  }],
  ["対応を付ける：付属先・超次元がキューブに入っていて、入れた枚数に達していなければ付けられる", () => {
    const d = hdata();
    eq(linkAddCheck(d, "A", 1, 1).reason, "full");
    eq(linkAddCheck(d, "A", 9, 1).reason, "parent");
    eq(linkAddCheck(d, "A", 1, 2).reason, "hyper");
    eq(linkAddCheck(d, "B", 1, 2).ok, true);
    d.cubes.A.hypers[0].count = 3;
    eq(linkAddCheck(d, "A", 1, 1).ok, true);
  }],
  ["超次元を外す：外すと対応の数が枚数を超えるなら止める", () => {
    const d = hdata();
    eq(hyperRemoveCheck(d, "A", 1, 1).reason, "links");
    eq(hyperRemoveCheck(d, "A", 1, 2).ok, true);
    eq(hyperRemoveCheck(d, "A", 1, 0).links, 2);
  }],
  ["対応の一覧：付属先がメインデッキに入っているか／超次元がキューブに入っているか", () => {
    const d = hdata();
    eq(cubeLinks(d, "B").map((l) => `${l.id}:${l.registered}:${l.hyperRegistered}`), ["e:true:true", "g:false:true"]);
    eq(cubeLinks(d, "A").map((l) => l.id), ["a", "b"]);
    d.cubes.A.hypers = [];
    eq(cubeLinks(d, "A").map((l) => l.hyperRegistered), [false, false]);
  }],
  ["超次元ごとの対応：入れた枚数・対応の数・足りない枚数", () => {
    const d = hdata();
    eq(linksByHyper(d, "A").map((x) => [x.hyper.no, x.count, x.links.length, x.free]), [[1, 2, 2, 0]]);
    eq(linksByHyper(d, "B").map((x) => [x.hyper.no, x.count, x.links.length, x.free]), [[1, 1, 2, 0], [2, 1, 0, 1]]);
    eq(linksByHyper(d, "B")[0].links.map((l) => l.registered), [true, false]);
  }],
  ["メインデッキごとの対応：対応のないカードも出る", () => {
    const d = hdata();
    eq(linksByParent(d, "A").map((x) => [x.card.no, x.links.map((l) => l.hyperItem.no)]), [[1, [1]], [2, [1]]]);
    eq(linksByParent(d, "C").map((x) => x.card.no), []);
    d.cubes.A.cards.push({ no: 3, count: 1 });
    d.cards.push({ no: 3, name: "P3" });
    eq(linksByParent(d, "A")[2].links, []);
  }],
  ["対応の組：同じ組はまとめ、付属先・超次元の番号順に並ぶ", () => {
    const d = hdata();
    d.cubes.B.hyperLinks.push({ id: "h", parent: 1, hyper: 1 });
    const pairs = linkPairs(d, "B");
    eq(pairs.map((p) => [p.parentCard.no, p.hyperItem.no, p.links.length, p.registered]), [[1, 1, 2, true], [2, 1, 1, false]]);
    eq(linkPairs(d, "C"), []);
  }],
  ["対応のまとめ：足りない枚数と未登録の数", () => {
    const d = hdata();
    eq(linkSummary(d, "A"), { hyperKinds: 1, hyperCopies: 2, links: 2, uncovered: 0, orphans: 0 });
    eq(linkSummary(d, "B"), { hyperKinds: 2, hyperCopies: 2, links: 2, uncovered: 1, orphans: 1 });
  }],
  ["使われている場所：超次元・GR は、入っているキューブも返す", () => {
    const d = hdata();
    eq(usagePlaces("gr", 1, d.cubes), [{ cube: "A", type: "card" }, { cube: "B", type: "card" }, { cube: "C", type: "card" }]);
    eq(usagePlaces("hypers", 1, d.cubes), [
      { cube: "A", type: "card" }, { cube: "A", type: "hyper", count: 2 },
      { cube: "B", type: "card" }, { cube: "B", type: "hyper", count: 2 }, { cube: "C", type: "card" },
    ]);
  }],
  ["問題のあるカード：超次元・GR も見る", () => {
    const d = hdata();
    d.cubes.A.hypers[0].count = 2;
    eq(cubeProblems(d, "A"), [{ ledger: "hypers", no: 1, type: "count" }]);
  }],
  ["選択肢：超次元の 3 面の区分を、使っている面だけ書き換える", () => {
    eq(choiceChanges(choiceData, "hyperKinds", "ドラグハート・ウエポン", "新"), [
      { ledger: "hypers", no: 2, field: "kind", value: "新" },
      { ledger: "hypers", no: 2, field: "kind3", value: "新" },
    ]);
    eq(choiceUsage(choiceData, "hyperKinds", "ドラグハート・ウエポン"), { total: 1, byLedger: { hypers: 1 } });
  }],
  ["検索の条件：何も入っていなければ false。1 つでも入っていれば true", () => {
    const blank = () => ({ q: "", civs: new Set(), kind: "", attr: "", role: "", costMin: "", costMax: "", proxy: "", minus: false });
    eq(hasSearchCondition(blank()), false);
    eq(hasSearchCondition({ ...blank(), q: "   " }), false);
    for (const patch of [{ q: "ア" }, { civs: new Set(["火"]) }, { kind: "呪文" }, { attr: "SA" }, { role: "除去" },
      { costMin: "0" }, { costMax: "3" }, { proxy: "real" }, { minus: true }]) {
      eq(hasSearchCondition({ ...blank(), ...patch }), true);
    }
  }],
  ["選択肢：GR の区分と、超次元の属性・役割", () => {
    eq(choiceChanges(choiceData, "grKinds", "クリーチャー", null), [{ ledger: "gr", no: 1, field: "kind", value: "" }]);
    eq(choiceChanges(choiceData, "roles", "受け札", null), [{ ledger: "hypers", no: 2, field: "roles", value: [] }]);
    eq(choiceChanges(choiceData, "attributes", "MF", "新"), [{ ledger: "hypers", no: 2, field: "attrs", value: ["新"] }]);
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
