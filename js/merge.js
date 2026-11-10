// 複数のカードをまとめて足すときの「何をするか」の計算（まとめて登録・JSON の追加）。
// 画面にも Firebase にも依存しない純粋関数。確認画面の件数と、実際の書き込みの両方でこれを使う。
import { LEDGERS, LEDGER_LABELS, ITEM_FIELDS, DEFAULT_SETTINGS, emptyItem, nameKey } from "./model.js";

const keyOf = (name, proxy) => `${proxy ? "P" : "R"}|${nameKey(name)}`;
const copyValue = (v) => (Array.isArray(v) ? [...v] : v);

// 台帳 1 つ分の作業用の状態。番号の空きと、名前（本物／プロキシ別）からカードを引く表。
function makeIndex(ledger, items) {
  const used = new Set();
  const byKey = new Map();
  let max = 0;
  for (const it of [...items].sort((a, b) => a.no - b.no)) {
    used.add(it.no);
    max = Math.max(max, it.no);
    const key = keyOf(it.name, it.proxy);
    if (!byKey.has(key)) byKey.set(key, { no: it.no, name: it.name, created: null });
  }
  return { ledger, used, byKey, max, low: 1, created: [], added: new Map() };
}

// 同じ名前があれば枚数だけ足し、無ければ空いている一番小さい番号で新規にする。置いた先の番号を返す。
function place(idx, fields) {
  const owned = fields.owned ?? 0;
  const key = keyOf(fields.name, fields.proxy);
  const hit = idx.byKey.get(key);
  if (hit) {
    if (hit.created) {
      hit.created.owned += owned;
    } else {
      const prev = idx.added.get(hit.no);
      idx.added.set(hit.no, { no: hit.no, name: hit.name, delta: (prev?.delta ?? 0) + owned });
    }
    return hit.no;
  }

  while (idx.used.has(idx.low)) idx.low++;
  const no = idx.low;
  idx.used.add(no);
  idx.max = Math.max(idx.max, no);

  const item = emptyItem(idx.ledger);
  for (const f of ITEM_FIELDS[idx.ledger]) if (fields[f] !== undefined) item[f] = copyValue(fields[f]);
  item.name = fields.name;
  item.proxy = !!fields.proxy;
  item.owned = owned;
  idx.created.push({ no, item });
  idx.byKey.set(key, { no, name: item.name, created: item });
  return no;
}

function finish(idx, counter) {
  return { created: idx.created, added: [...idx.added.values()], counter: Math.max(counter ?? 0, idx.max) };
}

// 名前を 1 行 1 枚で貼り付けた登録。同じ名前の行が何行かあれば、その行数分の枚数にする。
// 戻り値：{ created: [{ no, item }], added: [{ no, name, delta }], counter }
export function planBulk(current, ledger, lines, proxy) {
  const groups = new Map();
  for (const line of lines) {
    const key = nameKey(line);
    if (!key) continue;
    const group = groups.get(key) ?? { name: String(line).trim(), count: 0 };
    group.count++;
    groups.set(key, group);
  }
  const idx = makeIndex(ledger, current[ledger]);
  for (const { name, count } of groups.values()) place(idx, { name, proxy, owned: count });
  return finish(idx, current.counters?.[ledger]);
}

