// @vitest-environment jsdom
/**
 * 票券 71 —— 建立精靈：名稱（必填）→ 文件（故事大綱／分場大綱頁籤）→ 確認。走完才建；中途離開只留本機草稿。
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CreateProject, CreateProjectOutcome } from "./create-capability";
import { creationDraftStore } from "./creation-draft";
import { ProjectCreator } from "./project-creator";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const USER = "usr_writer";

/** 讓 server action 的 promise 走完。 */
const settle = () => act(async () => {});

function renderCreator(create: CreateProject = async () => created) {
  const spy = vi.fn(create);
  render(<ProjectCreator userId={USER} create={spy} />);
  return spy;
}

const created: CreateProjectOutcome = { status: "created", projectId: "pj_new", screenplayId: "sp_new" };

const open = () => fireEvent.click(screen.getByRole("button", { name: "建立專案" }));
const next = () => fireEvent.click(screen.getByRole("button", { name: "下一步" }));
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

/** 走到第三步：兩個名稱填好、第二步什麼都不寫。 */
function walkToConfirm(projectTitle = "海豚計畫", screenplayTitle = "海豚公寓") {
  open();
  type("專案名稱", projectTitle);
  type("劇本名稱", screenplayTitle);
  next();
  next();
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("第一步：名稱", () => {
  it("兩個名稱都必填：沒填（或只有空白）按下一步，欄位下方說要填，停在這一步", () => {
    renderCreator();
    open();
    type("專案名稱", "   ");

    next();

    expect(screen.getByText("請填專案名稱")).toBeTruthy();
    expect(screen.getByText("請填劇本名稱")).toBeTruthy();
    expect(screen.getByLabelText("專案名稱")).toBeTruthy();
  });

  it("「與專案名稱相同」預設不勾；勾起來劇本名稱跟著專案名稱走，取消勾選留著當下的字", () => {
    renderCreator();
    open();
    const same = screen.getByRole("checkbox", { name: "與專案名稱相同" }) as HTMLInputElement;
    expect(same.checked).toBe(false);

    fireEvent.click(same);
    type("專案名稱", "海豚公寓");
    const screenplayTitle = screen.getByLabelText("劇本名稱") as HTMLInputElement;
    expect(screenplayTitle.value).toBe("海豚公寓");
    expect(screenplayTitle.readOnly).toBe(true);

    fireEvent.click(same);
    type("專案名稱", "海豚計畫");
    expect(screenplayTitle.value).toBe("海豚公寓");
    expect(screenplayTitle.readOnly).toBe(false);
  });
});

describe("第二步：文件", () => {
  it("故事大綱、分場大綱兩個頁籤；只有上一步、下一步，沒有略過", () => {
    renderCreator();
    open();
    type("專案名稱", "海豚計畫");
    type("劇本名稱", "海豚公寓");
    next();

    expect(screen.getByRole("tab", { name: "故事大綱" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "分場大綱" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "上一步" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "略過" })).toBeNull();
  });
});

describe("第三步：建立", () => {
  it("摘要列出兩個名稱；沒寫的大綱寫「尚未開始」", () => {
    renderCreator();
    walkToConfirm();

    const summary = screen.getByRole("dialog");
    expect(summary.textContent).toContain("海豚計畫");
    expect(summary.textContent).toContain("海豚公寓");
    expect(screen.getAllByText("尚未開始")).toHaveLength(2);
  });

  it("直接撰寫劇本：交出名稱與兩份大綱，按下就兩顆都鎖住，建好進劇本編輯器、草稿清掉", async () => {
    let resolve!: (outcome: CreateProjectOutcome) => void;
    const create = renderCreator(() => new Promise((r) => (resolve = r)));
    walkToConfirm(" 海豚計畫 ", "海豚公寓");

    fireEvent.click(screen.getByRole("button", { name: "直接撰寫劇本" }));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        creationId: expect.stringMatching(/^cr_/),
        projectTitle: " 海豚計畫 ",
        screenplayTitle: "海豚公寓",
        submissionOutline: { type: "doc", content: [{ type: "paragraph" }] },
        sceneOutline: { type: "doc", content: [{ type: "paragraph" }] },
      }),
    );
    expect((screen.getByRole("button", { name: "建立中…" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "進入專案頁" }) as HTMLButtonElement).disabled).toBe(true);

    resolve(created);
    await settle();

    expect(push).toHaveBeenCalledWith("/projects/pj_new/screenplays/sp_new");
    expect(creationDraftStore(USER).load()).toBeNull();
  });

  it("進入專案頁：建好進 hub", async () => {
    renderCreator();
    walkToConfirm();

    fireEvent.click(screen.getByRole("button", { name: "進入專案頁" }));
    await settle();

    expect(push).toHaveBeenCalledWith("/projects/pj_new");
  });

  it("沒建成：停在第三步說沒建成，按鈕解鎖、草稿還在，可以再按一次（同一個建立鍵）", async () => {
    const create = renderCreator(async () => ({ status: "failed" }));
    walkToConfirm();

    fireEvent.click(screen.getByRole("button", { name: "直接撰寫劇本" }));
    await settle();

    expect(screen.getByRole("alert").textContent).toContain("沒有建立成功");
    expect(push).not.toHaveBeenCalled();
    expect(creationDraftStore(USER).load()?.projectTitle).toBe("海豚計畫");

    fireEvent.click(screen.getByRole("button", { name: "直接撰寫劇本" }));
    await settle();
    expect(create.mock.calls[1]![0].creationId).toBe(create.mock.calls[0]![0].creationId);
  });
});

