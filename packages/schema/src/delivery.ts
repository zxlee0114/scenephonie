/**
 * 交付的 payload（票券 17，§4.9、§9.2、ADR-0008）—— **存推導的結果，不存推導的輸入。**
 *
 * 一筆交付是一則承諾：「這份內容，在你之後改稿時仍保持不變。」它凍結的是**內容與語意推導值**
 * （場次號、草稿排除、折返、對剪的歸屬），不是像素。所以這裡吐出的東西：
 *
 * - **沒有場次樹、沒有 doc** —— 存輸入（當時的樹）等於讓編號演算法一改就回頭改寫歷史
 *   （紙上印 `12A`，系統重算成 `12-1`）。
 * - **自己讀得懂** —— 「一筆交付必須能獨立重建它承諾的語意」（§11）：`sc_abc → 12` 單獨讀不出
 *   是哪場戲，所以場次的 metadata 與內文一起進來，實體名也拍下當時的那一個。
 * - **是純 JSON** —— 它直接進 `deliveries.payload`，讀回來不必 hydrate、不必遷移
 *   （交付不在 doc 的遷移鏈上，§10.4）。
 *
 * **草稿不進交付**（§4.8），而且**有一個成員是草稿的群組整組不進**（§9.6：殘缺的對剪比不印更糟）。
 * 場次號**跳號**、不重編 —— 紙上的號碼與編劇畫面上、場次表上的同一個（使用者裁決 2026-10-22）。
 *
 * ⚠️ **不變式 E**：渲染器（票券 18）、凍結分享頁（票券 20）只讀 payload，**不得從 payload 重算
 * 任何語意推導值** —— 場次號、折返該不該印、片段歸誰，全在這裡算完一次。它們能改的只有樣子。
 *
 * 「以下對剪」「回到」「INS」這些**字**仍是模板產物（約束 2）：payload 只記結構事實
 * （`intercut`、`returnTo`、`insertShot`），印成什麼字由渲染器決定。
 *
 * `version` 是 payload 形狀的版本，**不是 doc 的 schema 版本**：交付不被遷移，所以讀取端要靠它
 * 認出舊形狀，自己相容。形狀一改就 +1，舊的那一支讀法不准刪。
 */
import type { Node as ProseMirrorNode } from "prosemirror-model";

import { groupMembers } from "./commands/tree";
import { projectScenes } from "./project-scenes";
import { projectSceneTable, type SceneTableNames, type SceneTableRow } from "./scene-table";
import { extrasLabel } from "./extras";
import { hasOwnContent, sceneLocationLabel } from "./subscenes";
import type { SceneIntExt, SceneTime, VoiceStyle } from "./schema";

export const DELIVERY_PAYLOAD_VERSION = 1;

/** 一筆引用的快照：交付當時的實體名（懸空引用為 `null`）與這一場的顯示名。 */
export interface DeliveredRef {
  name: string | null;
  displayName: string;
}

/** 一個正式場次（主場次、子場次或群組成員）。草稿與殘缺群組不進交付。 */
export interface DeliveredScene {
  sceneId: string;
  /** 交付當時的場次號：`12`／`5.1`。**承諾出去的那個字**，之後永不重算。 */
  label: string;
  /** 子場次的主場次（或成員）；主場次為 `undefined`。 */
  parentSceneId?: string;
  /** 群組成員所屬群組；不是成員為 `undefined`。 */
  groupId?: string;
  intExt: SceneIntExt;
  time: SceneTime;
  locations: DeliveredRef[];
  appearingCharacters: DeliveredRef[];
  /** 群演印好的字（`路人（3）`）。群演沒有實體，沒有名字可以拍。 */
  extras: string;
}

/** 對剪的歸屬標記不夠區別時，要補印的欄位（§9.4：同一套陳設、只差日夜）。 */
export type DisambiguatingField = "intExt" | "time";

