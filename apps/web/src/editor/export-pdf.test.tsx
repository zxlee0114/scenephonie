// @vitest-environment jsdom
/**
 * 匯出 PDF 的按鈕（票券 18）。順序是被迫的（§9.2）：
 *
 * 1. **先把手上的存掉** —— 交付承諾的是 canonical state，不是分頁記憶體裡還沒存的那一份。
 *    存不進去就不匯出：印出一份少了剛才那幾個字的 PDF，比不印更糟。
 * 2. **再建立交付** —— 一個交易，回傳那一筆的 id。
 * 3. **再印** —— 讀那一筆交付。印壞了就用**同一筆**重印，不建立第二筆（重試 ≠ 再匯出一次）。
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ExportPreflight } from "@scenephonie/schema";

import { ExportPdf } from "./export-pdf";

// 字串不是 Blob：jsdom 的 Blob 交不進 Node 22 內建（undici）的 Response（`object.stream is not a function`）。
const pdfBody = "%PDF-1.7";

const nothingSkipped: ExportPreflight = {
  drafts: [],
  skipped: { drafts: 0, groupMates: 0 },
  appearing: [],
};

function mount({
  flush = vi.fn(async () => true),
  createDelivery = vi.fn(async (): Promise<string | null> => "dl_1"),
  preflight = () => nothingSkipped,
  setDraftReminderDismissed = vi.fn(),
  revealScene = vi.fn(),
}: {
  flush?: () => Promise<boolean>;
  createDelivery?: () => Promise<string | null>;
  preflight?: () => ExportPreflight;
  setDraftReminderDismissed?: (sceneIds: string[], dismissed: boolean) => void;
  revealScene?: (sceneId: string) => void;
} = {}) {
  const pdfUrl = vi.fn(
    (deliveryId: string, query: string) => `/pdf/${deliveryId}?${query}`,
  );
  render(
    <ExportPdf
      flush={flush}
      createDelivery={createDelivery}
      pdfUrl={pdfUrl}
      preflight={preflight}
      setDraftReminderDismissed={setDraftReminderDismissed}
      revealScene={revealScene}
    />,
  );
  return {
    flush,
    createDelivery,
    pdfUrl,
    setDraftReminderDismissed,
    revealScene,
  };
}

const open = () =>
  fireEvent.click(screen.getByRole("button", { name: "匯出 PDF" }));
const checkbox = (name: RegExp) =>
  screen.getByRole("checkbox", { name }) as HTMLInputElement;
const radio = (name: RegExp) =>
  screen.getByRole("radio", { name }) as HTMLInputElement;
const watermarkBox = () =>
  screen.getByRole("textbox", { name: /浮水印/ }) as HTMLInputElement;
const submit = () =>
  act(
    async () =>
      void fireEvent.click(screen.getByRole("button", { name: "匯出" })),
  );

let fetchMock: ReturnType<typeof vi.fn>;
let downloads: string[];

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(pdfBody, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  downloads = [];
  URL.createObjectURL = vi.fn(() => "blob:pdf");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push(this.download);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("匯出 PDF", () => {
  it("先存檔、再建立交付、再印那一筆，印好就下載", async () => {
    const order: string[] = [];
    const { pdfUrl } = mount({
      flush: vi.fn(async () => (order.push("flush"), true)),
      createDelivery: vi.fn(async () => (order.push("deliver"), "dl_1")),
    });
    fetchMock.mockImplementation(
      async () => (order.push("print"), new Response(pdfBody)),
    );

    open();
    await submit();

    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(order).toEqual(["flush", "deliver", "print"]);
    expect(pdfUrl).toHaveBeenCalledWith("dl_1", expect.any(String));
    expect(fetchMock).toHaveBeenCalledWith(
      "/pdf/dl_1?" + pdfUrl.mock.calls[0]![1],
    );
    expect(downloads[0]).toBe("dl_1.pdf");
  });

  it("下載的檔名用伺服器給的那一個（劇本名稱_交付時間）", async () => {
    const name = "阿強的夏天_20261022-1430.pdf";
    fetchMock.mockResolvedValue(
      new Response(pdfBody, {
        headers: {
          "content-disposition": `inline; filename="dl_1.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`,
        },
      }),
    );
    mount();
    open();
    await submit();

    await waitFor(() => expect(downloads).toEqual([name]));
  });

  it("選項預設：登場人物不勾、時間戳勾著、浮水印空白、字型楷體；改過的選項跟著網址走", async () => {
    const { pdfUrl } = mount();
    open();

    expect(checkbox(/登場人物/).checked).toBe(false);
    expect(checkbox(/時間戳/).checked).toBe(true);
    expect(watermarkBox().value).toBe("");
    expect(radio(/楷體/).checked).toBe(true);

    fireEvent.change(watermarkBox(), {
      target: { value: "僅供第48屆優良電影劇本獎評審使用" },
    });
    fireEvent.click(checkbox(/登場人物/));
    fireEvent.click(checkbox(/時間戳/));
    fireEvent.click(radio(/黑體/));
    await submit();

    await waitFor(() => expect(pdfUrl).toHaveBeenCalled());
    const query = new URLSearchParams(pdfUrl.mock.calls[0]![1]);
    expect(query.get("watermark")).toBe("僅供第48屆優良電影劇本獎評審使用");
    expect(query.get("characters")).toBe("1");
    expect(query.get("timestamp")).toBe("0");
    expect(query.get("font")).toBe("sans");
  });

  it("存不進去就不匯出 —— 不建立交付，並說出原因", async () => {
    const { createDelivery } = mount({ flush: vi.fn(async () => false) });
    open();
    await submit();

    expect((await screen.findByRole("alert")).textContent).toMatch(/沒存進去/);
    expect(createDelivery).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("建立交付時斷線：說是連線問題、不叫人重新登入，也不印", async () => {
    mount({
      createDelivery: vi.fn(async () => Promise.reject(new Error("network"))),
    });
    open();
    await submit();

    const alert = (await screen.findByRole("alert")).textContent;
    expect(alert).toMatch(/連線/);
    expect(alert).not.toMatch(/登入/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("印壞了：「再印一次」用同一筆交付重印，不建立第二筆", async () => {
    const { createDelivery } = mount();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    open();
    await submit();

    expect((await screen.findByRole("alert")).textContent).toMatch(
      /沒有印出來/,
    );
    await act(
      async () =>
        void fireEvent.click(screen.getByRole("button", { name: "再印一次" })),
    );

    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(createDelivery).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![0]).toBe(fetchMock.mock.calls[0]![0]);
  });
});

/**
 * 匯出前防呆（票券 19，§9.6）—— 「這份 PDF 會少掉這幾場」，不是「要不要輸出這一場」。
 *
 * 草稿一多，清單會把匯出選項推出視窗 —— 所以拆成兩步：還有要提醒的草稿時，打開先看清單
 * （第一步），「下一步」才是原本的選項。只提醒、不擋：不必處理任何一場就能往下走。
 */
