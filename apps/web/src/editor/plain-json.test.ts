/**
 * 這個檔案守的是一個曾經真的發生過的資料遺失：ProseMirror 的 `attrs` 是 null-prototype
 * 物件，React 的 Server Action 序列化會把它靜默換成 temporary reference，於是存進資料庫的
 * doc 每一個 attr 都不見了（`sceneId` 沒了 → 重整後所有場次號變同一個數字）。
 *
 * 第一個測試釘住的是**危險本身**（PM 真的產出 null-prototype），第二個釘住的是**解法**。
 * 哪天 prosemirror-model 改掉了，第一個測試會失敗 —— 那正是我們想知道的時刻。
 */
import { mintSceneId, schema } from "@scenephonie/schema";
import { describe, expect, it } from "vitest";

import { emptyScreenplay } from "./empty-screenplay";
import { toPlainJson } from "./plain-json";

function docJson() {
  return schema
    .node("doc", null, [
      schema.node("scene", { sceneId: mintSceneId(), time: "夜", intExt: "內景" }, [
        schema.node("action", null, [schema.text("阿明推開玻璃門。")]),
        schema.node("dialogue", { voiceStyle: "V.O." }, [schema.text("還有位子嗎？")]),
      ]),
    ])
    .toJSON() as Record<string, unknown>;
}

/** 走一遍樹，收集所有 prototype 不是 `Object.prototype` 的物件所在路徑。 */
function nullPrototypePaths(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => nullPrototypePaths(v, `${path}[${i}]`));
  if (typeof value !== "object" || value === null) return [];
  const here = Object.getPrototypeOf(value) === Object.prototype ? [] : [path];
  return [
    ...here,
    ...Object.entries(value).flatMap(([k, v]) => nullPrototypePaths(v, `${path}.${k}`)),
  ];
}

describe("toPlainJson", () => {
  it("ProseMirror 的 toJSON 真的會產出 null-prototype 的 attrs（這就是危險本身）", () => {
    const paths = nullPrototypePaths(docJson());
    expect(paths).not.toEqual([]);
    expect(paths).toContain("$.content[0].attrs");
  });

  it("正規化後整棵樹沒有任何 null-prototype 物件", () => {
    expect(nullPrototypePaths(toPlainJson(docJson()))).toEqual([]);
  });

  it("內容一個字都不變 —— 只換 prototype，不動資料", () => {
    const json = docJson();
    expect(toPlainJson(json)).toEqual(json);
    // attr 值本身也要在（`toEqual` 對 null-prototype 與一般物件是相等的，所以另外點名）。
    const scene = (toPlainJson(json).content as Record<string, unknown>[])[0]!;
    const attrs = scene.attrs as Record<string, unknown>;
    expect(attrs.sceneId).toMatch(/^sc_/);
    expect(attrs.time).toBe("夜");
  });
});

describe("emptyScreenplay", () => {
  // 這份 doc 生來就要跨 RSC 邊界（伺服器建立 → client component 的 initialContent）。
  // 少了正規化，第一次進 /editor 就會拋
  // 「Only plain objects … can be passed to Client Components」——重整後才好，因為那次
  // 是從 jsonb 撈回來的、已經被 JSON.parse 洗過。
  it("回傳的是純 JSON，跨得過 server → client 邊界", () => {
    expect(nullPrototypePaths(emptyScreenplay())).toEqual([]);
  });

  it("仍然是一份有 sceneId 的合法單場次 doc", () => {
    const doc = emptyScreenplay();
    const scene = (doc.content as Record<string, unknown>[])[0]!;
    expect((scene.attrs as Record<string, unknown>).sceneId).toMatch(/^sc_/);
  });
});
