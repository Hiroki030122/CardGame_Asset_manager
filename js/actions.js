// Firestore への書き込み。データの置き方は SPEC.md 3-2。
import { db } from "./firebase.js";
import {
  SCHEMA_VERSION, CHUNK_SIZE, LEDGERS, ITEM_FIELDS, DEFAULT_SETTINGS, DEFAULT_CUBES,
  gameRef, chunkId, emptyItem, isOnline, docsFromLogical, logicalFromDocs, getRawDocs, setWriteError, clearWriteError,
} from "./store.js";
import { firstFreeNo, choiceChanges } from "./calc.js";
import { planBulk, planAppend } from "./merge.js";
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

// ---- カード（メインデッキ・超次元・GR 共通） ----

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

// ---- まとめて登録・JSON の追加（トランザクションで読み直して、merge.js の計画を書く） ----

// トランザクションの中で、今のデータ（game とチャンクとキューブ）を読んで論理形式にする
async function readCurrent(tx, ledgers, cubeIds) {
  const gameSnap = await tx.get(gameRef);
  if (!gameSnap.exists()) throw appError("not-found", "データがありません");
  const game = gameSnap.data();

  const ledgerDocs = [];
  for (const ledger of ledgers) {
    const last = Math.floor((game.counters?.[ledger] ?? 0) / CHUNK_SIZE);
    for (let k = 0; k <= last; k++) {
      const snap = await tx.get(doc(gameRef, "ledgers", `${ledger}_${k}`));
      if (snap.exists()) ledgerDocs.push({ id: snap.id, data: snap.data() });
    }
  }
  const cubeDocs = [];
  for (const id of cubeIds) {
    const snap = await tx.get(doc(gameRef, "cubes", id));
    if (snap.exists()) cubeDocs.push({ id: snap.id, data: snap.data() });
  }
  return logicalFromDocs(game, ledgerDocs, cubeDocs);
}

// 台帳 1 つ分の計画を、チャンクごとに 1 回の set（merge）で書く。既存は枚数だけ足す。
function writeLedgerPlan(tx, ledger, { created, added }, now) {
  const patches = new Map();
  const put = (no, value) => {
    const id = chunkId(ledger, no);
    if (!patches.has(id)) patches.set(id, {});
    patches.get(id)[String(no)] = value;
  };
  for (const { no, item } of created) put(no, { ...item, createdAt: now, updatedAt: now });
  for (const { no, delta } of added) if (delta) put(no, { owned: increment(delta), updatedAt: now });
  for (const [id, items] of patches) tx.set(doc(gameRef, "ledgers", id), { items }, { merge: true });
}

// 名前を 1 行 1 枚で貼り付けた登録。オンラインのときだけ使える。計画（作ったもの・足したもの）を返す。
export function registerMany(ledger, lines, proxy) {
  if (!isOnline()) return Promise.reject(appError("offline", "オフラインです"));
  return runTransaction(db, async (tx) => {
    const current = await readCurrent(tx, [ledger], []);
    const plan = planBulk(current, ledger, lines, proxy);
    const now = serverTimestamp();
    writeLedgerPlan(tx, ledger, plan, now);
    tx.update(gameRef, { [`counters.${ledger}`]: plan.counter, schemaVersion: SCHEMA_VERSION, updatedAt: now });
    return plan;
  });
}