describe("匯出前防呆", () => {
  const twoDrafts: ExportPreflight = {
    drafts: [
      {
        sceneId: "sc_a",
        label: "S11[D1]",
        excerpt: "小明在雨中奔跑",
        reasons: [{ kind: "missingMeta", fields: ["intExt", "location"] }],
        dismissed: false,
      },
      {
        sceneId: "sc_b",
        label: "S2[D1]",
        excerpt: "",
        reasons: [{ kind: "manual" }],
        dismissed: false,
        group: { groupMates: ["2", "2.1"] },
      },
    ],
    skipped: { drafts: 2, groupMates: 2 },
    appearing: [],
  };
  const draftList = () => screen.getByRole("group", { name: /會略過以下/ });
  const button = (name: string | RegExp) =>
    screen.getByRole("button", { name }) as HTMLButtonElement;
  const row = (label: RegExp) => checkbox(label).closest("li")!;

  it("還有要提醒的草稿：打開先看清單 —— 標籤、內容首行、為什麼；草稿成員說出同組誰一起略過", () => {
    mount({ preflight: () => twoDrafts });
    open();

    expect(draftList().textContent).toMatch(/本次匯出會略過以下 2 場草稿/);
    expect(draftList().textContent).toMatch(/若是有意為之，直接按下一步即可/);
    expect(row(/S11\[D1\]/).textContent).toMatch(
      /「小明在雨中奔跑」.*未填寫內／外、地點/,
    );
    const member = row(/S2\[D1\]/).textContent;
    expect(member).toMatch(/（沒有內文）/);
    expect(member).toMatch(/手動標記為草稿/);
    expect(member).toMatch(/此場屬於對剪群組，同組的 2、2\.1 會一起略過/);
    expect(screen.queryByRole("textbox", { name: /浮水印/ })).toBeNull();
  });

  it("下一步是原本的匯出選項；上一步回到清單", () => {
    mount({ preflight: () => twoDrafts });
    open();

    fireEvent.click(button("下一步"));
    expect(watermarkBox()).toBeTruthy();
    expect(screen.queryByRole("group", { name: /會略過以下/ })).toBeNull();
    expect(screen.getByRole("dialog").textContent).toMatch(
      /本次會略過 2 場草稿/,
    );

    fireEvent.click(button("上一步"));
    expect(draftList()).toBeTruthy();
  });

  it("多選與全選；「之後不再提醒」只記勾了的那幾場（sceneId）", () => {
    const { setDraftReminderDismissed } = mount({ preflight: () => twoDrafts });
    open();
    const remember = () => button("之後不再提醒勾選的場次");

    expect(remember().disabled).toBe(true);
    fireEvent.click(checkbox(/S2\[D1\]/));
    fireEvent.click(remember());
    expect(setDraftReminderDismissed).toHaveBeenLastCalledWith(["sc_b"], true);

    fireEvent.click(checkbox(/全選/));
    expect(checkbox(/S11\[D1\]/).checked).toBe(true);
    expect(checkbox(/S2\[D1\]/).checked).toBe(true);
    fireEvent.click(remember());
    expect(setDraftReminderDismissed).toHaveBeenLastCalledWith(
      ["sc_a", "sc_b"],
      true,
    );
  });

  it("不再提醒過的收進「其中 y 場已標記不再提醒」，展開可以恢復提醒", () => {
    let current = twoDrafts;
    const { setDraftReminderDismissed } = mount({
      preflight: () => current,
      setDraftReminderDismissed: vi.fn((ids: string[], dismissed: boolean) => {
        current = {
          ...current,
          drafts: current.drafts.map((d) =>
            ids.includes(d.sceneId) ? { ...d, dismissed } : d,
          ),
        };
      }),
    });
    open();
    fireEvent.click(checkbox(/S11\[D1\]/));
    fireEvent.click(button("之後不再提醒勾選的場次"));

    const quiet = screen.getByRole("group", {
      name: /其中 1 場已標記不再提醒/,
    });
    expect(quiet.textContent).toMatch(/S11\[D1\]/);
    expect(draftList().textContent).toMatch(/以下 2 場草稿/);
    expect(row(/S2\[D1\]/).querySelector("input")!.checked).toBe(false);

    fireEvent.click(checkbox(/S11\[D1\]/));
    fireEvent.click(button("恢復提醒勾選的場次"));
    expect(setDraftReminderDismissed).toHaveBeenLastCalledWith(["sc_a"], false);
    expect(screen.queryByRole("group", { name: /已標記不再提醒/ })).toBeNull();
  });

  it("全部都設成不再提醒：直接到匯出選項；匯出完成後仍說「本次略過 N 場草稿」—— 不擋、不需點掉", async () => {
    mount({
      preflight: () => ({
        ...twoDrafts,
        drafts: twoDrafts.drafts.map((d) => ({ ...d, dismissed: true })),
      }),
    });
    open();
    expect(screen.queryByRole("group", { name: /會略過以下/ })).toBeNull();
    await submit();

    await waitFor(() => expect(downloads).toHaveLength(1));
    const done = screen.getByRole("status").textContent;
    expect(done).toMatch(/已下載/);
    expect(done).toMatch(/本次略過 2 場草稿/);
    expect(done).toMatch(/另有 2 場/);
  });

  it("沒有略過任何一場就不說", async () => {
    mount();
    open();
    await submit();

    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(screen.getByRole("status").textContent).not.toMatch(/略過/);
  });

  it("「前往修改」關掉面板、帶到那一場", () => {
    const { revealScene } = mount({ preflight: () => twoDrafts });
    open();

    fireEvent.click(
      within(row(/S2\[D1\]/)).getByRole("button", { name: /前往修改/ }),
    );
    expect(revealScene).toHaveBeenCalledWith("sc_b");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  describe("登場人物提示：另外列，提醒但不阻擋", () => {
    const appearing: ExportPreflight = {
      ...nothingSkipped,
      appearing: [
        { sceneId: "sc_c", label: "3", speakers: ["小明", "小華"] },
        { sceneId: "sc_d", label: "15", speakers: ["小美"] },
      ],
    };

    it("只有登場人物提示時不攔在第一步：選項那一步說一聲，上一步看得到清單", () => {
      mount({ preflight: () => appearing });
      open();

      expect(watermarkBox()).toBeTruthy();
      expect(screen.getByRole("dialog").textContent).toMatch(
        /2 場的台詞有人不在登場人物欄/,
      );
      fireEvent.click(button("上一步"));

      const reminder = screen.getByRole("group", {
        name: /有台詞、但不在登場人物欄的人/,
      });
      expect(reminder.textContent).toMatch(/3.*小明、小華/);
      expect(reminder.querySelector("input")).toBeNull();
    });

    it("與草稿同列在第一步；「前往修改」帶到那一場；匯出照常", async () => {
      const { revealScene } = mount({
        preflight: () => ({ ...twoDrafts, appearing: appearing.appearing }),
      });
      open();

      const reminder = screen.getByRole("group", {
        name: /有台詞、但不在登場人物欄的人/,
      });
      expect(reminder.textContent).toMatch(/不阻擋匯出/);
      fireEvent.click(
        within(reminder).getAllByRole("button", { name: /前往修改/ })[1]!,
      );
      expect(revealScene).toHaveBeenCalledWith("sc_d");
    });

    it("沒有草稿也沒有提醒：選項那一步什麼都不多說，也沒有上一步", () => {
      mount();
      open();

      expect(screen.getByRole("dialog").textContent).not.toMatch(/登場人物欄/);
      expect(screen.queryByRole("button", { name: "上一步" })).toBeNull();
    });
  });
});
