# 28 — 軟換行後游標回到第一行（bug）

**症狀：** 在區塊內按 `Shift+Enter` 換到第二行，接著打字，字出現在**第一行**的結尾，不是第二行。

**Blocked by:** 04（`extensions/soft-break` 在該票交付）

**Status:** verified

## 已知的事實（不必重驗）

- **資料模型是對的。** `keyboard-feedback.test.ts` 驗過 `Shift+Enter` 插入的是單一 `\n` 文字字元、經 `docFromJSON` 往返後仍是同一個 `text` 節點。壞掉的是**渲染與 caret 位置**，不是存下來的東西。
- 既有測試只涵蓋 `\n` 夾在文字**中間**的情形（`走進門\n關上門`）。`\n` 在區塊**結尾**的情形沒有任何測試 —— 而那正是「按下 `Shift+Enter` 之後、還沒開始打字」的當下狀態。

## 假設（開工前先證實或推翻）

> ❌ **這一節與下一節都被推翻了，保留作為路標 —— 見 Comments。**
> 真正的原因是 `\n` 被 DOM parse 換成半形空格，與行框、caret、pre-wrap 全都無關；
> 落點也不是這裡列的任何一個檔案，而是 `apps/web/src/editor/schema.ts`。

軟換行走的是「插入 `\n` 文字 ＋ CSS `white-space: pre-wrap`」（`extensions/soft-break.ts` 刻意不用 `hardBreak` 節點，理由見該檔註解）。但**位於區塊結尾的 `\n` 在瀏覽器裡不會產生一個可見的空行** —— pre-wrap 不為區塊末端的斷行留下行框。於是視覺上 caret 停在第一行末，接著輸入時 DOM selection 被映射回 `\n` 之前的位置，字就落在第一行。

這個假設可以用一個 jsdom 測試以外的方式驗（jsdom 沒有真正的排版）：在瀏覽器裡打 `abc` → `Shift+Enter` → 檢查 `editor.state.selection.from` 是否確實在 `\n` 之後，以及該位置的 DOM coords。

## 兩條候選解法（需要決定）

> ❌ **兩條都沒走。** 最後是第三條路：schema 上宣告 `whitespace: "pre"`，資料模型與節點集合
> 都不動，因此**不需要回到票券 02**。

**A. 用 `hardBreak` 節點（`<br>`）。** ProseMirror 的標準做法，瀏覽器行為正確。代價是 kernel schema 要多一個節點型別 —— 票券 04 明確拒絕過（會撐破 `schema-equivalence.test.ts` 與 §5.3 的 null 鐵律），而且它會進入 PDF 匯出、場次表推導等所有下游。**要走這條就得先回到票券 02 的 schema 決策。**

**B. 保留 `\n`，在 node view 補一個尾端 `<br>` 守衛。** 資料模型不動（這是票券 04 選 `\n` 的初衷）。代價是 node view 要在「區塊文字以 `\n` 結尾」時多渲染一個不進 content flow 的 `<br>`，而 `NodeViewContent` 的內容由 ProseMirror 管，插入額外 DOM 需要小心不要讓 PM 的位置映射錯亂。

傾向 B（守住票券 04 的資料模型決策），但需要先做一次小 spike 確認 PM 的位置映射不會被打壞；若 B 不可行就把問題升級回票券 02。

## 影響檔案

- `apps/web/src/editor/extensions/soft-break.ts`
- `apps/web/src/editor/nodes/blocks.tsx` —— `NodeViewContent` 所在
- `apps/web/src/styles/editor.css` —— `.ProseMirror { white-space: pre-wrap }`（第 107 行附近）
- `apps/web/src/editor/keyboard-feedback.test.ts` —— 補「`\n` 在區塊結尾」的案例

## 驗收

- [x] 打字 → `Shift+Enter` → 打字，第二段文字出現在**第二行**
- [x] `Shift+Enter` 之後、還沒打字時，看得見一個空的第二行，且 caret 在那一行上
- [x] 連續兩次 `Shift+Enter` 產生兩個空行，行為一致
- [x] `\n` 仍以單一 `text` 節點進入 canonical document（既有的往返測試不回歸），kernel schema 未新增節點型別（若最終走 A 則此條改寫並回到票券 02）
- [x] 存檔 → 重整後軟換行仍在正確的位置（跨 persistence 往返）
- [x] `pnpm lint` / `typecheck` / `test` / `build` 全綠

## Comments

**開票（2026-09-04）** —— 票券 05 的本機驗收中由使用者回報（先前已提過一次）：「軟換行 shift + enter 到第二行時，重新打字會回到第一行」。診斷寫在上面的「已知的事實」與「假設」兩節。

**診斷推翻了本票券的「假設」一節（2026-09-04）** —— 上面那條假設（pre-wrap 不為區塊末端的
斷行留下行框、caret 因此停在第一行）**是錯的**，而且錯得很有欺騙性：症狀完全吻合。兩個獨立的
反證：

1. **行框從來沒有缺過。** ProseMirror 的 `addTextblockHacks()` 對「文字以 `\n` 結尾」的
   textblock 本來就會補一個 hack `<br>`（DOM 裡的 `ProseMirror-trailingBreak`）。先照假設實作
   了「尾端 `<br>` 守衛」——它只是在 PM 已有的 br 旁邊多放一個 br，本機驗收回報「依舊會換回
   第一行」，因為那是個 no-op。該實作已整個撤掉。
