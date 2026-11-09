// Firestore への書き込み。データの置き方は SPEC.md 3-2。
import { db } from "./firebase.js";
import {
  SCHEMA_VERSION, LEDGERS, DEFAULT_SETTINGS, DEFAULT_CUBES,
  gameRef, docsFromLogical, getRawDocs, setWriteError, clearWriteError,
} from "./store.js";
import {
  doc, writeBatch, runTransaction, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const DEFAULT_GAME_NAME = "デュエル・マスターズ";

// オフラインでは完了がつながるまで返らないので、画面側は待たずに進めてよい
function track(promise) {
  return promise.then(
    (v) => { clearWriteError(); return v; },
    (e) => { setWriteError(e); throw e; },
  );
}

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
