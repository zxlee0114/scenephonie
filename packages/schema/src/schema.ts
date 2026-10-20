/**
 * 場次序列的 canonical node spec（規格 §5）。
 *
 * **這一半不含任何瀏覽器相依**（§5.5）——沒有 `toDOM`／`parseDOM`，那是 node view 的事，
 * 住在 `apps/web` 的編輯器套件裡。這個模組要能在 Node 跑（PDF 匯出、場次表推導、
 * 伺服器端 command），也要能原封不動餵給日後的 `y-prosemirror`（票券 19 已驗證往返等價）。
 *
 * **範圍**：`doc`、`scene`、`subscene`（票券 11）、場次群組 `sceneGroup`／`groupMember`／
 * `groupFragment`（票券 12）、`sceneBlock`（`action`／`dialogue`／`insertShot`）。
 * `subscene` 的 `kind`（`插入｜接續`）比照 `voiceStyle` 走「不允許 null」，但**無 default、
 * 建立時必填**（它是編劇按下哪個入口的宣告，系統不代填）。
 *
 * ── 詞彙 ↔ 識別碼對照（票券 23）────────────────────────────────────────
 * 程式碼識別碼用英文小駝峰，領域詞彙（`CONTEXT.md` 詞條）維持中文，兩邊靠這張表對接。
 * **只有鍵／識別碼羅馬化；欄位「值」（`日｜夜…`、`內景｜外景…`、`一般｜V.O.…`）是領域資料、
 * 會被持久化、輸出照印，維持中文。**
 *
 * | 詞彙 | 識別碼 | | 詞彙 | 識別碼 |
 * |---|---|---|---|---|
 * | 時間（順場表「光」） | `time` | | 人物（`dialogue` attr） | `character` |
 * | 內外（順場表「景」） | `intExt` | | 顯示名（引用上的名字） | `displayName` |
 * | 地點 | `location` | | 描述（群演） | `description` |
 * | 登場人物（判準：入鏡） | `appearingCharacters` | | 人數（群演） | `countValue` |
 * | 群演 | `extras` | | 種類（子場次，票券 11） | `kind` |
 * | 發聲方式 | `voiceStyle` | | | |
 */
import { Schema } from "prosemirror-model";

import type { CountValue } from "./count";

/** `time` 欄位（時間，業界順場表稱「光」）的合法值。可為 null —— null ＝ 尚未填。 */
export const TIME_VALUES = ["日", "夜", "晨", "昏"] as const;
export type SceneTime = (typeof TIME_VALUES)[number];

/** `intExt` 欄位（內外，業界順場表稱「景」）的合法值。`雜景` 是逃生口：宣告「橫跨多個未指定地點」。 */
export const INT_EXT_VALUES = ["內景", "外景", "內外景", "雜景"] as const;
export type SceneIntExt = (typeof INT_EXT_VALUES)[number];

/**
 * 逃生口本身。**「這一場的地點欄能有幾個值」是內外的函式**，而問這個問題的地方不只一個
 * （command 要拒絕、UI 要決定頓號算不算分隔符），所以判準只留一個定義點。
 */
export const MONTAGE: SceneIntExt = "雜景";

/** `voiceStyle`（發聲方式）的三個值。**不允許 null**，`default: '一般'`（§5.3）。輸出渲染為 `小明（V.O.）`。 */
export const VOICE_VALUES = ["一般", "V.O.", "O.S."] as const;
export type VoiceStyle = (typeof VOICE_VALUES)[number];

/**
 * `subscene` 的 `kind`（種類，§4.4、ADR-0006）。**編劇的宣告**：按下 `/insert` 就是插入、
 * `/continue-to` 就是接續。兩種只有語意分岔，結構完全共用。
 */
export const SUBSCENE_KINDS = ["插入", "接續"] as const;
export type SubsceneKind = (typeof SUBSCENE_KINDS)[number];

/** 場次 `location` 欄的引用形狀：實體 id ＋ 這一場顯示的名字（漸進揭露，§4.7）。 */
export interface LocationRef {
  locationId: string;
  displayName: string;
}

/** 場次 `appearingCharacters` 欄的引用形狀。判準是入鏡，不是有沒有台詞。 */
export interface CharacterRef {
  characterId: string;
  displayName: string;
}

/**
 * 場次 `extras` 欄的形狀（群演）。場次限定實體，id 只在該場次內有意義。
 *
 * **人數就是四種樣子**（確切／區間／下限／若干，見 `./count`）—— expand–contract 收在票券 50：
 * 舊的 `count: number` 已經刪掉，`countValue` 是**唯一的形態**，而且**必填**。它自己沒有可選
 * 欄位，因為 attr 不允許 undefined（§6.6）。
 *
 * ⚠️ 別再加一個「方便的數字」回來。`路人（3-5）` 的那個數字只能是下限、`路人（若干）` 的只能
 * 憑空編一個 1 —— 那個會說謊的欄位正是票券 41／44 拆掉的東西。要排序或比大小走
 * `countLowerBound`，它在「若干」上誠實地回 `null`，而不是替系統宣告一個人數。
 */
