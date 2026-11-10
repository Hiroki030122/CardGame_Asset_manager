// 使用枚数・残り・集計の計算（SPEC.md 4 章）。画面や Firebase に依存しない純粋関数。
import { nameKey, cubeUses } from "./model.js";

// キューブごとの「番号 → そのキューブに入っている枚数」 { A: Map, B: Map, … }。ledger は cards／hypers／gr（キューブの中のリスト名と同じ）。
// 超次元・GR を使わない設定のキューブは、数えない（空にする）。
export function cubeIndex(cubes, ledger = "cards") {
  const index = {};
  for (const [id, cube] of Object.entries(cubes)) {
    index[id] = cubeUses(cube, ledger) ? new Map((cube[ledger] ?? []).map((c) => [c.no, c.count ?? 1])) : new Map();
  }
  return index;
}

// メインデッキ：使用数＝全キューブに入っている枚数の合計（byCube はキューブごとの枚数）。残り＝所持 − 使用数。
export function cardUse(card, index) {
  const byCube = {};
  let used = 0;
  for (const [id, counts] of Object.entries(index)) {
    byCube[id] = counts.get(card.no) ?? 0;
    used += byCube[id];
  }
  return { byCube, used, remaining: card.owned - used };
}

// 台帳ごとの使用（メインデッキ・超次元・GR とも同じ数え方）。使用数＝全キューブに入れた枚数の合計。残り＝所持 − 使用数。
export function ledgerUse(item, cubes, ledger) {
  return cardUse(item, cubeIndex(cubes, ledger));
}
export const hyperUse = (hyper, cubes) => ledgerUse(hyper, cubes, "hypers");
export const grUse = (gr, cubes) => ledgerUse(gr, cubes, "gr");

// キューブに入っているカードと枚数 [{ card, count, memo }]（台帳に無い番号は飛ばす）。card は台帳の 1 件（超次元・GR でもこの名前）
export function cubeEntries(data, cubeId, ledger = "cards") {
  const cube = data.cubes[cubeId];
  if (!cube) return [];
  const byNo = new Map(data[ledger].map((c) => [c.no, c]));
  return (cube[ledger] ?? []).filter((c) => byNo.has(c.no)).map((c) => ({ card: byNo.get(c.no), count: c.count ?? 1, memo: c.memo }));
}

// キューブに 1 枚入れてよいか。{ ok, reason, card }。
// reason："stock"（残りが無い。所持数を超える）／"name"（同名を複数枚入れられないモードで、同名がすでにある。card がそのカード）／"unused"（そのリストを使わないキューブ）
export function cubeAddCheck(data, cubeId, ledger, item) {
  const cube = data.cubes[cubeId];
  if (!cube) return { ok: false, reason: "nocube" };
  if (!cubeUses(cube, ledger)) return { ok: false, reason: "unused" };
  if (ledgerUse(item, data.cubes, ledger).remaining <= 0) return { ok: false, reason: "stock" };
  if (!cube.multi) {
    const key = nameKey(item.name);
    const same = cubeEntries(data, cubeId, ledger).find((e) => nameKey(e.card.name) === key);
    if (same) return { ok: false, reason: "name", card: same.card };
  }
  return { ok: true };
}

// 文明の延べ（多色は各文明に枚数ぶん）とゼロ文明。entries は [{ card, count }]。total は文明の延べ合計（ゼロ文明は含まない）。
export function civTotals(entries, civs) {
  const byCiv = Object.fromEntries(civs.map((c) => [c, 0]));
  let zero = 0;
  let multi = 0;
  let total = 0;
  for (const { card, count } of entries) {
    if (!card.civs.length) { zero += count; continue; }
    if (card.civs.length > 1) multi += count;
    for (const c of card.civs) { byCiv[c] = (byCiv[c] ?? 0) + count; total += count; }
  }
  return { byCiv, zero, multi, total };
}