2. **用 CDP 驅動真的 Chrome 量出來的三個狀態**（jsdom 沒有排版，量不到；這是票券第 18 行說的
   「jsdom 以外的方式」）：

   | 階段 | 區塊文字 | 高度 |
   |---|---|---|
   | 打完「走進門」 | `走進門` | 1 行 |
   | `Shift+Enter` 停手 | `走進門\n` | **2 行，caret 在第二行** |
   | 打完「關上門」 | `走進門`␠`關上門` | **塌回 1 行** |

   按下 `Shift+Enter` 的當下**一切都是對的**。壞的是**打下一個字的瞬間**：`\n` 被換成一個
   半形空格。這不是 caret 的位置問題，是**換行字元被刪掉了**。

**真正的原因** —— ProseMirror 每次從 DOM 讀回變動（`readDOMChange` → `parseBetween`）都會依
游標所在**區塊型別**決定要不要保留空白：

```js
preserveWhitespace: $from.parent.type.whitespace == "pre" ? "full" : true  // prosemirror-view
```

而 `true`（不是 `"full"`）那條路在 prosemirror-model 裡會執行：

```js
value = value.replace(/\r?\n|\r/g, " ");   // 明文把換行換成一個半形空格
```

三種 sceneBlock 都沒宣告 `whitespace`，所以每一次輸入都會把區塊裡的 `\n` 洗掉。既有測試沒抓到
是因為它們只走 command／JSON 路徑，**從來不經過 DOM parse** —— 而 DOM parse 正是打字會走的那條。

**修法（一行）** —— `apps/web/src/editor/schema.ts` 的 `sceneBlock()` 加上 `whitespace: "pre"`：
「這三種區塊裡的空白是內容，不要正規化」。這正是票券 04 主張「區塊內換行是編劇寫下的內容結構」
在 schema 上的說法，跟約束 2 同一個方向。

**沒有動到的東西**：kernel schema 一個節點型別也沒加（驗收 #4）—— 不必回到票券 02。kernel 也
不需要這個欄位：它 isomorphic、永遠不碰 DOM，`docFromJSON` 走 JSON 不走 parser。`whitespace` 是
DOM parse 的提示，屬 view 半邊，所以 `schema-equivalence.test.ts` 的對齊清單不含它。
`soft-break.ts`、`nodes/blocks.tsx`、`editor.css` 全部一行未改 —— 票券「影響檔案」列的四個檔案
裡有三個是錯的落點，真正的落點是 `schema.ts`。

**測試** —— `keyboard-feedback.test.ts` 補兩組：`\n` 在區塊結尾的游標落點／連按兩次／canonical
往返；以及**直接釘住那條縫**的 DOM parse 迴歸（三種區塊各驗 `\n` 不被換成空格）。拿掉
`whitespace: "pre"` 那一行，後三條會紅、訊息正是 `expected '走進門 關上門'` —— 與瀏覽器裡看到的
空格同一個。

**驗收（CDP 驅動真實 Chrome，六步全過）**

| 步驟 | 區塊文字 | 行數 | caret |
|---|---|---|---|
| 打「走進門」 | `走進門` | 1 | 第 1 行 |
| `Shift+Enter` 停手 | `走進門\n` | 2 | 第 2 行 |
| 打「關上門」 | `走進門\n關上門` | 2 | 第 2 行 |
| 再連按兩次停手 | `…\n關上門\n\n` | 4 | 第 4 行 |
| 打 `B` | `…\n\nB` | 4 | 第 4 行 |
| 等自動存檔後重整 | 與重整前逐字相同 | 4 | — |

＝ 驗收 #1／#2／#3／#5 全過。#4（kernel schema 未新增節點型別）與 #6（typecheck／test／build）
自動化已覆蓋。

⚠️ 驗收 #2 的「caret 在那一行上」是**間接**驗的：collapsed Range 落在尾端 `\n` 之後時
`getClientRects()` 回空陣列，量不到座標。但第二行的行框確實存在（高度 2 行），且下一個字確實
落在第二行 —— 這兩件事合起來就是 caret 在那一行的證據。

⚠️ `pnpm lint` 有兩個錯誤，**與本票券無關**：eslint 的 `ignores` 沒排除 `.claude/worktrees/**`，
掃進了票券 29 那個 worktree 底下的 `prototypes/yjs-migration-spike`。不在本票券範圍內，未動。
**本機驗收（2026-09-04）** —— 使用者確認瀏覽器行為正確，六條全過。

驗收 #4 的驗法（使用者提問，記在這裡免得下次再問一次）：這條是**三個獨立斷言**綁在一句話裡，
沒有一項要手驗 ——

| 斷言 | 證據 |
|---|---|
| kernel schema 未新增節點型別 | `git diff <base> -- packages/schema` 是**空的** —— 節點型別的唯一權威沒被碰過，不可能多出一個。第二層保險是 `schema-equivalence.test.ts` 的「節點名集合一致」（若在編輯器側偷加節點會紅）。 |
| `\n` 以單一 `text` 節點進入 canonical document | `keyboard-feedback.test.ts` 兩條，`\n` 夾在中間與在結尾各一，皆在 `docFromJSON()` 往返後斷言 `childCount === 1`、`firstChild.type.name === "text"`、文字逐字相同。 |
| 既有往返測試不回歸 | `schema-equivalence.test.ts`（5）＋ `plain-json.test.ts`（5）全綠，其中「kernel doc → Tiptap → kernel 往返後 JSON 不變」是正主。 |

一行重跑：
`cd apps/web && pnpm vitest run src/editor/schema-equivalence.test.ts src/editor/keyboard-feedback.test.ts src/editor/plain-json.test.ts`（24 passed）。