export interface ExtraRef {
  extraId: string;
  description: string;
  countValue: CountValue;
}

/** `dialogue` 節點 `character` attr 的引用形狀（§5.1：`{ id, displayName }`）。合法目標是人物或本場次的群演。 */
export interface DialogueCharacterRef {
  id: string;
  displayName: string;
}

/**
 * null 鐵律（§5.3）：**任何可能裝 `null` 的 attr，schema 預設值必須也是 `null`。**
 *
 * 這不是風格。票券 19 的探針實測：`y-prosemirror` 不儲存 null attr，回程一律由 schema
 * 預設值填補。若某個常態裝 null 的欄位 `default` 不是 null，往返後會被**靜默改寫**——
 * 遷移不報錯，只是改掉編劇的稿。
 *
 * 於是每個「可為 null」的 attr 都 `default: null`；不想要 null 語意的欄位則**不允許 null**
 * （給 `default` 且值非 null）——「要嘛預設 null、要嘛不允許 null，不要兩者兼有」。
 *
 * 這個名單是 `scene` 上 default 必須為 null 的 attr（`dialogue.character` 同規則，但在
 * dialogue 節點上，另外處理）。
 */
export const nullableSceneAttrNames = ["time", "intExt", "location", "appearingCharacters"] as const;

/**
 * 列舉欄位的驗證器。ProseMirror 只在 `check()` / `Node.fromJSON` 呼叫它（載入／
 * y-prosemirror 往返路徑），不在 `create()` 呼叫——那正好對上威脅模型：被持久化或
 * 遷移過的稿，違規值在載入時被攔。建立節點時的把關由 command 層負責（票券 03）。
 *
 * `nullable` 決定 `null` 是否放行——就是 §5.3「要嘛預設 null、要嘛不允許 null」的
 * 開關：`time`／`intExt` 為 true，`voiceStyle` 為 false。
 *
 * `label` 只進錯誤訊息，刻意用領域詞（中文）——診斷文字給人讀，不是識別碼。
 */
function enumValidator(label: string, values: readonly string[], { nullable }: { nullable: boolean }) {
  return (value: unknown): void => {
    if (nullable && value === null) return;
    if (typeof value !== "string" || !values.includes(value)) {
      const allowed = nullable ? `${values.join("／")} 或 null` : values.join("／");
      throw new RangeError(`${label} 只能是 ${allowed}，收到 ${JSON.stringify(value)}`);
    }
  };
}

/**
 * 場次與子場次共用的 metadata attr（§5.1：`subscene` 的 attrs「同 `scene` ＋ `kind`」）。
 *
 * 每次呼叫回一份新的物件 —— 兩個節點型別不共用同一份 spec 物件（default 的陣列也不共用）。
 */
function sceneMetaAttrs() {
  return {
    // 建立時必填、無 default —— 少了 default 就是「建立節點時必須鑄造」的強制版本
    // （`Node.fromJSON` 少了這個 attr 會直接 throw）。鑄造見 ./ids 的 mintSceneId()。
    sceneId: {},
    // 可為 null（§5.3）：空 metadata → 自動草稿，是草稿防呆的地基。default 也是 null。
    // time（時間）／intExt（內外）是封閉列舉（§4.3），驗證器放行 null 與列舉值、擋掉其餘。
    time: { default: null, validate: enumValidator("時間", TIME_VALUES, { nullable: true }) },
    intExt: { default: null, validate: enumValidator("內外", INT_EXT_VALUES, { nullable: true }) },
    // location（地點）／appearingCharacters（登場人物）是實體引用（物件／陣列），
    // 形狀由 command 層與 TS 型別把關，不做字串列舉驗證。
    location: { default: null },
    appearingCharacters: { default: null },
    // 不允許 null：空陣列就是「沒有」，不需要「未填 vs 空」的區別（不參與草稿完整性判定）。
    extras: { default: [] as ExtraRef[] },
    dismissedCharacterIds: { default: [] as string[] },
    // 不允許 null，default false（§5.3）。手動標記為草稿；不存狀態機。
    manualDraft: { default: false, validate: "boolean" },
  };
}

/**
 * canonical 場次 schema。
 *
 * 內容規則：
 * ```
 * doc           := (scene | sceneGroup)*        （§5.1 意圖 +，見下方註解）
 * scene         := (sceneBlock | subscene)+     isolating, defining
 * subscene      := sceneBlock+                  isolating, defining（不含 subscene → 深度兩層）
 * sceneGroup    := groupMember* groupFragment*  isolating, defining（§5.1 意圖 +，見下方註解）
 * groupMember   := （無內容）                    atom
 * groupFragment := (sceneBlock | subscene)+     isolating, defining（不含 sceneGroup → 不能巢狀）
 * sceneBlock := action | dialogue | insertShot   （group，不是節點）
 * action / dialogue / insertShot := inline*
 * ```
 *
 * `scene`／`subscene` 都是 `isolating`（跨場次的鍵盤選取／刪除不會把兩場合併，`sceneId` 錨點隨之
 * 消失）也是 `defining`（貼上時保留自己的結構）。marks 全關 —— 約束 2，資料模型不含
 * 呈現性資訊（無粗體／斜體／刪除線）。
 */
