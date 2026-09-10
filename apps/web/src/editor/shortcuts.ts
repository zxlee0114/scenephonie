/**
 * 全部快捷鍵的**單一事實來源**（票券 34 第五輪，使用者要求：「把這些快捷鍵記錄下來」）。
 *
 * 這份表是給人看的說明，不是 keymap —— 真正綁鍵的地方分散在各自負責的模組裡
 * （`extensions/*`、`nodes/*`、`chip-nav`、`chip-caret`、`chip-select`、`field-info`），
 * 因為每一顆鍵的**理由**跟它的實作住在一起才不會走散。這裡只負責把它們攤在同一張紙上。
 *
 * ⚠️ **改了任何一顆鍵，這張表也要改。** 沒有機制強制兩邊一致（keymap 是宣告式字串、node view
 * 那幾顆是手寫的 `event.key` 比對，兩者對不起來），所以靠這行註解與 code review。
 * 與其做一個假的自動同步，不如誠實地說它是手動的。
 *
 * 顯示用的是 macOS 的符號（⌘⌥⇧）—— 這個產品的使用者是編劇，Final Draft 那一輩的工具都這樣寫。
 */

export type Shortcut = {
  /** 按鍵，一顆一格（`["⌘", "Enter"]`）。畫面上會排成 kbd。 */
  readonly keys: readonly string[];
  readonly what: string;
  /** 什麼時候有效 —— 沒有就是「隨時」。 */
  readonly when?: string;
};

export type ShortcutGroup = {
  readonly title: string;
  readonly rows: readonly Shortcut[];
};

export const SHORTCUTS: readonly ShortcutGroup[] = [
  {
    title: "寫作",
    rows: [
      { keys: ["Tab"], what: "換成下一種區塊（動作 → 對白 → 插入畫面）" },
      { keys: ["⇧", "Tab"], what: "換成上一種區塊" },
      { keys: ["Enter"], what: "接著寫下一個區塊" },
      { keys: ["⇧", "Enter"], what: "同一個區塊裡換行" },
      { keys: ["⌘", "Enter"], what: "新增下一場" },
      { keys: ["/"], what: "打開指令選單", when: "在空的區塊開頭" },
      { keys: ["⌘", "A"], what: "漸進式全選：這個區塊 → 這一場 → 整份" },
      { keys: ["⌘", "Z"], what: "還原" },
      { keys: ["⌘", "⇧", "Z"], what: "重做" },
    ],
  },
  {
    title: "內文 ↔ 場次簡表",
    rows: [
      { keys: ["↑"], what: "回本場簡表的最後一格（群演）", when: "在第一個區塊的第一行" },
      { keys: ["←"], what: "同上", when: "在第一個字之前" },
      { keys: ["↓"], what: "到下一場簡表的第一格（內外）", when: "在最後一個區塊的最後一行" },
      { keys: ["→"], what: "同上", when: "在最後一個字之後" },
    ],
  },
  {
    title: "場次簡表（內外／時間／地點／登場人物／群演）",
    rows: [
      { keys: ["↑", "↓", "←", "→"], what: "走到隔壁那一格（簡表是二維的，照版面走）" },
      { keys: ["Enter"], what: "這一格好了，去下一格" },
      { keys: ["Tab"], what: "同上（不看游標在哪）" },
      { keys: ["⌘", "↓"], what: "從任一格直接進本場內文" },
      { keys: ["⌘", "↑"], what: "從任一格直接回上一場內文末端" },
      { keys: ["⌥", "/"], what: "這一格的說明" },
    ],
  },
  {
    title: "內外／時間（下拉）",
    rows: [
      { keys: ["I"], what: "內景（INT.）；再按一次 → 內外景" },
      { keys: ["E"], what: "外景（EXT.）" },
      { keys: ["M"], what: "雜景（MONTAGE）" },
      { keys: ["D"], what: "日（DAY）；再按 → 晨（DAWN）→ 昏（DUSK）" },
      { keys: ["N"], what: "夜（NIGHT）" },
      { keys: ["Space"], what: "打開選單" },
      { keys: ["↓"], what: "同上" },
    ],
  },
  {
    title: "地點／登場人物／群演",
    rows: [
      { keys: ["、"], what: "分隔多個名字（地點欄只有雜景收得下多個）" },
      { keys: ["←"], what: "退進最後一個已定案的名字", when: "輸入框空著時" },
      { keys: ["←", "→"], what: "在已定案的名字之間走；最前面再往左才離開這一格" },
      { keys: ["⌘", "←"], what: "到這一格的最前面" },
      { keys: ["⌘", "→"], what: "到這一格的最後面（輸入框字尾）" },
      { keys: ["Backspace"], what: "把它拿回輸入框重編輯（不是直接刪掉）", when: "選定一個名字時" },
      { keys: ["Esc"], what: "關掉建議選單，打到一半的字留著" },
    ],
  },
  {
    title: "對白",
    rows: [
      { keys: ["Enter"], what: "人物欄打完 → 進台詞（人名與台詞都空著時 → 變回動作）" },
      { keys: ["→"], what: "人物欄 → 台詞的開頭", when: "游標貼著人物欄字尾" },
      { keys: ["↓"], what: "人物欄 → 台詞的末端" },
      { keys: ["↑"], what: "台詞第一行 → 人物欄；人物欄再按一次 → 本場簡表" },
    ],
  },
];

/**
 * 這一下是不是「打開快捷鍵總覽」——**⌘/**（Windows／Linux 上是 Ctrl+/）。
 *
 * 與欄位說明的 ⌥/ 是同一顆實體鍵、不同的修飾鍵：一個問「這一格是什麼」，一個問「有哪些鍵」。
 * 判準以 `code`（實體鍵位）為主，`key` 當備援 —— 同 `field-info` 的 `isHelpKey`。
 */
export function isShortcutOverviewKey(e: {
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  key: string;
  code?: string;
}): boolean {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return false;
  return e.code === "Slash" || e.key === "/" || e.key === "?";
}

/** 給 `aria-keyshortcuts` 用的宣告字串。 */
export const SHORTCUT_OVERVIEW_HINT = "Meta+/ Control+/";
