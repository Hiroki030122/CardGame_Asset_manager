// merge.js のテスト。`node tests/merge.test.mjs`、または tests/calc.test.html をブラウザで開いて実行する。
import { planBulk, planAppend, planTotals } from "../js/merge.js";

const card = (no, name, proxy = false, owned = 1) => ({
  no, name, proxy, cost: null, cost2: null, kind: "", civs: [], attrs: [], roles: [], memo: "", owned,
});
const hyper = (no, name, proxy = false, owned = 1) => ({
  no, name, proxy, cost: null, kind: "", civs: [], back: "", memo: "", owned,
});
const emptyCube = (name, usesGR = false) => ({ name, usesGR, cards: [], hypers: [], gr: [], hyperLinks: [] });
const settings = () => ({
  civs: ["火", "自然", "水", "光", "闇"], attributes: ["SA"], roles: [], kinds: [], hyperKinds: [],
});

// 番号 1 と 3 があり、2 が空いている状態。キューブ A には No.1 が入っている
const base = () => ({
  settings: settings(),
  counters: { cards: 3, hypers: 0, gr: 0 },
  cards: [card(1, "A", false, 2), card(3, "C", false, 0)],
  hypers: [],
  gr: [],
  cubes: { A: { ...emptyCube("キューブA", true), cards: [{ no: 1, memo: "" }] }, B: emptyCube("キューブB") },
});

const incomingBase = () => ({
  settings: { ...settings(), attributes: ["SA", "新属性"] },
  counters: { cards: 0, hypers: 0, gr: 0 },
  cards: [card(1, "A", false, 5), card(2, "N", false, 1)],
  hypers: [hyper(1, "H", false, 1)],
  gr: [{ no: 1, name: "G", proxy: false, cost: 2, kind: "", civs: [], attrs: [], roles: [], memo: "", owned: 1 }],
  cubes: {
    A: {
      ...emptyCube("キューブA", true),
      cards: [{ no: 1, memo: "x" }, { no: 2, memo: "y" }],
      hypers: [{ no: 1, memo: "h", count: 1 }],
      hyperLinks: [{ id: "l1", parent: 2, hyper: 1, memo: "m" }],
    },
    C: { ...emptyCube("キューブC", true), cards: [{ no: 2, memo: "" }], gr: [{ no: 1, memo: "g", count: 1 }] },
  },
});

function eq(actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`期待 ${e}、実際 ${a}`);
}

const nos = (list) => list.map((c) => c.no);

