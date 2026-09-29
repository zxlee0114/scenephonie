# 11 — 子場次

**What to build:** 階層，深度固定兩層（[ADR-0003](../../../docs/adr/0003-inserted-scenes-as-subscenes.md)、[ADR-0006](../../../docs/adr/0006-continuous-action-as-continuation-subscenes.md)）。`subscene` node，內容規則不含 `subscene`（不變式 ⑤ 由 schema 直接保證，非執行期檢查）。attrs：同 `scene` ＋ `種類`（`插入｜接續`，**不允許 null、無預設、建立時必填** —— 編劇按下哪個入口就是宣告哪一種，系統不代填）。手勢：`/insert`（種類＝插入）、`/continue-to`（種類＝接續）、`/back-to`（**不建立任何東西**，游標跳回主場次）；在主場次與子場次裡都可用，語意不變。不變式 ①：主場次的內容必須以主場次自己的內容開始，子場次不能是第一個孩子 —— command 在空場次裡讓 `/insert`／`/continue-to` **不可用**。不變式 ②：子場次的 metadata 不得與主場次完全相同 → 視為不完整 → 自動草稿 → 匯出前被攔。**metadata 完全不繼承主場次**（預填會騙過草稿防呆）；省打字走**明確套用**：`/insert`／`/continue-to` 第二步可選一個既有場次，套用其**內外／時間／地點**三欄（**不套用登場人物**），套用是複製不是連動，清單第一項是「不沿用，留空」。時間欄下拉選單依種類排序（`接續` 把主場次值置頂並標「（原場次）」；`插入` 只標注不置頂）；**地點欄兩者都不置頂**（欄位仍為空，草稿防呆照常）。折返標記（`回到　公寓客廳`，印地點顯示名、不印場次號）在**編輯器內即時顯示**，機制同場次號（decoration），不進資料模型；推導規則見 §9.4，空區塊不算內容。刪除主場次一併刪子場次（`SceneMenu` 標數量，⌘Z 一步還原子樹、`sceneId` 一起回來）。**不做降級**（子場次 → 插入畫面）。

**Blocked by:** 04, 03, 08

**Status:** in-review

- [x] `/insert`／`/continue-to` 建立帶 `種類` 的子場次；`/back-to` 不建立任何東西
- [x] schema 內容規則保證子場次不能再有子場次（非執行期檢查）
- [x] 空場次裡 `/insert`／`/continue-to` 不可用（不變式 ①）
- [x] 未改過的子場次（metadata＝主場次）自動是草稿（不變式 ②），不預填 —— 不預填已做；判準 `subsceneEchoesParent` 已在 kernel，**接進草稿推導是票券 14**
- [x] 明確套用：複製既有場次三欄、不含登場人物；清單第一項是「留空」
- [x] 時間欄下拉依種類排序；地點欄不置頂；欄位仍為空、草稿防呆照常
- [x] 折返標記在編輯器即時顯示（decoration），兩子場次相鄰時不印；不進資料模型
- [x] 刪主場次連帶刪子場次，⌘Z 一步完整還原

## Comments

**2026-09-29 實作（agent）**：kernel（`createSubscene`／`deleteScene`／`returnMarkers`／`subsceneEchoesParent`／`subsceneTimeOptions`、`projectScenes` 編 `5.1`）＋編輯器（斜線兩步、`/back-to`、雙 Enter、折返標記 widget、點場次號開 SceneMenu）。待瀏覽器驗收。實作時自己做的判斷：

1. `/back-to` 只在子場次裡列出來（在主場次裡沒有地方可「回到」）；§7.1 的「兩處都可用」只講 `/insert`／`/continue-to`。
2. `/back-to` 與雙 Enter 若子場次之後沒有空的主場次行，會開一個空動作區塊 —— 不建立任何**場次**身分。
3. 主場次還沒填地點時，折返標記印「回到　主場次」。
4. 套用清單不列內外／時間／地點三欄全空的場次（沒有東西可套）。
5. 不變式 ② 比四欄（時間、內外、地點 id、登場人物 id），照「完全相同」字面。
6. 場次號拿掉 `pointer-events: none`，點下去開 SceneMenu（只有「刪除」一列；搬移／對調歸 13）。仍 `aria-hidden`、不可選 —— 鍵盤路徑還沒有。
7. 順手修：斜線選單的選取動作只在 onStart 綁 range，打完整串指令再 Enter 只會刪掉 `/`（`/next` 也中）。
