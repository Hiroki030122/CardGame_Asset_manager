// Firestore の購読、アプリ内のデータ（論理形式。SPEC.md 3-1）への変換、保存状態。
import { db } from "./firebase.js";
import { DEFAULT_GAME_ID } from "../app-config.js";
import { doc, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { SCHEMA_VERSION, LEDGERS, ITEM_FIELDS, DEFAULT_SETTINGS, chunkId, itemDefault } from "./model.js";

// データの形の定義は model.js。これまでどおり store.js からも読めるようにしておく。
export {
  SCHEMA_VERSION, CHUNK_SIZE, LEDGERS, LEDGER_LABELS, ITEM_FIELDS, DEFAULT_SETTINGS, SETTING_LABELS, DEFAULT_CUBES,
  chunkId, emptyItem, nameKey, findByName,
} from "./model.js";

export const CHUNK_WARN_BYTES = 700 * 1024;

const copy = (v) => (Array.isArray(v) ? [...v] : v);

export const gameId = resolveGameId(globalThis.location?.search ?? "");
export const isTestGame = gameId !== DEFAULT_GAME_ID;
export const gameRef = doc(db, "games", gameId);

function resolveGameId(search) {
  const id = new URLSearchParams(search).get("game");
  return id && /^[A-Za-z0-9_-]{1,40}$/.test(id) ? id : DEFAULT_GAME_ID;
}

// ---- 変換（純粋関数） ----

// キューブの中のリスト（メインデッキ・超次元・GR）。番号 → { memo, count } の入れ物を、配列にする
const cubeList = (obj) => Object.entries(obj ?? {})
  .map(([k, v]) => ({ no: Number(k), memo: v?.memo ?? "", count: Number.isInteger(v?.count) && v.count >= 1 ? v.count : 1 }))
  .sort((a, b) => a.no - b.no);

// Firestore のドキュメント → 論理形式
export function logicalFromDocs(game, ledgerDocs, cubeDocs) {
  const out = { schemaVersion: SCHEMA_VERSION, settings: {}, counters: {}, cards: [], hypers: [], gr: [], cubes: {} };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const v = game?.settings?.[key];
    out.settings[key] = Array.isArray(v) ? [...v] : [...DEFAULT_SETTINGS[key]];
  }
  for (const ledger of LEDGERS) {
    const v = game?.counters?.[ledger];
    out.counters[ledger] = Number.isInteger(v) ? v : 0;
  }

  for (const { id, data } of ledgerDocs) {
    const m = /^(cards|hypers|gr)_\d+$/.exec(id);
    if (!m) continue;
    const ledger = m[1];
    for (const [key, item] of Object.entries(data.items ?? {})) {
      const no = Number(key);
      if (!Number.isInteger(no) || no < 1) continue;
      const rec = { no };
      for (const f of ITEM_FIELDS[ledger]) rec[f] = copy(item?.[f] ?? itemDefault(f));
      out[ledger].push(rec);
    }
  }
  for (const ledger of LEDGERS) out[ledger].sort((a, b) => a.no - b.no);

  const cubes = [...cubeDocs].sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0) || a.id.localeCompare(b.id));
  for (const { id, data } of cubes) {
    out.cubes[id] = {
      name: data.name ?? id,
      usesGR: !!data.usesGR,
      usesHyper: data.usesHyper ?? true,
      multi: !!data.multi,
      cards: cubeList(data.cards),
      hypers: cubeList(data.hypers),
      gr: cubeList(data.gr),
      hyperLinks: Object.entries(data.links ?? {})
        .map(([k, v]) => ({ id: k, parent: v?.parent, hyper: v?.hyper, memo: v?.memo ?? "" }))
        .sort((a, b) => a.parent - b.parent || a.hyper - b.hyper),
    };
  }
  return out;
}

// 論理形式 → Firestore に置く形（日時の項目は書き込むときに足す）
export function docsFromLogical(data) {
  const chunks = new Map();
  for (const ledger of LEDGERS) {
    for (const item of data[ledger]) {
      const id = chunkId(ledger, item.no);
      if (!chunks.has(id)) chunks.set(id, {});
      const fields = {};
      for (const f of ITEM_FIELDS[ledger]) fields[f] = copy(item[f]);
      chunks.get(id)[String(item.no)] = fields;
    }
  }
  const cubes = new Map();
  Object.entries(data.cubes).forEach(([id, cube], order) => {
    const lists = {};
    for (const ledger of ["cards", "hypers", "gr"]) {
      lists[ledger] = {};
      for (const c of cube[ledger] ?? []) lists[ledger][String(c.no)] = { memo: c.memo, count: c.count ?? 1 };
    }
    const links = {};
    for (const l of cube.hyperLinks) links[l.id] = { parent: l.parent, hyper: l.hyper, memo: l.memo };
    cubes.set(id, {
      name: cube.name, usesGR: cube.usesGR, usesHyper: cube.usesHyper ?? true, multi: !!cube.multi, order,
      cards: lists.cards, hypers: lists.hypers, gr: lists.gr, links,
    });
  });
  return { chunks, cubes };
}

