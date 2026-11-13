// 起動、ルーティング（#/…）、ヘッダーと画面の再描画。
import { watchAuth, isAdmin, login, logout } from "./firebase.js";
import * as store from "./store.js";
import { createInitialGame } from "./actions.js";
import { importJson } from "./excel.js";
import { h, section, toast, copyText } from "./ui.js";
import * as searchView from "./views/search.js";
import * as cardListView from "./views/cardList.js";
import * as detailView from "./views/detail.js";
import * as cubeView from "./views/cube.js";
import * as hyperView from "./views/hyper.js";
import * as statsView from "./views/stats.js";
import * as settingsView from "./views/settings.js";

// タブ：検索 → カード一覧 → キューブ（データにある数だけ。order 順）→ 超次元 → 集計 → 設定
function tabsFor(data) {
  const cubes = data ? Object.entries(data.cubes).map(([id, c]) => ({ key: `cube/${id}`, label: c.name })) : [];
  return [
    { key: "search", label: "検索" },
    { key: "list", label: "カード一覧" },
    ...cubes,
    { key: "hyper", label: "超次元" },
    { key: "stats", label: "集計" },
    { key: "settings", label: "設定" },
  ];
}
const ROUTES = ["search", "list", "cube", "card", "hyper", "gr", "stats", "settings"];
// カード一覧の対象（#/list/hypers など）
const LIST_LEDGER = { hypers: "hypers", gr: "gr" };

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
  const [name, param = null, sub = null] = parts;
  // 前の URL（#/search/hypers・#/search/gr）は、カード一覧として開く
  if (name === "search" && param in LIST_LEDGER) return { name: "list", param, sub: null };
  // sub：キューブの画面の表示（#/cube/A/links など）
  return ROUTES.includes(name) ? { name, param, sub } : { name: "search", param: null, sub: null };
}

function activeTabKey(r) {
  if (r.name === "cube") return `cube/${r.param}`;
  if (r.name === "card" || r.name === "gr" || (r.name === "hyper" && r.param)) return "list";
  return r.name;
}

function cubeName(id, data) {
  return data?.cubes[id]?.name ?? "キューブ";
}

function pageTitle(r, data) {
  switch (r.name) {
    case "cube": return cubeName(r.param, data);
    case "card": return "カードの詳細";
    case "gr": return "GR の詳細";
    case "hyper": return r.param ? "超次元の詳細" : "超次元";
    case "stats": return "集計";
    case "settings": return "設定";
    case "list": return "カード一覧";
    default: return "検索";
  }
}

// ---- ヘッダー ----

function renderTabs() {
  const data = store.getState().data;
  const active = activeTabKey(route);
  $("tabs").replaceChildren(...tabsFor(data).map((t) => h("a", {
    href: `#/${t.key}`,
    class: t.key === active ? "tab active" : "tab",
    "aria-current": t.key === active ? "page" : null,
  }, t.label)));
  $("tabs").querySelector(".tab.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
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

// 入力欄のある画面（mount を持つもの）は、同じ画面のあいだは作り直さずに update で中身だけ更新する
let mounted = null;

function renderView() {
  const st = store.getState();
  const admin = isAdmin(user);
  const ctx = { state: st, user, admin, route };
  const title = pageTitle(route, st.data);
  document.title = `${title}｜カード管理`;

  const phase = route.name === "settings" ? "settings"
    : st.readError ? "error"
    : st.loading ? "loading"
    : !st.exists ? "empty"
    : "content";
  const key = `${route.name}/${route.param}|${phase}|${admin}`;
  if (mounted?.key === key && mounted.update) {
    mounted.titleEl.textContent = title;
    mounted.update(ctx);
    return;
  }

  const titleEl = h("h1", null, title);
  const body = h("div", { class: "view-body" });
  $("view").replaceChildren(
    h("div", { class: "page-head" },
      titleEl,
      h("button", { class: "sub small", onclick: () => copyText(location.href) }, "このページの URL をコピー")),
    body);

  let update = null;
  if (phase === "content" && route.name === "search") update = searchView.mount(body, ctx).update;
  else if (phase === "content" && route.name === "list") update = cardListView.mount(body, ctx, { ledger: LIST_LEDGER[route.param] ?? "cards" }).update;
  else if (phase === "content" && route.name === "hyper" && !route.param) update = hyperView.mount(body, ctx).update;
  else if (phase === "content" && route.name === "stats") update = statsView.mount(body, ctx).update;
  else if (phase === "content" && route.name === "cube" && st.data.cubes[route.param]) update = cubeView.mount(body, ctx).update;
  else body.append(...[staticBody(phase, ctx)].flat().filter(Boolean));
  mounted = { key, titleEl, update };
}

function staticBody(phase, ctx) {
  switch (phase) {
    case "settings": return settingsView.render(ctx);
    case "error": return section("データを読み込めませんでした", h("p", null, store.errorMessage(ctx.state.readError)));
    case "loading": return h("p", { class: "muted" }, "読み込み中…");
    case "empty": return emptyState(ctx);
    default: return content(ctx);
  }
}

function content(ctx) {
  const { name, param } = ctx.route;
  if (name === "card") return detailView.render(ctx, "cards");
  if (name === "gr") return detailView.render(ctx, "gr");
  if (name === "hyper") return detailView.render(ctx, "hypers");
  if (name === "cube" && !ctx.state.data.cubes[param]) return h("p", { class: "muted" }, "このキューブはありません。");
  return h("p", { class: "muted" }, "この画面は表示できません。");
}

function emptyState({ admin }) {
  if (!admin) return section("まだデータがありません", h("p", null, "管理者がデータを登録すると、ここに表示されます。"));
  return section("まだデータがありません",
    h("p", null, "文明・属性・役割・区分・キューブの設定を行うか、JSON を取り込んでください。"),
    h("div", { class: "buttons" },
      h("button", { onclick: onCreateInitial }, "初期設定を作成"),
      h("button", { class: "sub", onclick: importJson }, "JSON を取り込む")));
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
