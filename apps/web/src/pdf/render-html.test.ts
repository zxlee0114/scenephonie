// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { DELIVERY_PAYLOAD_VERSION, type DeliveredScene, type DeliveryPayload } from "@scenephonie/schema";

import { DEFAULT_EXPORT_OPTIONS, type ExportOptions } from "./export-options";
import { renderDeliveryHtml } from "./render-html";

/**
 * 交付 → GHSA 格式的 HTML（票券 18，§9.4）。渲染器只讀 payload，**只決定印成什麼字**：
 * 場次號、折返該不該印、片段歸誰都已經在交付裡算好（不變式 E）。
 *
 * 期望值是規格 §9.4 那張表上的字，不是照實作拼出來的。
 */

const createdAt = new Date("2026-10-22T06:30:00Z"); // 台北 14:30

const scene = (sceneId: string, label: string, overrides: Partial<DeliveredScene> = {}): DeliveredScene => ({
  sceneId,
  label,
  intExt: "內景",
  time: "夜",
  locations: [{ name: "阿強家客廳", displayName: "阿強家客廳" }],
  appearingCharacters: [],
  extras: "",
  ...overrides,
});

const payloadOf = (scenes: DeliveredScene[], script: DeliveryPayload["script"]): DeliveryPayload => ({
  version: DELIVERY_PAYLOAD_VERSION,
  scenes,
  script,
});

function render(payload: DeliveryPayload, options: Partial<ExportOptions> = {}): Document {
  const html = renderDeliveryHtml({ createdAt, payload }, { ...DEFAULT_EXPORT_OPTIONS, ...options });
  return new DOMParser().parseFromString(html, "text/html");
}

/** 劇本內文印出來的每一行（一個元素一行），依閱讀順序。 */
const lines = (doc: Document): string[] =>
  [...doc.querySelectorAll("[data-section='script'] > *")].map((el) => el.textContent ?? "");