export const schema = new Schema({
  nodes: {
    doc: {
      // §5.1 的意圖是 `scene+`，但 `scene` 的 `sceneId` 無 default（見下），對 ProseMirror
      // 而言就是「非 generatable」——放在必填位置（`scene+`）會讓 schema 建構直接失敗
      // （dead-end 檢查）。放寬成 `scene*`：schema 層允許空 doc，「劇本至少有一場」是
      // 編輯器初始化／command 層的責任（票券 03／04），不是 schema 能表達的不變式。
      // 票券 12 放寬成 `(scene | sceneGroup)` —— 群組只是一群場次的容器，沒有自己的可編輯空間。
      content: "(scene | sceneGroup)*",
    },

    scene: {
      // §5.1：主場次的內容是區塊與子場次交錯。「子場次不能是第一個孩子」（不變式 ①）**不寫進
      // 這裡** —— 空區塊不算內容，那條線 schema 表達不了，由 command 守（`createSubscene`）。
      content: "(sceneBlock | subscene)+",
      isolating: true,
      defining: true,
      attrs: sceneMetaAttrs(),
    },

    // 子場次（票券 11、ADR-0003／0006）。**內容規則不含 `subscene`** —— 深度固定兩層（不變式 ⑤）
    // 由這一行直接保證，不是執行期檢查。它也因此是場次內容型別的子集（ADR-0006 保護規則 4），
    // 日後攤平成重疊群組時是搬移而不是轉換。
    subscene: {
      content: "sceneBlock+",
      isolating: true,
      defining: true,
      attrs: {
        ...sceneMetaAttrs(),
        // 不允許 null、**無 default**、建立時必填（§5.3）—— 少了它 `Node.fromJSON` 直接 throw，
        // 與 `sceneId` 同一個「建立時必須給」的強制版本。系統不代填：那一欄的全部價值就在於
        // 它是編劇的宣告。
        kind: { validate: enumValidator("種類", SUBSCENE_KINDS, { nullable: false }) },
      },
    },

    // 場次群組（票券 12、ADR-0004、§5.2）。**是節點不是旗標** —— 「群組不能巢狀」與「一個場次
    // 不能同時屬於兩個群組」（不變式 ④）由樹結構免費保證：成員只住在唯一一個群組節點裡，片段的
    // 內容規則不含 `sceneGroup`。
    //
    // §5.1 意圖 `groupMember+ groupFragment+`，但兩者都帶無 default 的 id attr（非 generatable），
    // 放在必填位置會讓 schema 建構失敗（與 `doc` 同一顆雷）。放寬成 `*`：「至少兩個成員、至少
    // 一個片段」是 command 層的責任（`intercutTo`／`deleteScene`）。
    sceneGroup: {
      content: "groupMember* groupFragment*",
      isolating: true,
      defining: true,
      attrs: {
        // `gr_` 前綴 nanoid，使用者永遠看不到。群組要 id 是因為 command 要定址它而不能用位置
        // （§6.3 准入判準）；無 default ＝ 建立時必須鑄造，同 `sceneId`。
        groupId: {},
      },
    },

    // 成員場次（§5.2）：普通的場次 —— 完整的 metadata、自己的永久 id、自己一個頂層場次號 ——
    // 但**沒有自己的內容**（內容在片段裡）。這是真實的結構差異，所以是另一種節點，而不是把
    // `scene` 的內容規則放寬成可為空。
    groupMember: {
      atom: true,
      attrs: sceneMetaAttrs(),
    },

    // 片段（§4.5）：閱讀的單位。**沒有 id、不給任何東西引用**（ADR-0006 保護規則 3）——
    // 片段會被切開（插入子場次、`⌘+N` 從游標切開），一個會被切開的東西沒有身分可言。
    // 成員可以有自己的子場次（階層裝得進平行裡面），所以內容規則與 `scene` 相同。
    groupFragment: {
      content: "(sceneBlock | subscene)+",
      isolating: true,
      defining: true,
      attrs: {
        // 指向同群組某個 `groupMember` 的 `sceneId`。無 default —— 片段不能不屬於任何成員。
        memberId: {},
      },
    },

    action: {
      group: "sceneBlock",
      content: "inline*",
    },

    dialogue: {
      group: "sceneBlock",
      content: "inline*",
      attrs: {
        // character（人物）引用 { id, displayName }；可為 null（尚未指定說話者）→ default null。
        character: { default: null },
        // voiceStyle（發聲方式）：不允許 null，三值列舉，default '一般'（§5.3）。nullable: false 讓塞 null 會炸。
        voiceStyle: {
          default: "一般",
          validate: enumValidator("發聲方式", VOICE_VALUES, { nullable: false }),
        },
      },
    },

    insertShot: {
      group: "sceneBlock",
      content: "inline*",
    },

    text: {
      group: "inline",
    },
  },
  marks: {},
});
