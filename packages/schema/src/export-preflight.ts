/**
 * 匯出前防呆（票券 19，§9.6）—— **「這份 PDF 會少掉這幾場」**，不是「要不要輸出這一場」：草稿本來就
 * 不輸出，這裡只把它說出來。
 *
 * 靜默地少印幾場，對一個要拿去投劇本獎的人是最糟的失敗模式；所以「不再提醒」只讓那一場在清單裡收起來，
 * **照樣算進 `skipped`** —— 匯出完成後那一行「本次略過 N 場草稿」讀的就是它。
 *
 * 判定全部來自 `projectScenes` 那一次走訪（§6.4：PDF、場次表、匯出前清單共用同一次走訪）——
 * 這裡不重判誰是草稿，只把走訪記下的理由翻成清單。
 */
import type { Node as ProseMirrorNode } from "prosemirror-model";

import { unlistedSpeakers } from "./appearing-prompt";
import { deliveredRows } from "./delivery";
import { dialogueCharacters } from "./entities";
import { type DraftReason, sceneEntries } from "./project-scenes";

/** 清單上的一筆：會被略過的草稿。 */
export interface SkippedDraft {
  /** 「不再提醒」記這個，不記標籤 —— 標籤是推導的，拖一下就換了。 */
  sceneId: string;
  /** `S11[D1]` —— 只負責讓人在清單裡看懂是哪一場。 */
  label: string;
  /** 內容的第一行（草稿常常正是 metadata 沒填的那些，標籤是個空號，首行才是他認得的）。沒有內文是 `""`。 */
  excerpt: string;
  /** 為什麼是草稿，依走訪記下的順序。 */
  reasons: DraftReason[];
  /** 編劇設成「之後不再提醒」過 —— 面板把它收進可展開的那一區（可以恢復），照樣不印。 */
  dismissed: boolean;
  /**
   * 這場是對剪群組的成員 —— 它一缺，整組印不出來（殘缺的對剪比不印更糟）。`groupMates` 是同組
   * 本身不是草稿、卻要跟著被略過的場次標籤，讓編劇看見略過它的後果比表面上大。
   */
  group?: { groupMates: string[] };
}

/**
 * 登場人物提示的清單版（§4.7）：這一場有一般發聲的對白、卻不在登場人物欄的人。**提醒但不阻擋** ——
 * 它可能是正確狀態（聲音入鏡、人沒入鏡），拿去攔匯出是製造假警報。
 */
export interface AppearingReminder {
  sceneId: string;
  /** 正式場次號（只看會印出來的場次）。 */
  label: string;
  /** 台詞上的顯示名，依第一次說話的順序、不重複。 */
  speakers: string[];
}

/**
 * 這次匯出實際會少掉幾場 —— **含「不再提醒」過的**。`drafts` 是草稿場數；`groupMates` 是本身
 * 不是草稿、但因為同組有草稿成員而整組一起印不出來的場次。
 */
export interface SkippedCount {
  drafts: number;
  groupMates: number;
}

export interface ExportPreflight {
  /** 會被略過的草稿（含「不再提醒」過的，標 `dismissed`），依文件順序。 */
  drafts: SkippedDraft[];
  /** 這次匯出實際會少掉幾場（印好之後那一行讀它）。 */
  skipped: SkippedCount;
  /** 登場人物提示，依文件順序；與草稿分開。 */
  appearing: AppearingReminder[];
}

/** 摘錄最多幾個字；超過以「……」收尾。 */
const EXCERPT_LENGTH = 20;