// コストの山：0〜9 と「10 以上」の 11 区分。cost2 も 1 つとして数え、コスト無しは数えない。
export function costHistogram(entries) {
  const bins = new Array(11).fill(0);
  for (const { card, count } of entries) {
    for (const c of [card.cost, card.cost2]) if (c != null) bins[Math.min(c, 10)] += count;
  }
  return bins;
}

// キューブのミニ集計。kinds＝種類数、copies＝枚数、shortage＝残りがマイナスのカードの種類数。
export function cubeSummary(data, cubeId) {
  const index = cubeIndex(data.cubes);
  const entries = cubeEntries(data, cubeId);
  return {
    kinds: entries.length,
    copies: entries.reduce((n, e) => n + e.count, 0),
    civ: civTotals(entries, data.settings.civs),
    cost: costHistogram(entries),
    shortage: entries.filter((e) => cardUse(e.card, index).remaining < 0).length,
  };
}

// 同名を複数枚入れられないモードなのに、複数枚・同名が複数入っているカード [{ ledger, no, type: "count" | "name" }]（3 つのリストを見る）
export function cubeProblems(data, cubeId) {
  const cube = data.cubes[cubeId];
  if (!cube || cube.multi) return [];
  const problems = [];
  for (const ledger of ["cards", "hypers", "gr"]) {
    const byName = new Map();
    for (const { card, count } of cubeEntries(data, cubeId, ledger)) {
      if (count > 1) problems.push({ ledger, no: card.no, type: "count" });
      const key = nameKey(card.name);
      byName.set(key, [...(byName.get(key) ?? []), card.no]);
    }
    for (const nos of byName.values()) if (nos.length > 1) for (const no of nos) problems.push({ ledger, no, type: "name" });
  }
  return problems;
}

// 新しいキューブの ID。使われていない英大文字を順に、全部埋まっていれば cube-2, cube-3, …
export function nextCubeId(cubes) {
  for (let i = 0; i < 26; i++) {
    const id = String.fromCharCode(65 + i);
    if (!(id in cubes)) return id;
  }
  for (let n = 2; ; n++) if (!(`cube-${n}` in cubes)) return `cube-${n}`;
}

// チャンクの items（キーは番号の文字列）で、from〜to のうち使われていない一番小さい番号。無ければ null。
export function firstFreeNo(items, from, to) {
  for (let no = from; no <= to; no++) if (!(String(no) in items)) return no;
  return null;
}

// 削除してよいか。所持が残っている、またはキューブ・超次元の対応で使われていれば不可。
export function canDelete(ledger, item, cubes) {
  const places = usagePlaces(ledger, item.no, cubes);
  const reasons = [];
  if (item.owned > 0) reasons.push({ type: "owned", count: item.owned });
  reasons.push(...places);
  return { ok: reasons.length === 0, reasons };
}

// 削除してよいかの判定用。使われている場所の一覧（空なら削除してよい）。
// type: "card"（キューブに入っている。どの台帳でも）/ "parent"（超次元の付属先）/ "hyper"（対応の超次元）
export function usagePlaces(ledger, no, cubes) {
  const places = [];
  for (const [id, cube] of Object.entries(cubes)) {
    if ((cube[ledger] ?? []).some((c) => c.no === no)) places.push({ cube: id, type: "card" });
    if (ledger === "cards") {
      const count = cube.hyperLinks.filter((l) => l.parent === no).length;
      if (count) places.push({ cube: id, type: "parent", count });
    } else if (ledger === "hypers") {
      const count = cube.hyperLinks.filter((l) => l.hyper === no).length;
      if (count) places.push({ cube: id, type: "hyper", count });
    }
  }
  return places;
}

// ---- 設定の選択肢（属性・役割・区分・超次元の区分）を使っているカード ----