const tests = [
  ["まとめて登録：新規は空いている番号から振る", () => {
    const p = planBulk(base(), "cards", ["X", "Y"], false);
    eq(nos(p.created), [2, 4]);
    eq(p.created.map((c) => c.item.name), ["X", "Y"]);
    eq(p.added, []);
    eq(p.counter, 4);
  }],
  ["まとめて登録：空き番号を使うときは counters を変えない", () => {
    const p = planBulk(base(), "cards", ["X"], false);
    eq(nos(p.created), [2]);
    eq(p.counter, 3);
  }],
  ["まとめて登録：同じ名前の行は行数分の枚数にする", () => {
    const p = planBulk(base(), "cards", ["X", "X", "X"], false);
    eq(p.created.length, 1);
    eq(p.created[0].item.owned, 3);
  }],
  ["まとめて登録：登録済みの名前は枚数だけ足す（全角・空白の違いは無視）", () => {
    const p = planBulk(base(), "cards", ["Ａ", " A "], false);
    eq(p.created, []);
    eq(p.added, [{ no: 1, name: "A", delta: 2 }]);
  }],
  ["まとめて登録：本物がある名前でも、プロキシは別に新規", () => {
    const p = planBulk(base(), "cards", ["A"], true);
    eq(p.added, []);
    eq(p.created.length, 1);
    eq(p.created[0].item.proxy, true);
    eq(p.created[0].no, 2);
  }],
  ["まとめて登録：空行は無視する", () => {
    const p = planBulk(base(), "cards", ["", "   ", "X"], false);
    eq(p.created.length, 1);
  }],
  ["まとめて登録：超次元の新規には 3 面の項目が入る", () => {
    const item = planBulk(base(), "hypers", ["H"], false).created[0].item;
    eq([item.cost3, item.kind2, item.kind3, item.attrs], [null, "", "", []]);
  }],
  ["まとめて登録：何も無い台帳は 1 から", () => {
    const p = planBulk(base(), "gr", ["G1", "G2"], false);
    eq(nos(p.created), [1, 2]);
    eq(p.counter, 2);
  }],
  ["追加：同じ名前は枚数だけ足し、新しいカードは空き番号", () => {
    const p = planAppend(base(), incomingBase());
    eq(p.ledgers.cards.added, [{ no: 1, name: "A", delta: 5 }]);
    eq(nos(p.ledgers.cards.created), [2]);
    eq(p.ledgers.cards.created[0].item.name, "N");
    eq(nos(p.ledgers.hypers.created), [1]);
    eq(p.counters, { cards: 3, hypers: 1, gr: 1 });
  }],
  ["追加：キューブは番号を付け替えて足し、すでに入っているものは重ねない", () => {
    const p = planAppend(base(), incomingBase());
    eq(p.cubes.A.create, null);
    eq(p.cubes.A.addCards, [{ no: 2, memo: "y", count: 1 }]);
  }],
  ["追加：超次元の関連の番号を付け替える", () => {
    const p = planAppend(base(), incomingBase());
    eq(p.cubes.A.addLinks, [{ id: "l1", parent: 2, hyper: 1, memo: "m" }]);
  }],
  ["追加：無いキューブは作る", () => {
    const p = planAppend(base(), incomingBase());
    eq(p.cubes.C.create, { name: "キューブC", usesGR: true, usesHyper: true, multi: false, order: 2 });
    eq(p.cubes.C.addCards, [{ no: 2, memo: "", count: 1 }]);
    eq(p.cubes.C.addGr, [{ no: 1, memo: "g", count: 1 }]);
  }],
  ["追加：選択肢は今に無い値だけ足す", () => {
    const p = planAppend(base(), incomingBase());
    eq(p.settingsAdd, { attributes: ["新属性"] });
  }],
  ["追加：同じ名前の本物とプロキシを同じキューブに入れない（警告を出す）", () => {
    const incoming = incomingBase();
    incoming.cards = [card(1, "A", true, 1)];
    incoming.hypers = [];
    incoming.cubes = { A: { ...emptyCube("キューブA", true), cards: [{ no: 1, memo: "" }] } };
    const p = planAppend(base(), incoming);
    eq(nos(p.ledgers.cards.created), [2]);
    eq(p.cubes.A.addCards, []);
    eq(p.warnings.length, 1);
  }],
  ["追加：取り込み側に同じ名前が 2 件あれば 1 件に合流する", () => {
    const incoming = incomingBase();
    incoming.cards = [card(1, "Z", false, 1), card(2, "Z", false, 2)];
    incoming.hypers = [];
    incoming.cubes = { A: { ...emptyCube("キューブA", true), cards: [{ no: 1, memo: "" }, { no: 2, memo: "" }] } };
    const p = planAppend(base(), incoming);
    eq(p.ledgers.cards.created.length, 1);
    eq(p.ledgers.cards.created[0].item.owned, 3);
    eq(p.cubes.A.addCards.length, 1);
  }],
  ["追加：キューブの超次元は、番号を付け替えて足す。GR を使わないキューブには足さず警告する", () => {
    const p = planAppend(base(), incomingBase());
    eq(p.cubes.A.addHypers, [{ no: 1, memo: "h", count: 1 }]);
    const incoming = incomingBase();
    incoming.cubes.A.gr = [{ no: 1, memo: "", count: 1 }];
    const current = base();
    current.cubes.A.usesGR = false;
    const q = planAppend(current, incoming);
    eq(q.cubes.A.addGr, []);
    eq(q.warnings.length, 1);
  }],
  ["追加：入れた超次元の枚数を超える関連は足さない", () => {
    const current = base();
    current.cards.push(card(4, "N", false, 1));
    current.hypers.push(hyper(1, "H", false, 1));
    current.cubes.A.hyperLinks = [{ id: "old", parent: 4, hyper: 1, memo: "" }];
    const p = planAppend(current, incomingBase());
    eq(p.cubes.A.addLinks, []);
  }],
  ["追加：関連の id が重なったら別の id にする", () => {
    const current = base();
    current.cubes.A.hyperLinks = [{ id: "l1", parent: 3, hyper: 9, memo: "" }];
    const p = planAppend(current, incomingBase());
    eq(p.cubes.A.addLinks.length, 1);
    eq(p.cubes.A.addLinks[0].id === "l1", false);
  }],
  ["追加：複数枚OKのキューブには枚数ごと足す", () => {
    const current = base();
    current.cubes.A.multi = true;
    const incoming = incomingBase();
    incoming.cubes.A.cards = [{ no: 2, memo: "y", count: 3 }];
    const p = planAppend(current, incoming);
    eq(p.cubes.A.addCards, [{ no: 2, memo: "y", count: 3 }]);
    eq(p.warnings, []);
  }],
  ["追加：1 枚だけのキューブには 1 枚にして足し、警告を出す", () => {
    const incoming = incomingBase();
    incoming.cubes.A.cards = [{ no: 2, memo: "y", count: 3 }];
    const p = planAppend(base(), incoming);
    eq(p.cubes.A.addCards, [{ no: 2, memo: "y", count: 1 }]);
    eq(p.warnings.length, 1);
  }],
  ["追加：複数枚OKのキューブなら、同名の本物とプロキシも入れられる", () => {
    const current = base();
    current.cubes.A.multi = true;
    const incoming = incomingBase();
    incoming.cards = [card(1, "A", true, 1)];
    incoming.hypers = [];
    incoming.cubes = { A: { ...emptyCube("キューブA", true), multi: true, cards: [{ no: 1, memo: "", count: 1 }] } };
    const p = planAppend(current, incoming);
    eq(p.cubes.A.addCards.length, 1);
    eq(p.warnings, []);
  }],
  ["追加：無いキューブは取り込み側のモードで作る", () => {
    const incoming = incomingBase();
    incoming.cubes.C.multi = true;
    incoming.cubes.C.cards = [{ no: 2, memo: "", count: 2 }];
    const p = planAppend(base(), incoming);
    eq(p.cubes.C.create.multi, true);
    eq(p.cubes.C.addCards, [{ no: 2, memo: "", count: 2 }]);
  }],
  ["追加：超次元を使わないキューブには、超次元も関連も足さず、警告を出す", () => {
    const current = base();
    current.cubes.A.usesHyper = false;
    const p = planAppend(current, incomingBase());
    eq(p.cubes.A.addHypers, []);
    eq(p.cubes.A.addLinks, []);
    eq(p.warnings.length, 2);
  }],
  ["追加：無いキューブは取り込み側の超次元の設定で作る", () => {
    const incoming = incomingBase();
    incoming.cubes.C.usesHyper = false;
    eq(planAppend(base(), incoming).cubes.C.create.usesHyper, false);
  }],
  ["件数：新規・加算・キューブ・選択肢を数える", () => {
    eq(planTotals(planAppend(base(), incomingBase())), { created: 3, added: 1, cubeCards: 2, cubeHypers: 1, cubeGr: 1, cubeLinks: 1, settings: 1 });
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

if (globalThis.process?.argv?.[1]?.endsWith("merge.test.mjs")) {
  const results = run();
  for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.ok ? "" : `：${r.message}`}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `${failed} 件失敗` : `すべて成功（${results.length} 件）`);
  process.exitCode = failed ? 1 : 0;
}