export function exportPreflight(doc: ProseMirrorNode): ExportPreflight {
  const entries = sceneEntries(doc);
  const printed = new Set(deliveredRows(doc).map((row) => row.sceneId));
  const fragments = fragmentsByMember(doc);
  /** 本身不是草稿、但不會印出來的 —— 只有殘缺群組裡的場次會這樣。 */
  const stranded = entries.filter(
    (e) => !e.scene.draft && !printed.has(e.scene.sceneId),
  );
  /** 成員 `sceneId` → 群組；成員的子場次跟著它的成員走。 */
  const memberGroup = new Map(
    entries.flatMap((e) =>
      e.scene.groupId ? [[e.scene.sceneId, e.scene.groupId]] : [],
    ),
  );
  const groupOf = ({ scene }: (typeof entries)[number]) =>
    scene.groupId ??
    (scene.parentSceneId ? memberGroup.get(scene.parentSceneId) : undefined);

  const drafts = entries.filter((entry) => entry.scene.draft);
  return {
    drafts: drafts.map(({ scene, node, reasons }) => ({
      sceneId: scene.sceneId,
      label: scene.label,
      excerpt: excerptOf(fragments.get(scene.sceneId) ?? [node]),
      reasons: [...reasons],
      dismissed: node.attrs.draftReminderDismissed === true,
      ...(scene.groupId
        ? {
            group: {
              groupMates: stranded
                .filter((e) => groupOf(e) === scene.groupId)
                .map((e) => e.scene.label),
            },
          }
        : {}),
    })),
    skipped: { drafts: drafts.length, groupMates: stranded.length },
    appearing: entries.flatMap(({ scene, node }) => {
      if (!printed.has(scene.sceneId)) return [];
      const speakers = unlistedIn(node, fragments.get(scene.sceneId) ?? [node]);
      return speakers.length > 0
        ? [{ sceneId: scene.sceneId, label: scene.label, speakers }]
        : [];
    }),
  };
}

/**
 * 一場的內文裡該被問一句的說話者 —— 逐句問 `unlistedSpeakers`（編輯器裡 Enter 那一刻問的同一支），
 * 子場次不算（它是另一場，自己的登場人物欄）。
 */
function unlistedIn(
  scene: ProseMirrorNode,
  containers: readonly ProseMirrorNode[],
): string[] {
  const seen = new Map<string, string>();
  for (const container of containers) {
    for (let i = 0; i < container.childCount; i++) {
      for (const ref of unlistedSpeakers(scene, i, container)) {
        if (!seen.has(ref.id)) seen.set(ref.id, ref.displayName);
      }
    }
  }
  return [...seen.values()];
}

/** 群組成員的內文住在片段裡（票券 12）：成員 `sceneId` → 它的片段，依文件順序。 */
function fragmentsByMember(
  doc: ProseMirrorNode,
): Map<string, ProseMirrorNode[]> {
  const out = new Map<string, ProseMirrorNode[]>();
  doc.forEach((node) => {
    if (node.type.name !== "sceneGroup") return;
    node.forEach((child) => {
      if (child.type.name !== "groupFragment") return;
      const memberId = child.attrs.memberId as string;
      out.set(memberId, [...(out.get(memberId) ?? []), child]);
    });
  });
  return out;
}

/** `containers` 裡第一個有字的區塊的第一行（子場次不算 —— 它有自己的內文）。 */
function excerptOf(containers: readonly ProseMirrorNode[]): string {
  for (const container of containers) {
    for (let i = 0; i < container.childCount; i++) {
      const child = container.child(i);
      if (child.type.name === "subscene") continue;
      const line = child.textContent.split("\n").find((l) => l.trim() !== "");
      if (line) return clip(`${speakerOf(child)}${line.trim()}`);
    }
  }
  return "";
}

/** 對白照紙上的樣子（行內式，§9.4）：`小明：`。沒有說話者、或不是對白，就是空的。 */
function speakerOf(block: ProseMirrorNode): string {
  if (block.type.name !== "dialogue") return "";
  const names = dialogueCharacters(block.attrs.character).map(
    (ref) => ref.displayName,
  );
  return names.length > 0 ? `${names.join("、")}：` : "";
}

function clip(text: string): string {
  const chars = [...text];
  return chars.length > EXCERPT_LENGTH
    ? `${chars.slice(0, EXCERPT_LENGTH).join("")}……`
    : text;
}