// JSON（論理形式）の内容を、今のデータに足す。
// 同じ名前のカードは枚数だけ足し、新しいカードには空き番号を振って、キューブ・対応の番号も付け替える。
export function planAppend(current, incoming) {
  const warnings = [];
  const ledgers = {};
  const counters = {};
  const noMap = {};
  // 台帳ごとの 番号 → { name, proxy }（今ある分と、これから作る分）
  const infoOf = Object.fromEntries(LEDGERS.map((l) => [l, new Map(current[l].map((c) => [c.no, { name: c.name, proxy: !!c.proxy }]))]));

  for (const ledger of LEDGERS) {
    const idx = makeIndex(ledger, current[ledger]);
    noMap[ledger] = new Map();
    for (const item of [...incoming[ledger]].sort((a, b) => a.no - b.no)) {
      noMap[ledger].set(item.no, place(idx, item));
    }
    const result = finish(idx, current.counters?.[ledger]);
    ledgers[ledger] = { created: result.created, added: result.added };
    counters[ledger] = result.counter;
    for (const { no, item } of result.created) infoOf[ledger].set(no, { name: item.name, proxy: item.proxy });
  }

  const settingsAdd = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const have = new Set(current.settings[key]);
    const add = (incoming.settings[key] ?? []).filter((v) => !have.has(v));
    if (add.length) settingsAdd[key] = add;
  }

  const cubes = {};
  let newCubes = 0;
  for (const [id, src] of Object.entries(incoming.cubes)) {
    const existing = current.cubes[id] ?? null;
    const cubeName = existing?.name ?? src.name;
    const multi = existing ? !!existing.multi : !!src.multi;
    const usesHyper = existing ? existing.usesHyper !== false : src.usesHyper !== false;
    const usesGR = existing ? !!existing.usesGR : !!src.usesGR;
    const create = existing ? null : {
      name: src.name, usesGR, usesHyper, multi, order: Object.keys(current.cubes).length + newCubes++,
    };
    const uses = { cards: true, hypers: usesHyper, gr: usesGR };

    // メインデッキ・超次元・GR のリストを、同じ規則で足す
    const plan = { create, addCards: [], addHypers: [], addGr: [], addLinks: [] };
    const inCube = {};
    for (const [ledger, key] of [["cards", "addCards"], ["hypers", "addHypers"], ["gr", "addGr"]]) {
      const have = new Map((existing?.[ledger] ?? []).map((c) => [c.no, c.count ?? 1]));
      const names = new Set();
      for (const no of have.keys()) {
        const info = infoOf[ledger].get(no);
        if (info) names.add(nameKey(info.name));
      }
      const list = src[ledger] ?? [];
      if (!uses[ledger] && list.length) {
        warnings.push(`${cubeName}：${LEDGER_LABELS[ledger]}を使わない設定のため、${LEDGER_LABELS[ledger]} ${list.length} 件は足しませんでした`);
      }
      for (const c of uses[ledger] ? list : []) {
        const no = noMap[ledger].get(c.no);
        if (no === undefined || have.has(no)) continue;
        const info = infoOf[ledger].get(no);
        const nameKeyOf = nameKey(info.name);
        // 同名を複数枚入れられないモードでは、本物／プロキシを問わず同名は 1 枚だけ
        if (!multi && names.has(nameKeyOf)) {
          warnings.push(`${cubeName}：${LEDGER_LABELS[ledger]}の「${info.name}」は、同名のカードがすでに入っているため、入れませんでした`);
          continue;
        }
        const count = multi ? (c.count ?? 1) : 1;
        if (!multi && (c.count ?? 1) > 1) {
          warnings.push(`${cubeName}：${LEDGER_LABELS[ledger]}の「${info.name}」は、同名を複数枚入れられないモードのため、1 枚にしました`);
        }
        have.set(no, count);
        names.add(nameKeyOf);
        plan[key].push({ no, memo: c.memo, count });
      }
      inCube[ledger] = have;
    }

    // 対応：付属先（メインデッキ）も超次元もこのキューブに入っていて、その超次元の枚数を超えない範囲だけ足す
    const linkIds = new Set((existing?.hyperLinks ?? []).map((l) => l.id));
    const perHyper = new Map();
    for (const l of existing?.hyperLinks ?? []) perHyper.set(l.hyper, (perHyper.get(l.hyper) ?? 0) + 1);
    let skipped = 0;
    if (!usesHyper && src.hyperLinks.length) {
      warnings.push(`${cubeName}：超次元を使わない設定のため、超次元の対応 ${src.hyperLinks.length} 件は足しませんでした`);
    }
    for (const l of usesHyper ? src.hyperLinks : []) {
      const parent = noMap.cards.get(l.parent);
      const hyper = noMap.hypers.get(l.hyper);
      if (parent === undefined || hyper === undefined) continue;
      if (!inCube.cards.has(parent) || !inCube.hypers.has(hyper) || (perHyper.get(hyper) ?? 0) >= inCube.hypers.get(hyper)) {
        skipped++;
        continue;
      }
      perHyper.set(hyper, (perHyper.get(hyper) ?? 0) + 1);
      let linkId = l.id;
      while (linkIds.has(linkId)) linkId = globalThis.crypto.randomUUID();
      linkIds.add(linkId);
      plan.addLinks.push({ id: linkId, parent, hyper, memo: l.memo });
    }
    if (skipped) {
      warnings.push(`${cubeName}：付属先か超次元がキューブに入っていない、または超次元の枚数を超えるため、対応 ${skipped} 件は足しませんでした`);
    }

    cubes[id] = plan;
  }

  return { ledgers, counters, settingsAdd, cubes, warnings };
}

// 確認画面に出す件数
export function planTotals(plan) {
  const out = { created: 0, added: 0, cubeCards: 0, cubeHypers: 0, cubeGr: 0, cubeLinks: 0, settings: 0 };
  for (const { created, added } of Object.values(plan.ledgers)) {
    out.created += created.length;
    out.added += added.length;
  }
  for (const c of Object.values(plan.cubes)) {
    out.cubeCards += c.addCards.length;
    out.cubeHypers += c.addHypers.length;
    out.cubeGr += c.addGr.length;
    out.cubeLinks += c.addLinks.length;
  }
  out.settings = Object.values(plan.settingsAdd).reduce((n, list) => n + list.length, 0);
  return out;
}