export const CHOICE_TARGETS = {
  attributes: ["cards", "hypers", "gr"].map((ledger) => ({ ledger, field: "attrs", multi: true })),
  roles: ["cards", "hypers", "gr"].map((ledger) => ({ ledger, field: "roles", multi: true })),
  kinds: [{ ledger: "cards", field: "kind", multi: false }],
  hyperKinds: ["kind", "kind2", "kind3"].map((field) => ({ ledger: "hypers", field, multi: false })),
  grKinds: [{ ledger: "gr", field: "kind", multi: false }],
};

// 値の置き換え。to が null なら外す（区分は空にする）。変わらないときは undefined。
function replaceChoice(current, multi, from, to) {
  if (multi) {
    if (!current.includes(from)) return undefined;
    const next = [];
    for (const v of current) {
      const w = v === from ? to : v;
      if (w != null && !next.includes(w)) next.push(w);
    }
    return next;
  }
  return current === from ? (to ?? "") : undefined;
}

// 名前変更・削除で書き換えるカードの一覧 [{ ledger, no, field, value }]
export function choiceChanges(data, key, from, to) {
  const out = [];
  for (const t of CHOICE_TARGETS[key] ?? []) {
    for (const item of data[t.ledger]) {
      const value = replaceChoice(item[t.field], t.multi, from, to);
      if (value !== undefined) out.push({ ledger: t.ledger, no: item.no, field: t.field, value });
    }
  }
  return out;
}

// その選択肢を使っているカードの数 { total, byLedger }（超次元の複数の面で使っていても 1 枚と数える）
export function choiceUsage(data, key, value) {
  const seen = new Set();
  const byLedger = {};
  for (const c of choiceChanges(data, key, value, null)) {
    const id = `${c.ledger}:${c.no}`;
    if (seen.has(id)) continue;
    seen.add(id);
    byLedger[c.ledger] = (byLedger[c.ledger] ?? 0) + 1;
  }
  return { total: seen.size, byLedger };
}

// ---- 超次元の対応（キューブの中で、メインデッキのカードと、キューブに入れた超次元を結びつける） ----

// 対応を 1 つ付けてよいか。付属先がキューブのメインデッキにいる（parent）、超次元がキューブに入っている（hyper）、
// その超次元への対応の数が、入れた枚数に達していない（full）。同じ「付属先 × 超次元」は何回でも付けられる。
export function linkAddCheck(data, cubeId, parentNo, hyperNo) {
  const cube = data.cubes[cubeId];
  if (!cube) return { ok: false, reason: "nocube" };
  if (!cube.cards.some((c) => c.no === parentNo)) return { ok: false, reason: "parent" };
  const entry = (cube.hypers ?? []).find((x) => x.no === hyperNo);
  if (!entry) return { ok: false, reason: "hyper" };
  const links = cube.hyperLinks.filter((l) => l.hyper === hyperNo).length;
  const count = entry.count ?? 1;
  return links >= count ? { ok: false, reason: "full", count, links } : { ok: true, count, links };
}

// 超次元を外して、入れた枚数が newCount になるとき、対応の数が枚数を超えてしまわないか（links）
export function hyperRemoveCheck(data, cubeId, hyperNo, newCount) {
  const cube = data.cubes[cubeId];
  if (!cube) return { ok: true };
  const links = cube.hyperLinks.filter((l) => l.hyper === hyperNo).length;
  return links > newCount ? { ok: false, reason: "links", links } : { ok: true };
}

// キューブの対応の一覧。付属先・超次元の中身と、付属先がキューブのメインデッキにいるか（registered）、
// 超次元がキューブに入っているか（hyperRegistered）を付ける。付属先か超次元が台帳に無い対応は含めない。
export function cubeLinks(data, cubeId) {
  const cube = data.cubes[cubeId];
  if (!cube) return [];
  const cards = new Map(data.cards.map((c) => [c.no, c]));
  const hypers = new Map(data.hypers.map((x) => [x.no, x]));
  const inCards = new Set(cube.cards.map((c) => c.no));
  const inHypers = new Set((cube.hypers ?? []).map((c) => c.no));
  return cube.hyperLinks
    .filter((l) => cards.has(l.parent) && hypers.has(l.hyper))
    .map((l) => ({
      ...l, parentCard: cards.get(l.parent), hyperItem: hypers.get(l.hyper),
      registered: inCards.has(l.parent), hyperRegistered: inHypers.has(l.hyper),
    }));
}

