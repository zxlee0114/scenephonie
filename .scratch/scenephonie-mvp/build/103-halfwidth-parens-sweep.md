# 103 — 畫面上的半形括號：全站掃一遍

**Status:** needs-triage

**What to build:** 畫面上看得到的文字，括號裡只有半形字時改成半形括號，前面空一格（`（INT.）` → ` (INT.)`）；裡面混的全形斜線一起換半形。括號裡有中文的照舊用全形。**註解不改。**

使用者提出，2026-11-04（票 101 第二輪 grilling 定下規則，見其結論 14）。票 101 只改了欄位說明那一塊，這張補全站其他地方。

**Blocked by:** 無（101 先合，免得說明文字兩邊衝突）

## 範圍線索

`grep -P '（[^（）\p{Han}，。、「」]*）'` 在 `apps/web/src` 有約 465 處，大多是註解。畫面上的例子：`projects/project-shelves.tsx` 的 `（{shelves.archived.length}）`、`（{shelves.deleted.length}）`，`projects/project-creator.tsx` 的 `（{timeAgo(saved.savedAt)}）`。

## 開工前要定

- 數字（`(3)`）也算半形字嗎？——依規則算，但列表標題裡的計數要不要空一格，看實際排版再說。
- 測試裡斷言的字串要跟著改。
