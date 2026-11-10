// データの形に関する定数と純粋関数。Firebase に依存しない（テストからも読み込める）。

// 2：各カードに proxy（プロキシか）を追加。1 のデータは proxy: false として読む。
// 3：キューブに usesHyper（超次元を使うか。無ければ true）、multi（同名を複数枚入れられるか）、キューブ内のカードに count（枚数）を追加。無ければ false／1 として読む。
export const SCHEMA_VERSION = 3;
export const CHUNK_SIZE = 500;

const copy = (v) => (Array.isArray(v) ? [...v] : v);

export const LEDGERS = ["cards", "hypers", "gr"];
export const LEDGER_LABELS = { cards: "メインデッキ", hypers: "超次元", gr: "GR" };
// 3つの台帳は、属性・役割・文明などを共通で持つ。超次元は最大 3 面（コスト 1〜3 と面ごとの区分）。
export const ITEM_FIELDS = {
  cards: ["name", "proxy", "cost", "cost2", "kind", "civs", "attrs", "roles", "memo", "owned"],
  hypers: ["name", "proxy", "cost", "kind", "cost2", "kind2", "cost3", "kind3", "civs", "attrs", "roles", "back", "memo", "owned"],
  gr: ["name", "proxy", "cost", "kind", "civs", "attrs", "roles", "memo", "owned"],
};
const ITEM_DEFAULTS = {
  name: "", proxy: false, cost: null, cost2: null, cost3: null, kind: "", kind2: "", kind3: "",
  civs: [], attrs: [], roles: [], back: "", memo: "", owned: 0,
};

// 区分の選択肢が入っている設定の項目（台帳ごと）
export const KIND_SETTING = { cards: "kinds", hypers: "hyperKinds", gr: "grKinds" };

// 面ごとの（コスト, 区分）の項目名。メインデッキのコスト 2 はツインパクトの 2 つ目で区分は 1 つ
export const COST_KIND_FACES = [["cost", "kind"], ["cost2", "kind2"], ["cost3", "kind3"]];

export function emptyItem(ledger) {
  const item = {};
  for (const f of ITEM_FIELDS[ledger]) item[f] = copy(ITEM_DEFAULTS[f]);
  return item;
}

export function itemDefault(field) {
  return copy(ITEM_DEFAULTS[field]);
}

// 同じ名前かの判定用。全角／半角の違い、前後の空白、続いた空白を無視する。
export function nameKey(name) {
  return String(name ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

// 本物とプロキシは別のカードとして扱う
export function findByName(items, name, proxy, exceptNo = null) {
  const key = nameKey(name);
  if (!key) return null;
  return items.find((it) => it.no !== exceptNo && !!it.proxy === !!proxy && nameKey(it.name) === key) ?? null;
}

export const DEFAULT_SETTINGS = {
  civs: ["火", "自然", "水", "光", "闇"],
  attributes: ["SA", "ST", "ブロッカー", "ハンデス", "シノビ", "進化", "MF"],
  roles: ["除去", "ドロー", "ブースト", "フィニッシャー", "踏み倒し", "受け札"],
  kinds: ["クリーチャー", "呪文", "ツインパクト", "クロスギア", "城", "D2フィールド", "オーラ", "タマシード"],
  hyperKinds: [
    "サイキック・クリーチャー", "サイキック・スーパー・クリーチャー", "サイキック・クロスギア",
    "ドラグハート・ウエポン", "ドラグハート・フォートレス", "ドラグハート・クリーチャー",
  ],
  grKinds: ["クリーチャー"],
};
export const SETTING_LABELS = {
  civs: "文明", attributes: "属性", roles: "役割", kinds: "区分", hyperKinds: "超次元の区分", grKinds: "GR の区分",
};
export const DEFAULT_CUBES = {
  A: { name: "キューブA", usesGR: true, usesHyper: true, multi: false },
  B: { name: "キューブB", usesGR: false, usesHyper: true, multi: false },
};

export function chunkId(ledger, no) {
  return `${ledger}_${Math.floor((no - 1) / CHUNK_SIZE)}`;
}

// キューブが、その台帳のリストを使うか。メインデッキは常に使い、超次元は usesHyper（無ければ true）、GR は usesGR。
export function cubeUses(cube, ledger) {
  if (ledger === "hypers") return cube.usesHyper !== false;
  if (ledger === "gr") return !!cube.usesGR;
  return true;
}
