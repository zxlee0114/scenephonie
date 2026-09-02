/**
 * 場次序列的 canonical node spec（規格 §5）。
 *
 * **這一半不含任何瀏覽器相依**（§5.5）——沒有 `toDOM`／`parseDOM`，那是 node view 的事，
 * 住在 `apps/web` 的編輯器套件裡。這個模組要能在 Node 跑（PDF 匯出、場次表推導、
 * 伺服器端 command），也要能原封不動餵給日後的 `y-prosemirror`（票券 19 已驗證往返等價）。
 *
 * **本票券（02）的範圍**：`doc`、`scene`、`sceneBlock`（`action`／`dialogue`／`insertShot`）。
 * **先不含**子場次（`subscene`）與場次群組（`sceneGroup`／`groupMember`／`groupFragment`）——
 * 那些在票券 05／後續長出，屆時沿用同一份 schema、同一套 null 鐵律。其中 `subscene` 的
 * `種類`（`插入｜接續`）比照 `發聲方式` 走「不允許 null」，但**無 default、建立時必填**
 * （它是編劇按下哪個入口的宣告，系統不代填）。
 */
import { Schema } from "prosemirror-model";

/** `時間` 欄位的合法值（業界順場表稱「光」）。可為 null —— null ＝ 尚未填。 */
export const TIME_VALUES = ["日", "夜", "晨", "昏"] as const;
export type SceneTime = (typeof TIME_VALUES)[number];

/** `內外` 欄位的合法值（業界順場表稱「景」）。`雜景` 是逃生口：宣告「橫跨多個未指定地點」。 */
export const INT_EXT_VALUES = ["內景", "外景", "內外景", "雜景"] as const;
export type SceneIntExt = (typeof INT_EXT_VALUES)[number];

/** `發聲方式` 的三個值。**不允許 null**，`default: '一般'`（§5.3）。輸出渲染為 `小明（V.O.）`。 */
export const VOICE_VALUES = ["一般", "V.O.", "O.S."] as const;
export type VoiceStyle = (typeof VOICE_VALUES)[number];

/** 場次 `地點` 欄的引用形狀：實體 id ＋ 這一場顯示的名字（漸進揭露，§4.7）。 */
export interface LocationRef {
  locationId: string;
  顯示名: string;
}

/** 場次 `登場人物` 欄的引用形狀。判準是入鏡，不是有沒有台詞。 */
export interface CharacterRef {
  characterId: string;
  顯示名: string;
}

/** 場次 `群演` 欄的形狀。場次限定實體，id 只在該場次內有意義。 */
export interface ExtraRef {
  extraId: string;
  描述: string;
  人數: number;
}

/** `dialogue` 節點 `人物` attr 的引用形狀（§5.1：`{ id, 顯示名 }`）。合法目標是人物或本場次的群演。 */
export interface DialogueCharacterRef {
  id: string;
  顯示名: string;
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
 */
const NULLABLE_SCENE_ATTRS = ["時間", "內外", "地點", "登場人物"] as const;

function 發聲方式Validator(value: unknown): void {
  // 不允許 null：這正是票券 19 點名的受害候選，驗證器把「不允許」變成會炸的事實。
  if (!VOICE_VALUES.includes(value as VoiceStyle)) {
    throw new RangeError(`發聲方式 只能是 ${VOICE_VALUES.join("／")}，收到 ${JSON.stringify(value)}`);
  }
}

/**
 * canonical 場次 schema。
 *
 * 內容規則：
 * ```
 * doc   := scene+
 * scene := sceneBlock+            isolating, defining
 * sceneBlock := action | dialogue | insertShot   （group，不是節點）
 * action / dialogue / insertShot := inline*
 * ```
 *
 * `scene` 是 `isolating`（跨場次的鍵盤選取／刪除不會把兩場合併，`sceneId` 錨點隨之
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
      content: "scene*",
    },

    scene: {
      content: "sceneBlock+",
      isolating: true,
      defining: true,
      attrs: {
        // 建立時必填、無 default —— 少了 default 就是「建立節點時必須鑄造」的強制版本
        // （`Node.fromJSON` 少了這個 attr 會直接 throw）。鑄造見 ./ids 的 mintSceneId()。
        sceneId: {},
        // 可為 null（§5.3）：空 metadata → 自動草稿，是草稿防呆的地基。default 也是 null。
        時間: { default: null },
        內外: { default: null },
        地點: { default: null },
        登場人物: { default: null },
        // 不允許 null：空陣列就是「沒有」，不需要「未填 vs 空」的區別（不參與草稿完整性判定）。
        群演: { default: [] as ExtraRef[] },
        dismissedCharacterIds: { default: [] as string[] },
        // 不允許 null，default false（§5.3）。手動標記為草稿；不存狀態機。
        manualDraft: { default: false, validate: "boolean" },
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
        // 人物引用 { id, 顯示名 }；可為 null（尚未指定說話者）→ default null。
        人物: { default: null },
        // 不允許 null，三值列舉，default '一般'（§5.3）。驗證器讓「不允許 null」會炸。
        發聲方式: { default: "一般", validate: 發聲方式Validator },
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

/** `scene` 節點上，schema `default` 必須為 `null` 的 attr 名單（null 鐵律，§5.3）。 */
export const nullableSceneAttrNames: readonly string[] = NULLABLE_SCENE_ATTRS;
