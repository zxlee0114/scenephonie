# 30 — `/next` 在原場次留下一個空白區塊（bug）

**症狀：** 用 slash 選單的「新增下一場」建下一場之後，原本那一場的最後面多出一個空白行。⌘+Enter 與場次腳部按鈕兩個入口都沒有這個問題。

**Blocked by:** 04（`extensions/slash.tsx` 在該票交付）

**Status:** in-review

## 根因（已定位，不必再查）

`apps/web/src/editor/extensions/slash.tsx:41`

```ts
run: (editor, range) => {
  editor.view.dispatch(editor.state.tr.delete(range.from, range.to));
  requestNextScene(editor);
},
```

`range` 只涵蓋你打的那幾個字（`/next`），刪掉之後**承載它的區塊留在原地，變成空的**。你為了打指令按 Enter 開的那一行，指令跑完就成了遺留物。

同一個檔案裡的 `/shot`、`/dialogue`、`/action` 沒有這個問題 —— 它們走 `convertBlock`，把你正站著的區塊轉型，那個區塊本來就該留下。`/next` 是唯一「指令跑完，承載它的區塊就沒有存在理由」的一個。⌘+Enter 沒問題是因為沒有指令文字要刪，你站的區塊也不是為了打指令才開的。

## 影響檔案

- `apps/web/src/editor/extensions/slash.tsx` —— `/next` 的 `run`

## 待決（已解）

- **空場次不允許** —— kernel `schema.ts:128` 的 `scene` 是 `content: "sceneBlock+"`。所以判準是「刪完為空**且**不是本場唯一的區塊」。
- 「既有內文行尾打 `/next`」的實際形狀跟開票時想的不一樣：Suggestion 預設 `allowedPrefixes` 要求 `/` 前面是空白或區塊開頭，所以**緊接**內文打 `/` 根本不彈選單。可達的是「內文＋空格＋`/next`」，刪完剩「內文 」不為空 —— 同一條判準涵蓋。
- 收掉區塊會讓 selection 離開場次，`requestNextScene` 靠 selection 推算就會把新場次接到全劇最後面。改成刪之前先取 `currentSceneId`，明確傳給 `requestNextScene`。

## 驗收

- [x] 在空行打 `/next` 建下一場，原場次**不**留下空白行
- [x] 內文後接 `/next`（「內文 /next」），該區塊的內文原封不動保留
- [x] 本場唯一的區塊上打 `/next`，場次不會變成沒有內容（或依 schema 結論處理）
- [x] ⌘+Enter 與場次腳部按鈕兩個入口的行為不回歸
- [x] `pnpm lint` / `typecheck` / `test` / `build` 全綠（瀏覽器實地確認待驗收）

## Comments

**開票（2026-09-04）** —— 票券 26 的本機驗收中由使用者順帶發現：「如果使用 slash 選單建下一場，會在原場次留下空白的一行」。與 26 無關，早於 26 就存在。
