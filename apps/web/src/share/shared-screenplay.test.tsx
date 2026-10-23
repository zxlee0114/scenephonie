// @vitest-environment jsdom
/**
 * 唯讀分享頁（票券 20，§10、§7.10）—— 編輯器的閱讀呈現（不是 PDF 預覽），劇本與場次表是同一個 share
 * 的兩個視圖；頁頂那一行讓漂移變得可察覺，但凍結頁不對讀者說「作者後來又改了」。
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DELIVERY_PAYLOAD_VERSION, type DeliveryPayload } from "@scenephonie/schema";

import { shareBanner } from "./banner";
import { SharedScreenplay } from "./SharedScreenplay";

afterEach(cleanup);

const payload: DeliveryPayload = {
  version: DELIVERY_PAYLOAD_VERSION,
  scenes: [
    {
      sceneId: "sc_a",
      label: "1",
      intExt: "內景",
      time: "夜",
      locations: [{ name: "海豚公寓房間", displayName: "未知大樓房間" }],
      appearingCharacters: [{ name: "小明", displayName: "小明" }],
      extras: "",
    },
    {
      sceneId: "sc_b",
      label: "3",
      intExt: "外景",
      time: "日",
      locations: [{ name: "陽台", displayName: "陽台" }],
      appearingCharacters: [],
      extras: "路人（3）",
    },
  ],
  script: [
    { type: "heading", sceneId: "sc_a" },
    { type: "action", text: "走進房間" },
    { type: "dialogue", speaker: "小明", voiceStyle: "O.S.", text: "有人在嗎" },
    { type: "heading", sceneId: "sc_b" },
    { type: "action", text: "點菸" },
  ],
};

describe("頁頂那一行", () => {
  it("即時：「即時連結 · 最後更新於 X」（台北時間）", () => {
    expect(shareBanner({ kind: "live", updatedAt: new Date("2026-10-23T01:30:00Z") })).toBe(
      "即時連結 · 最後更新於 2026-10-23 09:30",
    );
  });

  it("凍結：「這是 X 時交付的版本」—— 只說交付的時刻，不說之後怎樣", () => {
    expect(shareBanner({ kind: "frozen", deliveredAt: new Date("2026-10-20T06:30:00Z") })).toBe(
      "這是 2026-10-20 14:30 交付的版本",
    );
  });
});

describe("劇本視圖", () => {
  it("依閱讀順序印出場次標題（交付的場次號，跳號照跳）、動作與對白", () => {
    render(<SharedScreenplay payload={payload} view="script" onShowScript={vi.fn()} />);
    const script = screen.getByRole("article", { name: "劇本" });

    const headings = within(script).getAllByRole("heading", { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(["S1內景夜未知大樓房間", "S3外景日陽台"]);
    expect(within(script).getByText("走進房間")).toBeTruthy();
    expect(within(script).getByText("有人在嗎")).toBeTruthy();
    expect(within(script).getByText("小明（O.S.）")).toBeTruthy();
  });

  it("場次導覽列出交付裡的場次；點一列捲到那一場", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(<SharedScreenplay payload={payload} view="script" onShowScript={vi.fn()} />);
    const nav = screen.getByRole("navigation", { name: "場次導覽" });

    fireEvent.click(within(nav).getByRole("button", { name: /S3/ }));

    expect(scrollIntoView).toHaveBeenCalled();
    expect((scrollIntoView.mock.contexts.at(-1) as HTMLElement).dataset.sceneId).toBe("sc_b");
  });
});

describe("場次表視圖", () => {
  it("同一個 share 的另一種讀法：每場一列，地點是 `實體名（顯示名）`", () => {
    render(<SharedScreenplay payload={payload} view="table" onShowScript={vi.fn()} />);
    const table = screen.getByRole("table");

    const first = within(table).getAllByRole("row")[1]!;
    expect(within(first).getAllByRole("cell").map((c) => c.textContent)).toEqual([
      "1",
      "內景",
      "夜",
      "海豚公寓房間（未知大樓房間）",
      "小明",
      "",
    ]);
  });

  it("點一列先開預覽（跟編輯器的場次表同一個手勢）；按「到劇本這一場」才回到劇本視圖", () => {
    const onShowScript = vi.fn();
    render(<SharedScreenplay payload={payload} view="table" onShowScript={onShowScript} />);

    fireEvent.click(screen.getByRole("button", { name: "3" }));

    const preview = screen.getByRole("dialog");
    expect(preview.textContent).toMatch("點菸");
    expect(onShowScript).not.toHaveBeenCalled();

    fireEvent.click(within(preview).getByRole("button", { name: "到劇本這一場" }));
    expect(onShowScript).toHaveBeenCalled();
  });
});
