/**
 * 登場人物**提示**的觸發條件（§4.7、票券 10）。
 *
 * > 某人物在本場有**一般**發聲方式的對白，且不在本場的登場人物欄。
 *
 * ⚠️ **這是提示，不是推導。** 推導替編劇做決定，提示只指出落差、決定權仍在他手上 ——
 * 登場人物的判準是**入鏡**，不是有沒有台詞，所以這裡只回答「該不該問他」，從來不寫 doc。
 * 寫入是編劇按下選單之後的兩支 command（`addAppearingCharacter`／`dismissAppearingPrompt`）。
 *
 * 收斂條件：
 *   - 標了 V.O./O.S. 的**絕不提示** —— 編劇已經明確宣告那個人不入鏡；
 *   - 反方向（在登場人物欄但沒台詞）也不提示 —— 那太正常了；
 *   - 這一場選過「不新增」的人（`dismissedCharacterIds`）不再提示；
 *   - 只問**人物**：群演不是人物（登場人物欄不收群演），沒有 id 的過渡引用沒有實體可加。
 */
import type { Node as ProseMirrorNode } from "prosemirror-model";

import { dialogueCharacters, isCharacterId, sceneAppearingCharacters } from "./entities";
import type { DialogueCharacterRef, VoiceStyle } from "./schema";

/** 唯一會觸發提示的發聲方式 —— 聲音來自畫面內，人在鏡頭裡說話。 */
const ON_SCREEN: VoiceStyle = "一般";

/**
 * 場次 `dismissedCharacterIds` attr 的讀取正規化。容忍壞形狀（§6.6）：讀歪了頂多多問一次，
 * 不該讓整個提示壞掉。
 */
export function sceneDismissedCharacterIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}

/**
 * 場次第 `blockIndex` 個區塊的說話者裡，**該被問一句**的那幾位（依欄位順序、不重複）。
 *
 * 只看被問的那一句，不掃整場：提示在編劇**離開一句對白**的那一刻出現，錨在那一句的人物欄下
 * —— 問的是他剛寫完的那個人。同一個人在別句也有台詞，離開那一句時會再被問（ESC 不記錄判斷）。
 */
export function unlistedSpeakers(scene: ProseMirrorNode, blockIndex: number): DialogueCharacterRef[] {
  if (blockIndex < 0 || blockIndex >= scene.childCount) return [];
  const block = scene.child(blockIndex);
  if (block.type.name !== "dialogue" || block.attrs.voiceStyle !== ON_SCREEN) return [];

  const listed = new Set(sceneAppearingCharacters(scene.attrs.appearingCharacters).map((r) => r.characterId));
  const dismissed = new Set(sceneDismissedCharacterIds(scene.attrs.dismissedCharacterIds));

  const found: DialogueCharacterRef[] = [];
  for (const ref of dialogueCharacters(block.attrs.character)) {
    if (!isCharacterId(ref.id) || listed.has(ref.id) || dismissed.has(ref.id)) continue;
    if (found.some((r) => r.id === ref.id)) continue;
    found.push({ id: ref.id, displayName: ref.displayName });
  }
  return found;
}