/** 閱讀順序上的一個元素。場次標題只記 `sceneId`，metadata 查 `scenes`。 */
export type ScriptElement =
  | { type: "heading"; sceneId: string }
  | { type: "action"; text: string }
  | { type: "dialogue"; speaker: string | null; voiceStyle: VoiceStyle; text: string }
  | { type: "insertShot"; text: string }
  /**
   * 折返：從子場次回到主場次（或成員）自己的內容。`location` 是那一場地點的顯示名（雜景多地點
   * 以頓號串起），**不印場次號**（ADR-0006）。推導規則見 `returnMarkers` —— 這裡多一條：草稿子場次
   * 不進交付，所以它也不算「走開過」。
   */
  | { type: "returnTo"; sceneId: string; location: string | null }
  /** 對剪的宣告（§9.4「先建立、再宣告、再交錯」）：它前面是各成員完整的標題，後面是交錯的片段。 */
  | { type: "intercut"; groupId: string }
  /**
   * 一段片段的開頭與它的歸屬標記（§9.4）：印**地點名、不印場次號**。同群組另一個成員的地點顯示名
   * 相同時，`disambiguateBy` 列出要補印哪幾欄才分得開（與那些成員不同的欄）—— 這是語意推導值，
   * 在這裡算完，渲染器只決定怎麼印。
   */
  | { type: "fragment"; sceneId: string; location: string | null; disambiguateBy: DisambiguatingField[] };

export interface DeliveryPayload {
  version: typeof DELIVERY_PAYLOAD_VERSION;
  /** 正式場次，依文件順序（同場次表的列序）。 */
  scenes: DeliveredScene[];
  /** 閱讀順序的內文。 */
  script: ScriptElement[];
}

/**
 * 把一份 doc 推導成一筆交付的 payload。
 *
 * 場次清單就是場次表第一段的列（`projectSceneTable`，同一次走訪），只多拍下實體名、去掉殘缺群組
 * —— 場次的 metadata 投影只有一份。
 *
 * @param doc 已 hydrate 的 ProseMirror doc 節點。
 * @param names 實體 id → 交付當時的實體名（與場次表第二段同一份查表，加不出新的欄）。
 */
export function projectDelivery(doc: ProseMirrorNode, names: SceneTableNames): DeliveryPayload {
  const scenes = deliveredRows(doc).map((row) => deliveredScene(row, names));
  const formal = new Set(scenes.map((s) => s.sceneId));

  const script: ScriptElement[] = [];
  doc.forEach((node) => {
    if (node.type.name === "sceneGroup") {
      script.push(...intercut(node, formal));
      return;
    }
    if (node.type.name !== "scene") return;
    const sceneId = node.attrs.sceneId as string;
    // 草稿整場不進交付（§4.8）—— 主場次是草稿時它的子場次也在走訪裡連帶成草稿。
    if (!formal.has(sceneId)) return;
    script.push({ type: "heading", sceneId });
    script.push(...content(node, node, formal));
  });

  return { version: DELIVERY_PAYLOAD_VERSION, scenes, script };
}

/**
 * 會進交付的場次：場次表的列（草稿已濾掉），再去掉殘缺群組的成員與它們的子場次。匯出前清單
 * （票券 19）用同一份問「哪些場次會印出來」—— 誰被略過只有這一個答案。不從 `index.ts` 對外曝露。
 */
export function deliveredRows(doc: ProseMirrorNode): SceneTableRow[] {
  const broken = brokenGroups(doc);
  const brokenMembers = new Set<string>();
  doc.forEach((node) => {
    if (node.type.name === "sceneGroup" && broken.has(node.attrs.groupId as string)) {
      for (const m of groupMembers(node)) brokenMembers.add(m.attrs.sceneId as string);
    }
  });
  return projectSceneTable(doc).rows.filter(
    (row) =>
      !(row.groupId && broken.has(row.groupId)) && !(row.parentSceneId && brokenMembers.has(row.parentSceneId)),
  );
}

/** 有任何一個成員是草稿的群組（§9.6）—— 整組不進交付。 */
function brokenGroups(doc: ProseMirrorNode): Set<string> {
  return new Set(
    projectScenes(doc)
      .filter((scene) => scene.groupId && scene.draft)
      .map((scene) => scene.groupId!),
  );
}