describe("離開與接回", () => {
  it("點彈窗外面不關；× 會關", () => {
    renderCreator();
    open();

    fireEvent.mouseDown(screen.getByRole("dialog").parentElement!);
    fireEvent.click(screen.getByRole("dialog").parentElement!);
    expect(screen.queryByRole("dialog")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "關閉" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Esc 關閉；草稿存得進去就不問", () => {
    renderCreator();
    open();
    type("專案名稱", "海豚計畫");

    fireEvent.keyDown(screen.getByLabelText("專案名稱"), { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("填過東西關掉，下次按建立專案先問；接著做回到上次那一步那個頁籤，內容都在", () => {
    renderCreator();
    open();
    type("專案名稱", "海豚計畫");
    type("劇本名稱", "海豚公寓");
    next();
    fireEvent.click(screen.getByRole("tab", { name: "分場大綱" }));
    fireEvent.click(screen.getByRole("button", { name: "關閉" }));

    open();
    expect(screen.getByRole("dialog").textContent).toContain("上次沒完成的「海豚計畫」");
    fireEvent.click(screen.getByRole("button", { name: "接著做" }));

    expect(screen.getByRole("tab", { name: "分場大綱" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "上一步" }));
    expect((screen.getByLabelText("專案名稱") as HTMLInputElement).value).toBe("海豚計畫");
  });

  it("重新開始：草稿清掉，從空白的第一步開始", () => {
    creationDraftStore(USER).save({
      creationId: "cr_old",
      projectTitle: "舊的",
      screenplayTitle: "",
      sameName: false,
      submissionOutline: { type: "doc", content: [{ type: "paragraph" }] },
      sceneOutline: { type: "doc", content: [{ type: "paragraph" }] },
      step: 2,
      tab: "交件大綱",
    });
    renderCreator();
    open();

    fireEvent.click(screen.getByRole("button", { name: "重新開始" }));

    expect((screen.getByLabelText("專案名稱") as HTMLInputElement).value).toBe("");
    expect(creationDraftStore(USER).load()).toBeNull();
  });

  it("什麼都沒填就關掉：下次不問", () => {
    renderCreator();
    open();
    fireEvent.click(screen.getByRole("button", { name: "關閉" }));

    open();

    expect(screen.queryByRole("button", { name: "接著做" })).toBeNull();
    expect(screen.getByLabelText("專案名稱")).toBeTruthy();
  });

  it("草稿存不進去：說一聲；關閉先問、離開頁面請瀏覽器攔；捨棄才關", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    renderCreator();
    open();
    type("專案名稱", "海豚計畫");

    expect(screen.getByText("這台瀏覽器存不了草稿，關閉之後填的內容就會不見。")).toBeTruthy();
    const leaving = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaving);
    expect(leaving.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "關閉" }));
    expect(screen.getByRole("alertdialog").textContent).toContain("要捨棄目前填的內容嗎");
    fireEvent.click(screen.getByRole("button", { name: "繼續填" }));
    expect(screen.queryByRole("dialog")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "關閉" }));
    fireEvent.click(screen.getByRole("button", { name: "捨棄" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("大綱內文", () => {
  it("寫了的大綱：摘要印字數，建立時原樣交出去", async () => {
    const outline = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "海豚" }] }] };
    creationDraftStore(USER).save({
      creationId: "cr_saved",
      projectTitle: "海豚計畫",
      screenplayTitle: "海豚公寓",
      sameName: false,
      submissionOutline: outline,
      sceneOutline: { type: "doc", content: [{ type: "paragraph" }] },
      step: 3,
      tab: "交件大綱",
    });
    const create = renderCreator();
    open();
    fireEvent.click(screen.getByRole("button", { name: "接著做" }));

    expect(screen.getByText("2 字")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "直接撰寫劇本" }));
    await settle();

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ creationId: "cr_saved", submissionOutline: outline }));
  });
});
