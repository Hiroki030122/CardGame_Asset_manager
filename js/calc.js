// 使用枚数・残り・集計の計算（SPEC.md 4 章）。画面や Firebase に依存しない純粋関数。

// キューブごとの「入っているカードの番号」の集合 { A: Set, B: Set }
export function cubeIndex(cubes) {
  const index = {};
  for (const [id, cube] of Object.entries(cubes)) index[id] = new Set(cube.cards.map((c) => c.no));
  return index;
}

// 所持カード：キューブX で使用＝そのキューブに入っていれば 1。残り＝所持 − 使用の合計。
export function cardUse(card, index) {
  const byCube = {};
  let used = 0;
  for (const [id, nos] of Object.entries(index)) {
    byCube[id] = nos.has(card.no) ? 1 : 0;
    used += byCube[id];
  }
  return { byCube, used, remaining: card.owned - used };
}

// チャンクの items（キーは番号の文字列）で、from〜to のうち使われていない一番小さい番号。無ければ null。
export function firstFreeNo(items, from, to) {
  for (let no = from; no <= to; no++) if (!(String(no) in items)) return no;
  return null;
}

// 削除してよいか。所持が残っている、またはキューブ・超次元の関連で使われていれば不可。
export function canDelete(ledger, item, cubes) {
  const places = usagePlaces(ledger, item.no, cubes);
  const reasons = [];
  if (item.owned > 0) reasons.push({ type: "owned", count: item.owned });
  reasons.push(...places);
  return { ok: reasons.length === 0, reasons };
}

// 削除してよいかの判定用。使われている場所の一覧（空なら削除してよい）。
// type: "card"（キューブに入っている）/ "parent"（超次元の付属先）/ "hyper"（関連の超次元）
export function usagePlaces(ledger, no, cubes) {
  const places = [];
  for (const [id, cube] of Object.entries(cubes)) {
    if (ledger === "cards") {
      if (cube.cards.some((c) => c.no === no)) places.push({ cube: id, type: "card" });
      const count = cube.hyperLinks.filter((l) => l.parent === no).length;
      if (count) places.push({ cube: id, type: "parent", count });
    } else if (ledger === "hypers") {
      const count = cube.hyperLinks.filter((l) => l.hyper === no).length;
      if (count) places.push({ cube: id, type: "hyper", count });
    }
  }
  return places;
}