function deliveredScene(
  { locations, appearingCharacters, extras, ...row }: SceneTableRow,
  names: SceneTableNames,
): DeliveredScene {
  return {
    ...row,
    locations: locations.map((r) => ({
      name: names.locations.get(r.locationId) ?? null,
      displayName: r.displayName,
    })),
    appearingCharacters: appearingCharacters.map((r) => ({
      name: names.characters.get(r.characterId) ?? null,
      displayName: r.displayName,
    })),
    extras: extrasLabel(extras),
  };
}

/**
 * 一個群組：成員各自的標題 → 對剪 → 片段依文件順序交錯。殘缺的群組（有成員不在 `formal`）
 * 整組不印。
 */
function intercut(group: ProseMirrorNode, formal: ReadonlySet<string>): ScriptElement[] {
  const members = groupMembers(group);
  if (members.some((m) => !formal.has(m.attrs.sceneId as string))) return [];

  const byId = new Map(members.map((m) => [m.attrs.sceneId as string, m]));
  const out: ScriptElement[] = members.map((m) => ({ type: "heading", sceneId: m.attrs.sceneId as string }));
  out.push({ type: "intercut", groupId: group.attrs.groupId as string });
  group.forEach((child) => {
    if (child.type.name !== "groupFragment") return;
    const member = byId.get(child.attrs.memberId as string);
    if (!member) return;
    out.push({
      type: "fragment",
      sceneId: member.attrs.sceneId as string,
      location: sceneLocationLabel(member),
      disambiguateBy: disambiguateBy(member, members),
    });
    out.push(...content(child, member, formal));
  });
  return out;
}

/**
 * 同群組裡地點顯示名與 `member` 相同的其他成員，跟它在哪幾欄不同 —— 那幾欄就是歸屬標記要補印的。
 * 沒有同名的成員就是空的（地點名已經分得開）。
 */
function disambiguateBy(member: ProseMirrorNode, members: readonly ProseMirrorNode[]): DisambiguatingField[] {
  const location = sceneLocationLabel(member);
  const twins = members.filter((m) => m !== member && sceneLocationLabel(m) === location);
  const fields: DisambiguatingField[] = ["intExt", "time"];
  return fields.filter((field) => twins.some((twin) => twin.attrs[field] !== member.attrs[field]));
}

/**
 * 一個容器（主場次或片段）的內文：區塊、正式子場次（標題＋它的區塊）、折返。
 *
 * 折返的判準與 `returnMarkers` 同一條（`hasOwnContent`：空區塊不算內容；兩個子場次相鄰不印），
 * 但走的是**交付看得到的那一份**：草稿子場次不在，所以它前後的主場次內容是連著的。
 *
 * @param owner 折返回到的那一場（片段的是它所屬的成員）—— 地點從它取。
 */
function content(container: ProseMirrorNode, owner: ProseMirrorNode, formal: ReadonlySet<string>): ScriptElement[] {
  const out: ScriptElement[] = [];
  let away = false; // 上一段非空主場次內容之後，是否走進過（交付裡的）子場次
  container.forEach((child) => {
    if (child.type.name === "subscene") {
      const sceneId = child.attrs.sceneId as string;
      if (!formal.has(sceneId)) return;
      out.push({ type: "heading", sceneId });
      child.forEach((b) => {
        const element = blockElement(b);
        if (element) out.push(element);
      });
      away = true;
      return;
    }
    if (!hasOwnContent(child)) return;
    if (away) {
      out.push({ type: "returnTo", sceneId: owner.attrs.sceneId as string, location: sceneLocationLabel(owner) });
      away = false;
    }
    const element = blockElement(child);
    if (element) out.push(element);
  });
  return out;
}

/** 一個區塊的元素。**空區塊不算內容**（§9.4，只有空白也是空）。 */
function blockElement(node: ProseMirrorNode): ScriptElement | null {
  const text = node.textContent;
  if (text.trim() === "") return null;
  switch (node.type.name) {
    case "action":
      return { type: "action", text };
    case "insertShot":
      return { type: "insertShot", text };
    case "dialogue": {
      const character = node.attrs.character as { displayName: string } | null;
      return {
        type: "dialogue",
        speaker: character?.displayName ?? null,
        voiceStyle: node.attrs.voiceStyle as VoiceStyle,
        text,
      };
    }
    default:
      return null;
  }
}
