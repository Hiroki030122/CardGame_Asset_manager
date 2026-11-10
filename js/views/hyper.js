// 「超次元」タブ（#/hyper）。SPEC.md 5-6。キューブを選んで、超次元の対応を見やすく見る（まとめ・進み具合・見方の切り替え・絞り込み）。
// 超次元の一覧はカード一覧（#/list/hypers）で見る。対応を付けるのはキューブの画面。
import { h, section, loadPref, savePref } from "../ui.js";
import { createLinkView } from "./linkView.js";

export function mount(el, ctx) {
  let cubeId = loadPref("linkCube", null);
  let current = ctx;
  const switcher = h("div", { class: "segmented cube-switch", role: "group", "aria-label": "キューブの切り替え" });
  const view = createLinkView({ cubeLink: true });
  const empty = h("div");
  const foot = h("p", { class: "muted" }, h("a", { href: "#/list/hypers" }, "超次元の一覧は、カード一覧で見られます"));
  el.append(switcher, view.el, empty, foot);

  function update(next) {
    current = next;
    const data = next.state.data;
    const cubes = Object.entries(data.cubes).filter(([, c]) => c.usesHyper !== false);
    switcher.hidden = !cubes.length;
    view.el.hidden = !cubes.length;
    if (!cubes.length) {
      empty.replaceChildren(section("超次元の対応",
        h("p", { class: "muted" }, "超次元を使うキューブがありません（設定のキューブで「超次元を使う」をオンにできます）。")));
      return;
    }
    empty.replaceChildren();
    if (!cubes.some(([id]) => id === cubeId)) cubeId = cubes[0][0];
    switcher.replaceChildren(...cubes.map(([id, cube]) => {
      const btn = h("button", { type: "button", "aria-pressed": String(id === cubeId) }, cube.name);
      btn.addEventListener("click", () => {
        cubeId = id;
        savePref("linkCube", id);
        update(current);
      });
      return btn;
    }));
    view.update({ data, cubeId, admin: next.admin });
  }

  update(ctx);
  return { update };
}
