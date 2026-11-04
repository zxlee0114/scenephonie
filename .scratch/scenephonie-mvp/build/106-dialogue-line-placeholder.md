# 106 — 空的台詞行要有提示字，跟人物欄一樣

**Status:** needs-triage

**What to build:** 對白的台詞那一行還空著時，淡淡印一行提示（例如 `台詞`），讓編劇看得出這一行是寫對白的 —— 跟上面人物欄的 `人物` 提示同一個作用。

使用者提出，2026-11-05（票 105 驗收時）。

**Blocked by:** 無

## 線索

- 人物欄的提示是 `<input placeholder="人物">`（`editor/nodes/blocks.tsx`），顏色走 `--text-secondary`（`.entity-field input::placeholder`，票 86）。
- 台詞是 ProseMirror 的文字，不是 input。repo 已經用過 Tiptap 的 `Placeholder` extension（`documents/document-editor.tsx` 的 `EMPTY_HINT`；CSS 用 `attr(data-placeholder)`，見 `styles/documents.css`），可以照那套。

## 開工前要定

- 措辭：`台詞`？`對白`？要不要跟人物欄的 `人物` 一樣短。
- 範圍：只有台詞？空的描述、插入畫面要不要也有（「一致」的另一半，見 DESIGN.md Focus 段的劇本內文例外）？
- 什麼時候印：每一個空台詞都印，還是只有游標所在的那一個（Placeholder 的 `showOnlyCurrent`）？人物欄是空著就一直印。
- 匯出、分享頁、場次表不能印出來（它只是編輯器裡的提示，不是內容）。

## Comments
