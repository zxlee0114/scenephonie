import type { DocumentKind } from "@scenephonie/schema";

/**
 * 每個 kind 在畫面上的名字（票券 21，2026-10-24 使用者裁決）。
 *
 * kind 是領域詞彙、會被持久化；畫面上用編劇最熟的叫法。交件大綱在畫面上叫「故事大綱」——
 * 各簡章叫它劇情大綱或故事大綱，CONTEXT 因此不拿任何一個當術語，但標籤總得選一個給人看。
 * 自由文件的名字是編劇給的；這裡是它還沒命名時顯示的那個。
 */
const LABELS: Record<DocumentKind, string> = {
  交件大綱: "故事大綱",
  分場大綱: "分場大綱",
  自由文件: "未命名文件",
};

export function documentLabel(kind: DocumentKind): string {
  return LABELS[kind];
}
