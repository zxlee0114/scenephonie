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
 * ## 這份稿只用今天真的存在的東西
 *
 * `location` 與 `dialogue.character` 只填 `displayName`、id 留 null，因為人物與地點實體是
 * 票券 08 的事 —— **形狀已經是 kernel 的 `LocationRef`／`DialogueCharacterRef`**，與現在
 * 使用者自己打字打出來的一模一樣（見 `editor/nodes/scene.tsx`、`editor/nodes/blocks.tsx`）。
 * 憑空鑄一組 `lo_`／`ch_` 會是**指向不存在實體的引用**，票券 08 一來就是一批待清的髒資料。
 *
 * `appearingCharacters` 同理留 null（它的形狀 `CharacterRef` 要求真的 `characterId`）：
 * null ＝ 尚未填，正是一份真實的稿在這個階段的樣子。
 */

/** 訪客那個專案的名字。**看得出是範例**，不假裝是使用者自己的作品。 */
export const DEMO_PROJECT_TITLE = "範例：河堤上的十分鐘";

const action = (text: string): PMNode => kernelSchema.node("action", null, kernelSchema.text(text));

const dialogue = (displayName: string, text: string, voiceStyle = "一般"): PMNode =>
  kernelSchema.node(
    "dialogue",
    { character: { id: null, displayName }, voiceStyle },
    kernelSchema.text(text),
  );

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
export function demoScreenplay(): Record<string, unknown> {
  return toPlainJson(
    kernelSchema
      .node("doc", null, [
        scene({ time: "夜", intExt: "外景", location: { locationId: null, displayName: "河堤" } }, [
          action(
            "水泥堤面還留著白天的溫度。阿盈把腳踏車橫倒在草坡上，坐下來，塑膠袋裡的兩瓶啤酒撞出聲音。",
          ),
          action("她沒有回頭，也知道是誰走上來。"),
          dialogue("阿盈", "你遲到十分鐘。"),
          dialogue("建鳴", "我媽在講電話。"),
          action("建鳴在她旁邊坐下，隔著一個人的距離。"),
        ]),

        scene({ time: "夜", intExt: "外景", location: { locationId: null, displayName: "河堤" } }, [
          action("兩人之間的啤酒瓶已經空了。遠處堤外道路的車燈一輛一輛掃過。"),
          dialogue("阿盈", "我下禮拜就走了。"),
          dialogue("建鳴", "喔。"),
          action("阿盈轉頭看他。"),
          dialogue("阿盈", "你就只有一個「喔」？"),
          insertShot("建鳴放在膝蓋上的手，指節收緊。"),
          dialogue("建鳴", "……你到了再跟我說一聲。"),
        ]),

        scene(
          { time: "日", intExt: "內景", location: { locationId: null, displayName: "阿盈家・客廳" } },
          [
            action("行李箱攤開在地板上，衣服只裝了一半。"),
            action("阿盈坐在箱子旁邊，手機亮著，訊息停在「我到了」四個字，沒有送出。"),
            dialogue("阿盈的媽", "計程車來了喔！", "O.S."),
            action("她按熄螢幕，把手機塞進口袋。"),
          ],
        ),
      ])
      .toJSON() as Record<string, unknown>,
  );
}
