# 23 — schema attr 鍵名羅馬化（upkeep）

**What to build:** 把票券 02 `packages/schema/src/schema.ts` 裡以中文命名的 **node attr 鍵**與 **ref 型別欄位**改成慣例的英文小駝峰。詞彙表（`CONTEXT.md`）維持中文不動 —— 程式碼識別碼用英文、領域詞彙用中文，中間靠 `schema.ts` 檔頭一張對照表對接。**只改鍵／識別碼，不改值**：`日｜夜｜晨｜昏`、`內景｜外景｜內外景｜雜景`、`一般｜V.O.｜O.S.` 是領域資料、會被持久化、輸出照印，維持中文。

**為什麼是 upkeep、為什麼是現在：** 這些 attr 名會序列化進 ProseMirror doc JSON 存 `jsonb`。persistence 是票券 05、目前**沒有任何持久化資料**，現在改成本為零；一旦有稿就得寫 migration。

**Blocked by:** 03（會改到 03 的測試 fixture；分支基於 03，PR 排在 03 合併之後 rebase 到 main）

**Status:** in-review

## 對照表（本票券的權威來源；同表寫進 `schema.ts` 檔頭）

| 中文（詞彙表） | 程式碼識別碼 | 備註 |
|---|---|---|
| 時間 | `time` | 順場表稱「光」 |
| 內外 | `intExt` | 順場表稱「景」；與既有型別 `SceneIntExt`／`INT_EXT_VALUES` 一致 |
| 地點 | `location` | |
| 登場人物 | `appearingCharacters` | 判準：入鏡 |
| 群演 | `extras` | |
| 發聲方式 | `voiceStyle` | 與既有型別 `VoiceStyle`／`VOICE_VALUES` 一致 |
| 人物（`dialogue` attr） | `character` | |
| 顯示名（ref 欄位） | `displayName` | 漸進揭露的「這一場顯示的名字」 |
| 描述（`ExtraRef`） | `description` | |
| 人數（`ExtraRef`） | `count` | |
| 種類（`subscene`，票券 11 才進 schema） | `kind` | 先登記，票券 11 沿用 |

**不改（值，非鍵）：** `TIME_VALUES`、`INT_EXT_VALUES`、`VOICE_VALUES` 的字串內容；`enumValidator` 的錯誤訊息標籤維持中文（診斷文字用領域詞）。

## 影響檔案（全在 `packages/schema/`）

- `src/schema.ts` —— attr 鍵、`LocationRef`／`CharacterRef`／`ExtraRef`／`DialogueCharacterRef` 欄位、`nullableSceneAttrNames` 陣列值、檔頭加對照表
- `src/schema.test.ts`
- 票券 03 的測試 fixture：`src/commands/set-block-type.test.ts`、`src/commands/dedupe.test.ts`、`src/commands/create-next-scene.test.ts`、`src/invariants.test.ts`
- `src/commands/set-block-type.ts` —— 只有 doc 註解提到 `人物`／`發聲方式`
- `CONTEXT.md` —— 交叉引用一句：程式碼識別碼對照見 `schema.ts` 檔頭

`apps/web` 已確認不觸及這些 attr。

## 驗收

- [x] `schema.ts` 無中文 attr 鍵；ref 型別欄位全英文小駝峰
- [x] `日｜夜…`、`內景…`、`一般｜V.O.…` 等**值**維持中文
- [x] `schema.ts` 檔頭有中文↔識別碼對照表，`CONTEXT.md` 有交叉引用
- [x] `pnpm lint`／`typecheck`／`test`（94 + 12 todo）／`build` 全綠
- [x] 詞彙表（`CONTEXT.md` 詞條本身）未被改動 —— 只在 `## Language` 開頭加一句對接說明

## Comments

**實作（2026-09-02）** —— 分支 `worktree-ticket-23-schema-attr-romanization` 基於票券 03，PR 排在 #03 之後，合併前 rebase 到 main。

`enumValidator` 的 label 參數刻意留中文（`"時間"`／`"內外"`／`"發聲方式"`）—— 那只進 `RangeError` 訊息給人讀，不是識別碼。`nullableSceneAttrNames` 陣列值同步改成新鍵（`["time","intExt","location","appearingCharacters"]`）。`種類`／`kind` 只登記在對照表，schema 尚無該 attr（票券 11 才進）。`apps/web` 確認完全不觸及這些 attr。