// JSON（論理形式）の内容を今のデータに足す。オンラインのときだけ使える。計画を返す。
export function appendData(incoming) {
  if (!isOnline()) return Promise.reject(appError("offline", "オフラインです"));
  return runTransaction(db, async (tx) => {
    const cubeIds = [...new Set([...getRawDocs().cubeIds, ...Object.keys(incoming.cubes)])];
    const current = await readCurrent(tx, LEDGERS, cubeIds);
    const plan = planAppend(current, incoming);
    const now = serverTimestamp();

    const gameUpdate = { schemaVersion: SCHEMA_VERSION, updatedAt: now };
    for (const ledger of LEDGERS) {
      writeLedgerPlan(tx, ledger, plan.ledgers[ledger], now);
      gameUpdate[`counters.${ledger}`] = plan.counters[ledger];
    }
    for (const [key, add] of Object.entries(plan.settingsAdd)) gameUpdate[`settings.${key}`] = [...current.settings[key], ...add];
    tx.update(gameRef, gameUpdate);

    for (const [id, c] of Object.entries(plan.cubes)) {
      const lists = { cards: {}, hypers: {}, gr: {} };
      for (const [ledger, key] of [["cards", "addCards"], ["hypers", "addHypers"], ["gr", "addGr"]]) {
        for (const { no, memo, count } of c[key]) lists[ledger][String(no)] = { memo, count, addedAt: now };
      }
      const links = {};
      for (const { id: linkId, parent, hyper, memo } of c.addLinks) links[linkId] = { parent, hyper, memo };
      const ref = doc(gameRef, "cubes", id);
      const any = c.addCards.length || c.addHypers.length || c.addGr.length || c.addLinks.length;
      if (c.create) tx.set(ref, { ...c.create, ...lists, links });
      else if (any) tx.set(ref, { ...lists, links }, { merge: true });
    }
    return plan;
  });
}

// ---- キューブ ----

const cubeRef = (cubeId) => doc(gameRef, "cubes", cubeId);

// キューブに 1 枚入れる。まだ無ければ新しく、あれば枚数を +1。入れてよいかは画面側で確かめてから呼ぶ（calc.js の cubeAddCheck）。
// ledger は cards／hypers／gr。キューブの中のリスト名（cards.<no>／hypers.<no>／gr.<no>）と同じ。
export function addToCube(cubeId, ledger, no, alreadyIn) {
  const patch = alreadyIn
    ? { [`${ledger}.${no}.count`]: increment(1) }
    : { [`${ledger}.${no}`]: { memo: "", count: 1, addedAt: serverTimestamp() } };
  return track(updateDoc(cubeRef(cubeId), patch));
}

// 枚数が 2 以上なら 1 枚減らし、1 枚だけなら（または all なら）キューブから外す
export function removeFromCube(cubeId, ledger, no, count, { all = false } = {}) {
  const patch = !all && count > 1
    ? { [`${ledger}.${no}.count`]: increment(-1) }
    : { [`${ledger}.${no}`]: deleteField() };
  return track(updateDoc(cubeRef(cubeId), patch));
}

export function setCubeCardMemo(cubeId, ledger, no, memo) {
  return track(updateDoc(cubeRef(cubeId), { [`${ledger}.${no}.memo`]: memo }));
}

export function renameCube(cubeId, name) {
  return track(updateDoc(cubeRef(cubeId), { name }));
}

export function setCubeUsesGR(cubeId, usesGR) {
  return track(updateDoc(cubeRef(cubeId), { usesGR }));
}

// 超次元を使うかどうか。false にしても対応のデータは消さずに残す
export function setCubeUsesHyper(cubeId, usesHyper) {
  return track(updateDoc(cubeRef(cubeId), { usesHyper }));
}

// 同名を複数枚入れられるモードの切り替え。入れられないモードにするときは、3 つのリストの 2 枚以上を 1 枚にそろえる。
export function setCubeMulti(cubeId, multi, cube) {
  const patch = { multi };
  if (!multi) {
    for (const ledger of ["cards", "hypers", "gr"]) for (const c of cube[ledger] ?? []) if (c.count > 1) patch[`${ledger}.${c.no}.count`] = 1;
  }
  return track(updateDoc(cubeRef(cubeId), patch));
}

// 新しいキューブを作る。ID は画面に出さない。同じ ID の文書がすでにあれば作らない（2 台で同時に作った場合）。
// オンラインのときだけ使える。作った ID を返す。
export function createCube(name, id, order) {
  if (!isOnline()) return Promise.reject(appError("offline", "オフラインです"));
  return runTransaction(db, async (tx) => {
    const ref = cubeRef(id);
    if ((await tx.get(ref)).exists()) throw appError("already-exists", "同じキューブがすでにあります。もう一度やり直してください");
    tx.set(ref, { name, usesGR: false, usesHyper: false, multi: false, order, cards: {}, links: {} });
    return id;
  });
}