describe("renderDeliveryHtml：各元素的印法（§9.4）", () => {
  it("場次標題 `1. 內景 阿強家客廳 夜`、動作是純段落", () => {
    const doc = render(
      payloadOf([scene("sc_1", "1")], [
        { type: "heading", sceneId: "sc_1" },
        { type: "action", text: "阿強推門進來。" },
      ]),
    );
    expect(lines(doc)).toEqual(["1. 內景 阿強家客廳 夜", "阿強推門進來。"]);
  });

  it("子場次標題 `5.1　內景 醫院走廊 日`：無尾點、改用全形空白、不加「插入」", () => {
    const doc = render(
      payloadOf(
        [
          scene("sc_5", "5"),
          scene("sc_51", "5.1", {
            parentSceneId: "sc_5",
            time: "日",
            locations: [{ name: "醫院走廊", displayName: "醫院走廊" }],
          }),
        ],
        [{ type: "heading", sceneId: "sc_51" }],
      ),
    );
    expect(lines(doc)).toEqual(["5.1　內景 醫院走廊 日"]);
  });

  it("對白行內式 `人物名：對白`；發聲方式 `小明（V.O.）：…`；插入畫面印 `（INS）`", () => {
    const doc = render(
      payloadOf([scene("sc_1", "1")], [
        { type: "dialogue", speaker: "阿強", voiceStyle: "一般", text: "你回來了。" },
        { type: "dialogue", speaker: "小明", voiceStyle: "V.O.", text: "我一直都在。" },
        { type: "dialogue", speaker: "媽媽", voiceStyle: "O.S.", text: "吃飯了！" },
        { type: "insertShot", text: "桌上的信。" },
      ]),
    );
    expect(lines(doc)).toEqual([
      "阿強：你回來了。",
      "小明（V.O.）：我一直都在。",
      "媽媽（O.S.）：吃飯了！",
      "（INS）桌上的信。",
    ]);
  });

  it("對白沒指定說話者時只印對白本身 —— 不替編劇補一個名字", () => {
    const doc = render(
      payloadOf([scene("sc_1", "1")], [{ type: "dialogue", speaker: null, voiceStyle: "一般", text: "有人嗎？" }]),
    );
    expect(lines(doc)).toEqual(["有人嗎？"]);
  });

  it("折返印 `回到　公寓客廳` —— 地點顯示名，不印場次號", () => {
    const doc = render(
      payloadOf([scene("sc_1", "1")], [{ type: "returnTo", sceneId: "sc_1", location: "公寓客廳" }]),
    );
    expect(lines(doc)).toEqual(["回到　公寓客廳"]);
  });

  it("對剪：成員各自完整標題 → `以下對剪` → 片段標記印地點名、不印場次號", () => {
    const doc = render(
      payloadOf(
        [
          scene("sc_2", "2", { groupId: "gr_1", locations: [{ name: "公寓客廳", displayName: "公寓客廳" }] }),
          scene("sc_3", "3", { groupId: "gr_1", locations: [{ name: "電話亭", displayName: "電話亭" }], intExt: "外景" }),
        ],
        [
          { type: "heading", sceneId: "sc_2" },
          { type: "heading", sceneId: "sc_3" },
          { type: "intercut", groupId: "gr_1" },
          { type: "fragment", sceneId: "sc_2", location: "公寓客廳", disambiguateBy: [] },
          { type: "dialogue", speaker: "阿強", voiceStyle: "一般", text: "喂？" },
          { type: "fragment", sceneId: "sc_3", location: "電話亭", disambiguateBy: [] },
          { type: "dialogue", speaker: "小明", voiceStyle: "一般", text: "是我。" },
        ],
      ),
    );
    expect(lines(doc)).toEqual([
      "2. 內景 公寓客廳 夜",
      "3. 外景 電話亭 夜",
      "以下對剪",
      "公寓客廳",
      "阿強：喂？",
      "電話亭",
      "小明：是我。",
    ]);
  });

  it("片段標記的地點同名時，補印交付算好的區別欄位（同一套陳設、只差日夜）", () => {
    const doc = render(
      payloadOf(
        [
          scene("sc_2", "2", { groupId: "gr_1", time: "日" }),
          scene("sc_3", "3", { groupId: "gr_1", time: "夜" }),
        ],
        [
          { type: "fragment", sceneId: "sc_2", location: "阿強家客廳", disambiguateBy: ["time"] },
          { type: "fragment", sceneId: "sc_3", location: "阿強家客廳", disambiguateBy: ["intExt", "time"] },
        ],
      ),
    );
    expect(lines(doc)).toEqual(["阿強家客廳（日）", "阿強家客廳（內景 夜）"]);
  });
});

describe("renderDeliveryHtml：雜景", () => {
  it("多個地點以頓號串起：`3. 雜景 巷口、警局 日`", () => {
    const doc = render(
      payloadOf(
        [
          scene("sc_3", "3", {
            intExt: "雜景",
            time: "日",
            locations: [
              { name: "巷口", displayName: "巷口" },
              { name: "警局", displayName: "警局" },
            ],
          }),
        ],
        [{ type: "heading", sceneId: "sc_3" }],
      ),
    );
    expect(lines(doc)).toEqual(["3. 雜景 巷口、警局 日"]);
  });

  // 使用者裁決 2026-10-22（票 17 交辦）：紙上只出現編劇寫過的字＋格式本來就有的值。
  // 「參照敘述」是場次表的產品用語，不進投稿紙面。
  it("地點留空：標題省略那一欄（`3. 雜景 夜`）；折返與片段標記沒有地點可印時補「雜景」", () => {
    const doc = render(
      payloadOf(
        [
          scene("sc_3", "3", { intExt: "雜景", locations: [] }),
          scene("sc_4", "4", { intExt: "雜景", locations: [], groupId: "gr_1" }),
        ],
        [
          { type: "heading", sceneId: "sc_3" },
          { type: "returnTo", sceneId: "sc_3", location: null },
          { type: "fragment", sceneId: "sc_4", location: null, disambiguateBy: [] },
        ],
      ),
    );
    expect(lines(doc)).toEqual(["3. 雜景 夜", "回到　雜景", "雜景"]);
  });
});

