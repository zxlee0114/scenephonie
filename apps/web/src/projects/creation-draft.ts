/**
 * 建立精靈的本機草稿（票券 71）。
 *
 * 精靈走完之前資料庫裡什麼都沒有 —— 中途離開（取消、關掉彈窗、重新整理、關分頁、當機）留下的只有
 * 這一份，下次按「建立專案」時問要不要接著做。所以它是**隨打隨存**，不是離開時才存：
 * `beforeunload` 擋得住關分頁，擋不住當機、沒電、被系統回收。
 *
 * 只存在這台瀏覽器（localStorage），**一個使用者一格**（key 帶 `usr_` id）—— 同一台電腦換帳號或
 * 用訪客身分進來，看不到別人的。專案還不存在，沒有專案 id 可以當 key；同一時間也只會有一個精靈開著。
 *
 * 讀寫都可能丟例外（網站資料被封鎖、配額滿）。讀不到就當沒有草稿；**寫不進去要回報**，
 * 精靈因此知道「現在關掉就真的會丟」，那時才需要問一句（票券 71 第 9 條）。
 */
import { emptyDocument, mintId } from "@scenephonie/schema";

import type { PersistedDoc } from "@/persistence";

/** 第二步的兩個頁籤。 */
export type OutlineTab = "交件大綱" | "分場大綱";

export type CreationDraft = {
  /** 建立鍵（冪等）：這份草稿最後送出時帶上，連點或另一個分頁再按一次都只建一個。 */
  creationId: string;
  projectTitle: string;
  screenplayTitle: string;
  /** 「與專案名稱相同」勾著沒 —— 只活在精靈裡，建好之後兩個名稱各自獨立。 */
  sameName: boolean;
  submissionOutline: PersistedDoc;
  sceneOutline: PersistedDoc;
  /** 停在哪一步、哪個頁籤 —— 接著做時回到這裡。 */
  step: 1 | 2 | 3;
  tab: OutlineTab;
};

/** 讀回來的草稿多一個「什麼時候存的」，還原提示說「X 分鐘前」用。 */
export type SavedCreationDraft = CreationDraft & { savedAt: number };

const CREATION_ID_PREFIX = "cr_";

export function blankCreationDraft(): CreationDraft {
  return {
    creationId: mintId(CREATION_ID_PREFIX),
    projectTitle: "",
    screenplayTitle: "",
    sameName: false,
    submissionOutline: emptyDocument(),
    sceneOutline: emptyDocument(),
    step: 1,
    tab: "交件大綱",
  };
}

export type CreationDraftStore = {
  load: () => SavedCreationDraft | null;
  /** @returns 這份草稿現在是不是**不會丟**：存進去了，或根本沒有東西可丟。 */
  save: (draft: CreationDraft) => boolean;
  clear: () => void;
};

export function creationDraftStore(userId: string): CreationDraftStore {
  const key = `scenephonie:creation-draft:${userId}`;

  const clear = () => {
    try {
      localStorage.removeItem(key);
    } catch {
      // 拿不掉就算了：下次讀到時還會問一次，選「重新開始」就好。
    }
  };

  return {
    load() {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        return isSavedDraft(parsed) ? parsed : null;
      } catch {
        return null;
      }
    },
    save(draft) {
      if (isBlank(draft)) {
        clear();
        return true;
      }
      try {
        localStorage.setItem(key, JSON.stringify({ ...draft, savedAt: Date.now() } satisfies SavedCreationDraft));
        return true;
      } catch {
        return false;
      }
    },
    clear,
  };
}

/** 四樣（兩個名稱、兩份大綱）都沒有字 —— 沒有東西可丟。 */
function isBlank(draft: CreationDraft): boolean {
  return (
    !draft.projectTitle.trim() &&
    !draft.screenplayTitle.trim() &&
    !hasText(draft.submissionOutline) &&
    !hasText(draft.sceneOutline)
  );
}

function hasText(node: unknown): boolean {
  if (typeof node !== "object" || node === null) return false;
  const { text, content } = node as { text?: unknown; content?: unknown };
  if (typeof text === "string") return text.trim() !== "";
  return Array.isArray(content) && content.some(hasText);
}

/** 讀到的東西是不是這一版存的形狀 —— 別的版本、別的程式寫進來的就當沒有。 */
function isSavedDraft(value: unknown): value is SavedCreationDraft {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as Record<string, unknown>;
  return (
    typeof draft.creationId === "string" &&
    typeof draft.projectTitle === "string" &&
    typeof draft.screenplayTitle === "string" &&
    typeof draft.sameName === "boolean" &&
    typeof draft.submissionOutline === "object" &&
    draft.submissionOutline !== null &&
    typeof draft.sceneOutline === "object" &&
    draft.sceneOutline !== null &&
    (draft.step === 1 || draft.step === 2 || draft.step === 3) &&
    (draft.tab === "交件大綱" || draft.tab === "分場大綱") &&
    typeof draft.savedAt === "number"
  );
}