// 並べ替え：新しい並びのキューブ ID を渡すと、order を 0, 1, 2, … にそろえて書く
export function setCubeOrder(ids) {
  const batch = writeBatch(db);
  ids.forEach((id, order) => batch.update(cubeRef(id), { order }));
  return track(batch.commit());
}

// 削除。中のカードの出し入れと、超次元の対応も一緒に消える。残りのキューブの order もそろえ直す。
export function deleteCube(cubeId, remainingIds) {
  const batch = writeBatch(db);
  batch.delete(cubeRef(cubeId));
  remainingIds.forEach((id, order) => batch.update(cubeRef(id), { order }));
  return track(batch.commit());
}

// ---- 超次元の対応（キューブごと。1 つの対応＝超次元 1 枚。同じ組み合わせを何回付けてもよい） ----

// 付けてよいか（付属先・超次元がキューブに入っている、入れた枚数まで）は画面側で確かめてから呼ぶ（calc.js の linkAddCheck）。付けた対応の ID を返す
export function addLink(cubeId, parentNo, hyperNo, memo = "") {
  const id = globalThis.crypto.randomUUID();
  return track(updateDoc(cubeRef(cubeId), { [`links.${id}`]: { parent: parentNo, hyper: hyperNo, memo } })).then(() => id);
}

export function removeLink(cubeId, linkId) {
  return track(updateDoc(cubeRef(cubeId), { [`links.${linkId}`]: deleteField() }));
}

export function setLinkMemo(cubeId, linkId, memo) {
  return track(updateDoc(cubeRef(cubeId), { [`links.${linkId}.memo`]: memo }));
}

// ---- 設定の選択肢（属性・役割・区分・超次元の区分・GR の区分） ----

// 追加。保存されていない項目（既定値で読んでいるもの）に足しても既定の値が消えないよう、配列全体を書く
export function addChoice(key, value, current) {
  return track(updateDoc(gameRef, { [`settings.${key}`]: [...current, value], updatedAt: serverTimestamp() }));
}

// 並べ替え：新しい並びの配列をそのまま保存する
export function setChoiceOrder(key, list) {
  return track(updateDoc(gameRef, { [`settings.${key}`]: list, updatedAt: serverTimestamp() }));
}

// 名前変更（to が文字）と削除（to が null）。使っているカードの項目も、チャンクごとに 1 回の更新でまとめて書き換える。
export function changeChoice(key, from, to, data) {
  const list = [];
  for (const v of data.settings[key]) {
    const w = v === from ? to : v;
    if (w != null && !list.includes(w)) list.push(w);
  }

  const batch = writeBatch(db);
  batch.update(gameRef, { [`settings.${key}`]: list, updatedAt: serverTimestamp() });

  const patches = new Map();
  for (const { ledger, no, field, value } of choiceChanges(data, key, from, to)) {
    const id = chunkId(ledger, no);
    if (!patches.has(id)) patches.set(id, {});
    patches.get(id)[`items.${no}.${field}`] = value;
  }
  for (const [id, patch] of patches) batch.update(doc(gameRef, "ledgers", id), patch);

  return track(batch.commit());
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
      tx.set(doc(gameRef, "cubes", id), {
        name: cube.name, usesGR: cube.usesGR, usesHyper: cube.usesHyper, multi: cube.multi, order, cards: {}, links: {},
      });
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
    for (const list of [cube.cards, cube.hypers, cube.gr]) for (const c of Object.values(list)) c.addedAt = now;
    batch.set(doc(gameRef, "cubes", id), cube);
  }
  for (const id of cubeIds) {
    if (!cubes.has(id)) batch.delete(doc(gameRef, "cubes", id));
  }

  return track(batch.commit());
}
