// Firestore への書き込み。データの置き方は SPEC.md 3-2。
import { db } from "./firebase.js";
import {
  SCHEMA_VERSION, CHUNK_SIZE, LEDGERS, ITEM_FIELDS, DEFAULT_SETTINGS, DEFAULT_CUBES,
  gameRef, chunkId, emptyItem, isOnline, docsFromLogical, getRawDocs, setWriteError, clearWriteError,
} from "./store.js";
import { firstFreeNo } from "./calc.js";
import {
  doc, writeBatch, runTransaction, updateDoc, serverTimestamp, increment, deleteField,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const DEFAULT_GAME_NAME = "デュエル・マスターズ";

// オフラインでは完了がつながるまで返らないので、画面側は待たずに進めてよい
function track(promise) {
  return promise.then(
    (v) => { clearWriteError(); return v; },
    (e) => { setWriteError(e); throw e; },
  );
}

const chunkRef = (ledger, no) => doc(gameRef, "ledgers", chunkId(ledger, no));

const appError = (code, message) => Object.assign(new Error(message), { code });

// ---- カード（所持カード・超次元・GR 共通） ----

// 新規登録。空いている一番小さい番号を、トランザクションの中でチャンクを読んで探す。
// オンラインのときだけ使える。振った番号を返す。
export function registerItem(ledger, values) {
  if (!isOnline()) return Promise.reject(appError("offline", "オフラインです"));
  const item = emptyItem(ledger);
  for (const f of ITEM_FIELDS[ledger]) if (values[f] !== undefined) item[f] = values[f];

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw appError("not-found", "データがありません");
    const counter = snap.data().counters?.[ledger] ?? 0;

    let no = counter + 1;
    for (let k = 0; k <= Math.floor(counter / CHUNK_SIZE); k++) {
      const from = k * CHUNK_SIZE + 1;
      const chunk = await tx.get(doc(gameRef, "ledgers", `${ledger}_${k}`));
      const free = firstFreeNo(chunk.exists() ? chunk.data().items ?? {} : {}, from, from + CHUNK_SIZE - 1);
      if (free !== null) { no = free; break; }
    }

    const now = serverTimestamp();
    tx.update(gameRef, { [`counters.${ledger}`]: Math.max(counter, no), schemaVersion: SCHEMA_VERSION, updatedAt: now });
    tx.set(chunkRef(ledger, no), { items: { [no]: { ...item, createdAt: now, updatedAt: now } } }, { merge: true });
    return no;
  });
}

// 枚数の増減。0 未満になる操作は何もしない。
export function changeOwned(ledger, item, delta) {
  if (item.owned + delta < 0) return Promise.resolve(false);
  return track(updateDoc(chunkRef(ledger, item.no), {
    [`items.${item.no}.owned`]: increment(delta),
    [`items.${item.no}.updatedAt`]: serverTimestamp(),
  })).then(() => true);
}

// 変わった項目だけを書き換える
export function updateItem(ledger, no, changes) {
  const patch = { [`items.${no}.updatedAt`]: serverTimestamp() };
  for (const [f, v] of Object.entries(changes)) {
    if (ITEM_FIELDS[ledger].includes(f)) patch[`items.${no}.${f}`] = v;
  }
  return track(updateDoc(chunkRef(ledger, no), patch));
}

// 消せるかどうかは画面側で確かめてから呼ぶ（calc.js の canDelete）。消した番号は、次の新規登録で使われる。
export function deleteItem(ledger, no) {
  return track(updateDoc(chunkRef(ledger, no), { [`items.${no}`]: deleteField() }));
}

// ---- 初期化・置き換え ----

// 3-4 初期化。サーバーで「まだ無い」ことを確かめてから作るので、オンラインのときだけ使える。
// 作ったら true、すでにあったら false。
export function createInitialGame() {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (snap.exists()) return false;
    tx.set(gameRef, {
      schemaVersion: SCHEMA_VERSION,
      name: DEFAULT_GAME_NAME,
      settings: structuredClone(DEFAULT_SETTINGS),
      counters: { cards: 0, hypers: 0, gr: 0 },
      updatedAt: serverTimestamp(),
    });
    Object.entries(DEFAULT_CUBES).forEach(([id, cube], order) => {
      tx.set(doc(gameRef, "cubes", id), { name: cube.name, usesGR: cube.usesGR, order, cards: {}, links: {} });
    });
    return true;
  });
}

// 番号を再利用しないよう、JSON の counters・JSON 内の最大番号・今の counters の一番大きい値を使う
export function mergeCounters(data, currentCounters) {
  const out = {};
  for (const ledger of LEDGERS) {
    const maxNo = data[ledger].reduce((m, item) => Math.max(m, item.no), 0);
    const current = Number.isInteger(currentCounters?.[ledger]) ? currentCounters[ledger] : 0;
    out[ledger] = Math.max(data.counters[ledger] ?? 0, maxNo, current);
  }
  return out;
}

// JSON の「置き換え」。フィールド単位で更新する決まりの例外で、全ドキュメントを丸ごと書き直す（SPEC.md 3-2）。
export function replaceAll(data) {
  const { game: current, ledgerIds, cubeIds } = getRawDocs();
  const { chunks, cubes } = docsFromLogical(data);
  const now = serverTimestamp();
  const batch = writeBatch(db);

  batch.set(gameRef, {
    schemaVersion: SCHEMA_VERSION,
    name: current?.name || DEFAULT_GAME_NAME,
    settings: data.settings,
    counters: mergeCounters(data, current?.counters),
    updatedAt: now,
  });

  for (const [id, items] of chunks) {
    for (const item of Object.values(items)) {
      item.createdAt = now;
      item.updatedAt = now;
    }
    batch.set(doc(gameRef, "ledgers", id), { items });
  }
  for (const id of ledgerIds) {
    if (!chunks.has(id)) batch.delete(doc(gameRef, "ledgers", id));
  }

  for (const [id, cube] of cubes) {
    for (const c of Object.values(cube.cards)) c.addedAt = now;
    batch.set(doc(gameRef, "cubes", id), cube);
  }
  for (const id of cubeIds) {
    if (!cubes.has(id)) batch.delete(doc(gameRef, "cubes", id));
  }

  return track(batch.commit());
}