describe("renderDeliveryHtml：匯出選項", () => {
  const withPeople = payloadOf(
    [
      scene("sc_1", "1", {
        appearingCharacters: [
          { name: "小明", displayName: "男子" },
          { name: "阿強", displayName: "阿強" },
        ],
        extras: "路人（3）",
      }),
    ],
    [{ type: "heading", sceneId: "sc_1" }],
  );

  it("登場人物預設不印；群演永遠不進 PDF", () => {
    const doc = render(withPeople);
    expect(lines(doc)).toEqual(["1. 內景 阿強家客廳 夜"]);
    expect(doc.body.textContent).not.toContain("路人");
  });

  it("登場人物打開時，接在場標列最後（TNUA 寫法），印這一場的顯示名（編劇在這一場寫的那個名字）", () => {
    const doc = render(withPeople, { appearingCharacters: true });
    expect(lines(doc)).toEqual(["1. 內景 阿強家客廳 夜 男子、阿強"]);
    expect(doc.body.textContent).not.toContain("路人");
  });

  it("沒有登場人物的場次，打開選項也不在場標列多留空白", () => {
    const doc = render(payloadOf([scene("sc_1", "1")], [{ type: "heading", sceneId: "sc_1" }]), {
      appearingCharacters: true,
    });
    expect(lines(doc)).toEqual(["1. 內景 阿強家客廳 夜"]);
  });

  it("時間戳預設印，印的是交付的建立時間（台北時間）—— 什麼時候重印都是同一串字", () => {
    const html = renderDeliveryHtml({ createdAt, payload: withPeople }, DEFAULT_EXPORT_OPTIONS);
    expect(html).toContain("2026-10-22 14:30");
    expect(renderDeliveryHtml({ createdAt, payload: withPeople }, DEFAULT_EXPORT_OPTIONS)).toBe(html);
  });

  it("時間戳可以關", () => {
    const html = renderDeliveryHtml({ createdAt, payload: withPeople }, { ...DEFAULT_EXPORT_OPTIONS, timestamp: false });
    expect(html).not.toContain("2026-10-22 14:30");
  });

  it("浮水印文字照編劇輸入的印（含屆別）；預設不壓", () => {
    const watermark = "僅供第48屆優良電影劇本獎評審使用";
    expect(render(withPeople, { watermark }).body.textContent).toContain(watermark);
    expect(renderDeliveryHtml({ createdAt, payload: withPeople }, DEFAULT_EXPORT_OPTIONS)).not.toContain(watermark);
  });

  it("字型預設楷體（全字庫正楷體）；可選黑體（Noto Sans TC）", () => {
    const stylesheets = (doc: Document) =>
      [...doc.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet]")].map((l) => l.getAttribute("href"));
    expect(stylesheets(render(withPeople))[0]).toBe("/fonts/tw-kai/fonts.css");
    expect(stylesheets(render(withPeople, { font: "sans" }))).toEqual(["/fonts/noto-sans-tc/fonts.css"]);
  });

  it("輸入的字被跳脫，不會變成標記", () => {
    const doc = render(
      payloadOf([scene("sc_1", "1")], [{ type: "action", text: "<b>不是粗體</b> & 符號" }]),
      { watermark: "<script>x</script>" },
    );
    expect(lines(doc)).toEqual(["<b>不是粗體</b> & 符號"]);
    expect(doc.querySelector("b, script")).toBeNull();
  });
});

describe("renderDeliveryHtml：payload 版本", () => {
  it("不認得的 payload 版本大聲失敗 —— 交付不被遷移，猜著印會印錯字", () => {
    const future = { ...payloadOf([], []), version: 99 } as unknown as DeliveryPayload;
    expect(() => renderDeliveryHtml({ createdAt, payload: future }, DEFAULT_EXPORT_OPTIONS)).toThrow(/99/);
  });
});
