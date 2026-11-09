// 起動、ルーティング（#/…）、ヘッダーと画面の再描画。
import { watchAuth, isAdmin, login, logout } from "./firebase.js";
import * as store from "./store.js";
import { createInitialGame } from "./actions.js";
import { importJsonReplace } from "./excel.js";
import { h, section, toast, copyText } from "./ui.js";
import * as searchView from "./views/search.js";
import * as settingsView from "./views/settings.js";

const TABS = [
  { key: "search", label: "検索" },
  { key: "cube/A", cube: "A" },
  { key: "cube/B", cube: "B" },
  { key: "hyper", label: "超次元" },
  { key: "stats", label: "集計" },
  { key: "settings", label: "設定" },
];
const ROUTES = ["search", "cube", "card", "hyper", "stats", "settings"];

const $ = (id) => document.getElementById(id);

let user = null;
let authReady = false;
let route = parseRoute();

function parseRoute() {
  let parts;
  try {
    parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    parts = [];
  }
  const [name, param = null] = parts;
  return ROUTES.includes(name) ? { name, param } : { name: "search", param: null };
}

function activeTabKey(r) {
  if (r.name === "cube") return `cube/${r.param}`;
  if (r.name === "card") return "search";
  return r.name;
}

function cubeName(id, data) {
  return data?.cubes[id]?.name ?? store.DEFAULT_CUBES[id]?.name ?? `キューブ${id}`;
}

function pageTitle(r, data) {
  switch (r.name) {
    case "cube": return cubeName(r.param, data);
    case "card": return `カード No.${r.param ?? ""}`;
    case "hyper": return "超次元";
    case "stats": return "集計";
    case "settings": return "設定";
    default: return "検索";
  }
}

// ---- ヘッダー ----

function renderTabs() {
  const data = store.getState().data;
  const active = activeTabKey(route);
  $("tabs").replaceChildren(...TABS.map((t) => h("a", {
    href: `#/${t.key}`,
    class: t.key === active ? "tab active" : "tab",
    "aria-current": t.key === active ? "page" : null,
  }, t.cube ? cubeName(t.cube, data) : t.label)));
}

function renderAuth() {
  const box = $("auth");
  if (!authReady) return box.replaceChildren();
  const onLogin = () => login().catch((e) => toast(e.message, "error"));
  if (!user) {
    return box.replaceChildren(
      h("span", { class: "badge" }, "閲覧のみ"),
      h("button", { class: "small", onclick: onLogin }, "Google でログイン"));
  }
  box.replaceChildren(
    isAdmin(user)
      ? h("span", { class: "account", title: user.email ?? "" }, user.displayName || user.email || "ログイン中")
      : h("span", { class: "badge warn" }, "このアカウントは閲覧のみです"),
    h("button", { class: "sub small", onclick: () => logout() }, "ログアウト"));
}

function renderStatus() {
  const el = $("save-status");
  const s = store.getStatus();
  el.hidden = !(isAdmin(user) || s.kind === "offline" || s.kind === "error");
  el.className = `status status-${s.kind}`;
  el.textContent = s.text;
}

// ---- 画面 ----

function renderView() {
  const st = store.getState();
  const ctx = { state: st, user, admin: isAdmin(user), route };
  const title = pageTitle(route, st.data);
  document.title = `${title}｜カード管理`;

  let body;
  if (route.name === "settings") body = settingsView.render(ctx);
  else if (st.readError) body = section("データを読み込めませんでした", h("p", null, store.errorMessage(st.readError)));
  else if (st.loading) body = h("p", { class: "muted" }, "読み込み中…");
  else if (!st.exists) body = emptyState(ctx);
  else body = content(ctx);

  $("view").replaceChildren(
    h("div", { class: "page-head" },
      h("h1", null, title),
      h("button", { class: "sub small", onclick: () => copyText(location.href) }, "このページの URL をコピー")),
    ...[body].flat());
}

function content(ctx) {
  const { name, param } = ctx.route;
  if (name === "search") return searchView.render(ctx);
  if (name === "cube" && !ctx.state.data.cubes[param]) return h("p", { class: "muted" }, "このキューブはありません。");
  const stage = { card: 2, cube: 3, hyper: 4, stats: 5 }[name];
  return h("p", { class: "muted" }, `この画面は段階 ${stage} で作ります。`);
}

function emptyState({ admin }) {
  if (!admin) return section("まだデータがありません", h("p", null, "管理者がデータを登録すると、ここに表示されます。"));
  return section("まだデータがありません",
    h("p", null, "初期設定（文明・属性・役割・区分の選択肢と、空のキューブA／B）を作るか、JSON を取り込んでください。"),
    h("div", { class: "buttons" },
      h("button", { onclick: onCreateInitial }, "初期設定を作成"),
      h("button", { class: "sub", onclick: importJsonReplace }, "JSON を取り込む")));
}

async function onCreateInitial(e) {
  const button = e.currentTarget;
  button.disabled = true;
  try {
    const created = await createInitialGame();
    toast(created ? "初期設定を作成しました" : "すでにデータがありました");
  } catch (err) {
    console.error(err);
    toast(`作成できませんでした（${store.errorMessage(err)}）`, "error");
    button.disabled = false;
  }
}

// ---- 起動 ----

if (store.isTestGame) {
  $("game-badge").textContent = `動作確認用（${store.gameId}）`;
  $("game-badge").hidden = false;
}

store.subscribe((kind) => {
  if (kind === "data") {
    renderTabs();
    renderView();
  }
  if (kind === "writeError") {
    const err = store.getWriteError();
    if (err) toast(`保存できませんでした：${store.errorMessage(err)}`, "error");
  }
  renderStatus();
});

watchAuth((u) => {
  user = u;
  authReady = true;
  renderAuth();
  renderStatus();
  renderView();
});

window.addEventListener("hashchange", () => {
  route = parseRoute();
  renderTabs();
  renderView();
  window.scrollTo(0, 0);
});

store.start();
renderTabs();
renderView();
renderStatus();
