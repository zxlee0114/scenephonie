// @vitest-environment jsdom
/**
 * 點外面就收起來（票券 29，使用者回饋 2026-09-04）。
 *
 * 原本 slash 選單只在 Tiptap suggestion exit 時關閉，而那要編輯器收到 transaction 才會發生 ——
 * 點 header、點頁面留白這些不進編輯器的地方，選單就一直開著。
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { dismissOnOutsidePointer } from "./dismiss-on-outside-pointer";

let stop: (() => void) | undefined;
afterEach(() => {
  stop?.();
  stop = undefined;
  document.body.innerHTML = "";
});

function setup() {
  document.body.innerHTML = `
    <div id="menu"><button id="item">新增下一場</button></div>
    <div id="outside"><span id="deep">別的東西</span></div>
  `;
  const menu = document.getElementById("menu") as HTMLElement;
  const close = vi.fn();
  stop = dismissOnOutsidePointer(() => menu, close);
  return { close };
}

const pointerDown = (id: string) =>
  document.getElementById(id)!.dispatchEvent(new Event("pointerdown", { bubbles: true }));

describe("dismissOnOutsidePointer", () => {
  it("點選單外面就關", () => {
    const { close } = setup();
    pointerDown("outside");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("點選單裡的項目不關 —— 那一下是要選它，關掉會讓 click 落空", () => {
    const { close } = setup();
    pointerDown("item");
    expect(close).not.toHaveBeenCalled();
  });

  it("外面的深層子節點也算外面", () => {
    const { close } = setup();
    pointerDown("deep");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("元素在事件當下才問 —— 註冊時還沒掛上也照樣收得到", () => {
    document.body.innerHTML = `<div id="outside">別的東西</div>`;
    const close = vi.fn();
    let menu: HTMLElement | null = null; // 註冊的當下彈出層還沒畫出來
    stop = dismissOnOutsidePointer(() => menu, close);

    menu = document.createElement("div"); // 之後才掛上
    document.body.append(menu);
    menu.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(close).not.toHaveBeenCalled();

    pointerDown("outside");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("停掉之後不再關", () => {
    const { close } = setup();
    stop?.();
    stop = undefined;
    pointerDown("outside");
    expect(close).not.toHaveBeenCalled();
  });
});