// 超次元ごとの対応。キューブに入れた超次元ごとに { hyper, count, links: [{ link, parentCard, registered }], free }。
// free＝入れた枚数 − 対応の数（0 以上。まだ対応していない枚数）。
export function linksByHyper(data, cubeId) {
  const cube = data.cubes[cubeId];
  if (!cube) return [];
  const all = cubeLinks(data, cubeId);
  const hypers = new Map(data.hypers.map((x) => [x.no, x]));
  return (cube.hypers ?? [])
    .filter((e) => hypers.has(e.no))
    .map((e) => {
      const links = all.filter((l) => l.hyper === e.no).map((l) => ({ link: l, parentCard: l.parentCard, registered: l.registered }));
      const count = e.count ?? 1;
      return { hyper: hypers.get(e.no), count, links, free: Math.max(0, count - links.length) };
    });
}

// メインデッキのカードごとの対応。キューブのメインデッキのカードごとに { card, count, links: [{ link, hyperItem, hyperRegistered }] }（対応のないカードも含む）
export function linksByParent(data, cubeId) {
  const cube = data.cubes[cubeId];
  if (!cube) return [];
  const all = cubeLinks(data, cubeId);
  const cards = new Map(data.cards.map((c) => [c.no, c]));
  return cube.cards
    .filter((e) => cards.has(e.no))
    .map((e) => ({
      card: cards.get(e.no),
      count: e.count ?? 1,
      links: all.filter((l) => l.parent === e.no).map((l) => ({ link: l, hyperItem: l.hyperItem, hyperRegistered: l.hyperRegistered })),
    }));
}

// 対応を「付属先 × 超次元」の組にまとめる（同じ組が複数あるときは links に全部入る）。付属先の番号、超次元の番号の順。
// [{ parentCard, hyperItem, links: [link, …], registered, hyperRegistered }]
export function linkPairs(data, cubeId) {
  const pairs = new Map();
  for (const l of cubeLinks(data, cubeId)) {
    const key = `${l.parent}:${l.hyper}`;
    if (!pairs.has(key)) {
      pairs.set(key, { parentCard: l.parentCard, hyperItem: l.hyperItem, links: [], registered: l.registered, hyperRegistered: l.hyperRegistered });
    }
    pairs.get(key).links.push(l);
  }
  return [...pairs.values()].sort((a, b) => a.parentCard.no - b.parentCard.no || a.hyperItem.no - b.hyperItem.no);
}

// 対応のまとめ。uncovered＝対応が足りない超次元の枚数の合計、orphans＝付属先か超次元がキューブに無い対応の数
export function linkSummary(data, cubeId) {
  const byHyper = linksByHyper(data, cubeId);
  const all = cubeLinks(data, cubeId);
  return {
    hyperKinds: byHyper.length,
    hyperCopies: byHyper.reduce((n, x) => n + x.count, 0),
    links: all.length,
    uncovered: byHyper.reduce((n, x) => n + x.free, 0),
    orphans: all.filter((l) => !l.registered || !l.hyperRegistered).length,
  };
}

// ---- 検索 ----

// 横断検索で、条件が 1 つでも入っているか（空のあいだは一覧を出さない）。キューブの絞り込みは検索では使わない。
export function hasSearchCondition(f) {
  return !!(
    f.q.trim() || f.civs.size || f.kind || f.attr || f.role
    || f.costMin !== "" || f.costMax !== "" || f.proxy || f.minus
  );
}
