import { mintSceneId, schema as kernelSchema } from "@scenephonie/schema";
import type { Node as PMNode } from "@tiptap/pm/model";

import { toPlainJson } from "@/editor/plain-json";

/**
 * 訪客拿到的那一份稿 —— **「clone 一份 demo project」的來源**（票券 24 §6）。
 *
 * ## 為什麼種子在程式碼裡，不是資料庫裡的一列樣板
 *
 * 「clone」的實質是**每個訪客都有自己的一份**，不是「複製某一列」。真放一列樣板進資料庫，
 * 就得同時回答三個沒有人在問的問題：那一列是誰的（它需要一個 `owner_id`）、誰維護它、
 * 它壞掉的時候誰修。程式碼裡的種子沒有這些問題 —— 它跟著 deploy 走，改它要走 code review，
 * 而且**它不可能被使用者改壞**。
 *
 * ## 這份稿的引用指向真的實體（票券 08）
 *
 * 票券 07 當時把 `location`／`dialogue.character` 的 id 留成 null —— 憑空鑄一組 `lo_`／`ch_`
 * 會是指向不存在實體的引用。實體表落地之後那個理由消失了，換成一條更強的要求：
 * **範例稿必須自己滿足不變式 ⑧**。它是我們唯一出貨的一份稿，如果連它都塞滿懸空引用，
 * 訪客第一眼看到的就是一整排「新建」的 chip，而地點聚合什麼都示範不出來。
 *
 * 所以實體由 `guest/guest-entry.ts` **先建立**（每個訪客一份自己的，跟 `sceneId` 同一個理由），
 * 再把 id 交給這裡組稿 —— 就是「先建立實體、再寫入 doc」那條順序，訪客入口只是它的第一個
 * 真實呼叫端。
 *
 * `appearingCharacters` 仍然留 null：判準是**入鏡**，只有編劇答得出來 ——
 * 系統從對白推導會讓製片誤排演員通告。null ＝ 尚未填，正是一份真實的稿在這個階段的樣子。
 */

/** 訪客那個專案的名字。**看得出是範例**，不假裝是使用者自己的作品。 */
export const DEMO_PROJECT_TITLE = "範例：河堤上的十分鐘";

/**
 * 這份稿會用到的實體名字。**呼叫端照這兩份清單先把實體建出來**，再把 `名字 → id` 交回來。
 *
 * 清單寫在這裡而不是散在稿裡，是因為它同時是「這份範例會示範哪些聚合」的宣告：地點只有
 * 兩筆（河堤出現兩場，聚合看得出來），人物三筆（其中一位只有 O.S.，正好示範
 * 「有聲音但沒入鏡」）。
 */
export const DEMO_LOCATION_NAMES = ["河堤", "阿盈家・客廳"] as const;
export const DEMO_CHARACTER_NAMES = ["阿盈", "建鳴", "阿盈的媽"] as const;

/** 名字 → 實體 id。呼叫端建完實體後交進來（`guest/guest-entry.ts`）。 */
export type DemoEntityIds = {
  locations: Readonly<Record<string, string>>;
  characters: Readonly<Record<string, string>>;
};

const action = (text: string): PMNode => kernelSchema.node("action", null, kernelSchema.text(text));

const insertShot = (text: string): PMNode =>
  kernelSchema.node("insertShot", null, kernelSchema.text(text));

const scene = (attrs: Record<string, unknown>, blocks: PMNode[]): PMNode =>
  kernelSchema.node("scene", { sceneId: mintSceneId(), ...attrs }, blocks);

/**
 * 鑄一份新的範例稿。
 *
 * **每次呼叫都鑄新的 `sceneId`** —— 兩個訪客的稿不共用任何識別碼，就跟兩份各自寫出來的稿
 * 一樣。這是「不用共用帳號」那條裁決在 doc 層的對應：共用的東西會互相覆蓋。
 *
 * 走 `toPlainJson` 的理由與 `editor/empty-screenplay.ts` 完全相同（null-prototype attrs
 * 過不了 RSC 邊界），細節見那個檔案。
 */
export function demoScreenplay(entities: DemoEntityIds): Record<string, unknown> {
  const dialogue = (name: string, text: string, voiceStyle = "一般"): PMNode =>
    kernelSchema.node(
      "dialogue",
      // 顯示名與實體名在範例裡一致 —— 漸進揭露是編劇的手段，不是範例該替他先演的東西。
      { character: { id: entities.characters[name] ?? null, displayName: name }, voiceStyle },
      kernelSchema.text(text),
    );

  const at = (name: string) => ({ locationId: entities.locations[name] ?? null, displayName: name });

  return toPlainJson(
    kernelSchema
      .node("doc", null, [
        scene({ time: "夜", intExt: "外景", location: at("河堤") }, [
          action(
            "水泥堤面還留著白天的溫度。阿盈把腳踏車橫倒在草坡上，坐下來，塑膠袋裡的兩瓶啤酒撞出聲音。",
          ),
          action("她沒有回頭，也知道是誰走上來。"),
          dialogue("阿盈", "你遲到十分鐘。"),
          dialogue("建鳴", "我媽在講電話。"),
          action("建鳴在她旁邊坐下，隔著一個人的距離。"),
        ]),

        scene({ time: "夜", intExt: "外景", location: at("河堤") }, [
          action("兩人之間的啤酒瓶已經空了。遠處堤外道路的車燈一輛一輛掃過。"),
          dialogue("阿盈", "我下禮拜就走了。"),
          dialogue("建鳴", "喔。"),
          action("阿盈轉頭看他。"),
          dialogue("阿盈", "你就只有一個「喔」？"),
          insertShot("建鳴放在膝蓋上的手，指節收緊。"),
          dialogue("建鳴", "……你到了再跟我說一聲。"),
        ]),

        scene({ time: "日", intExt: "內景", location: at("阿盈家・客廳") }, [
          action("行李箱攤開在地板上，衣服只裝了一半。"),
          action("阿盈坐在箱子旁邊，手機亮著，訊息停在「我到了」四個字，沒有送出。"),
          dialogue("阿盈的媽", "計程車來了喔！", "O.S."),
          action("她按熄螢幕，把手機塞進口袋。"),
        ]),
      ])
      .toJSON() as Record<string, unknown>,
  );
}
