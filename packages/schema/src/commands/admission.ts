/**
 * **准入判準**與 **edge-boundary 規則**，寫成可檢查的東西（§6.3、
 * [ADR-0007](../../../../docs/adr/0007-document-as-single-authority.md)）。
 *
 * ── 准入判準 ──────────────────────────────────────────────────────────
 * 一個 domain command 要能進來，必須**至少滿足其一**：
 *   (a) 它強制執行了一條 §11 不變式，或
 *   (b) 它以 `sceneId`／實體 id 定址（而非以位置定址）。
 * 兩者皆非的操作**留在編輯器裡當一般 Tiptap command**（`Tab` 排環、`/` 選單過濾、
 * 拖曳落點判定、IME 組字期間選單不動作…）。
 *
 * `COMMAND_CONTRACTS` 把本票券每個 command 對這條判準的滿足方式寫下來；
 * `admission.test.ts` 逐一斷言 `satisfiesAdmission` 為真 —— 日後有人想加一個
 * 「每個 Tiptap command 包一層」的空殼 command，測試會擋。
 *
 * ── edge-boundary 規則 ───────────────────────────────────────────────
 * UI 與 application 層**不得直接依賴編輯器的實作細節** —— transaction、mutation、
 * `history`、以及以**位置**定址的任何東西。凡具 domain／application 意義的操作，
 * 一律透過 command abstraction 執行。**編輯器對外只曝露兩樣東西：commands（寫）
 * 與 projection（讀）。**
 *
 * ⚠️ 這條**不是**「不准用 ProseMirror」—— 編輯器套件**內部**照常直接用 PM API。
 * 規則管的是**跨出編輯器邊界**的線。`dedupeIdsPlugin()` 是唯一跨在邊界上的東西，
 * 它回傳一個 `Plugin` 給編輯器掛載，本身不把 `EditorState`／`Transaction` 這些
 * PM-state 內部型別再匯出去。`edge-boundary.test.ts` 檢查套件 barrel 沒有漏。
 */

/** §11 不變式的編號（總表用 `①`…`⑧` 與 `D`…`I`）。 */
export type InvariantId =
  | "①"
  | "②"
  | "③"
  | "④"
  | "⑤"
  | "⑥"
  | "⑦"
  | "⑧"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "I";

export interface CommandContract {
  readonly name: string;
  /** 這個 command 強制執行的 §11 不變式；空陣列代表「不靠不變式，靠 id 定址准入」。 */
  readonly enforces: readonly InvariantId[];
  /**
   * 是否以 id 定址（而非以位置定址）。
   * `setBlockType` 例：場次以 `sceneId` 定址為 `true`；區塊的 `blockIndex` 是
   * 呼叫當下算出、不被儲存的傳遞參數（§5.2 `fragmentIndex` 先例），不算「位置定址」。
   */
  readonly addressesById: boolean;
  /** 一句話交代它憑什麼准入（給讀 code 的人）。 */
  readonly rationale: string;
}

export function satisfiesAdmission(contract: CommandContract): boolean {
  return contract.enforces.length > 0 || contract.addressesById;
}

export const COMMAND_CONTRACTS: readonly CommandContract[] = [
  {
    name: "createNextScene",
    enforces: ["⑦"],
    addressesById: true,
    rationale: "五個鑄造時刻之一（createScene）；以 afterSceneId 定址，不靠 selection 推算。",
  },
  {
    name: "setBlockType",
    enforces: [],
    addressesById: true,
    rationale: "以 sceneId 定址；blockIndex 是傳遞參數（§5.2 fragmentIndex 先例），非持久化位置引用。",
  },
  {
    name: "moveScene",
    enforces: ["⑦"],
    addressesById: true,
    rationale: "全程保住 sceneId；自己拒絕非法目標（縱深，不靠 UI 落點線）。",
  },
  {
    name: "dedupeSceneIds",
    enforces: ["⑥"],
    addressesById: true,
    rationale: "同一份 doc 內 id 不重複；appendTransaction 最後一道防線，標 addToHistory: false。",
  },
];