// ---- 購読と状態 ----

const state = {
  game: { loaded: false, exists: false, data: null, key: "", pending: false },
  ledgers: { loaded: false, docs: [], pending: false },
  cubes: { loaded: false, docs: [], pending: false },
  readError: null,
  writeError: null,
  online: globalThis.navigator?.onLine ?? true,
};
let derived = null;
const listeners = new Set();

// kind: "data"（中身が変わった）/ "status"（保存状態だけ変わった）/ "writeError"
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(kind) {
  if (kind === "data") derived = null;
  for (const fn of listeners) fn(kind);
}

export function start() {
  const opts = { includeMetadataChanges: true };

  onSnapshot(gameRef, opts, (snap) => {
    state.game.pending = snap.metadata.hasPendingWrites;
    // 端末の保存分に無いだけかもしれないので、つながっているならサーバーの返事を待つ
    if (!snap.exists() && snap.metadata.fromCache && navigator.onLine) {
      emit("status");
      return;
    }
    const data = snap.exists() ? snap.data() : null;
    const key = JSON.stringify(data);
    const changed = !state.game.loaded || key !== state.game.key;
    Object.assign(state.game, { loaded: true, exists: snap.exists(), data, key });
    emit(changed ? "data" : "status");
  }, onReadError);

  watchCollection("ledgers", state.ledgers);
  watchCollection("cubes", state.cubes);

  const onNetwork = () => { state.online = navigator.onLine; emit("status"); };
  window.addEventListener("online", onNetwork);
  window.addEventListener("offline", onNetwork);
}

function watchCollection(name, slot) {
  onSnapshot(collection(gameRef, name), { includeMetadataChanges: true }, (snap) => {
    slot.pending = snap.metadata.hasPendingWrites;
    if (!slot.loaded && snap.empty && snap.metadata.fromCache && navigator.onLine) {
      emit("status");
      return;
    }
    const changed = !slot.loaded || snap.docChanges().length > 0;
    slot.loaded = true;
    if (changed) slot.docs = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
    emit(changed ? "data" : "status");
  }, onReadError);
}

function onReadError(err) {
  console.error(err);
  state.readError = err;
  emit("data");
}

export function getState() {
  const loading = !state.game.loaded || (state.game.exists && !(state.ledgers.loaded && state.cubes.loaded));
  if (!derived) {
    derived = {
      data: !loading && state.game.exists ? logicalFromDocs(state.game.data, state.ledgers.docs, state.cubes.docs) : null,
      chunks: state.ledgers.docs.map(chunkInfo).sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true })),
    };
  }
  return { loading, readError: state.readError, exists: state.game.exists, ...derived };
}

function chunkInfo({ id, data }) {
  const m = /^(cards|hypers|gr)_(\d+)$/.exec(id);
  return {
    id,
    ledger: m?.[1] ?? null,
    index: m ? Number(m[2]) : null,
    count: Object.keys(data.items ?? {}).length,
    bytes: new TextEncoder().encode(JSON.stringify(data)).length,
  };
}

// 書き込み（actions.js）が今のドキュメントを知るため
export function getRawDocs() {
  return {
    game: state.game.data,
    ledgerIds: state.ledgers.docs.map((d) => d.id),
    cubeIds: state.cubes.docs.map((d) => d.id),
  };
}

// ---- 保存状態 ----

export function getStatus() {
  if (state.writeError) return { kind: "error", text: `保存できませんでした（${errorMessage(state.writeError)}）` };
  if (!state.online) return { kind: "offline", text: "オフライン（つながったら保存します）" };
  if (state.game.pending || state.ledgers.pending || state.cubes.pending) return { kind: "saving", text: "保存中…" };
  return { kind: "saved", text: "保存済み" };
}

export function getWriteError() {
  return state.writeError;
}

export function setWriteError(err) {
  console.error(err);
  state.writeError = err;
  emit("writeError");
}

export function clearWriteError() {
  if (!state.writeError) return;
  state.writeError = null;
  emit("status");
}

export function isOnline() {
  return navigator.onLine;
}

export function errorMessage(err) {
  switch (err?.code) {
    case "permission-denied": return "このアカウントには編集権限がありません";
    case "unavailable": return "サーバーにつながりません";
    case "offline": return "オフラインのため登録できません。つながってから登録してください";
    case "not-found": return "データが見つかりません";
    case "already-exists": return err.message;
    default: return err?.code || err?.message || String(err);
  }
}
