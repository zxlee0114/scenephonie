# 12 — 場次群組（對剪）

**What to build:** 平行，存在的理由只有一個：保住交錯（[ADR-0004](../../../docs/adr/0004-scene-groups-for-intercut.md)、規格 §5.2 的裁決）。三種 node：`sceneGroup`（attr `groupId`，`gr_` 前綴 nanoid，使用者永遠看不到）／`groupMember`（同 `scene` 全部 metadata attrs 含 `sceneId`，無內容，atom）／`groupFragment`（attr `memberId` 指向同群組某個 `groupMember` 的 `sceneId`，內容 `(sceneBlock｜subscene)+`）。文件頂層放寬為 `(scene | sceneGroup)+`。不變式 ③（同群組成員間 metadata 不得完全相同 → 自動草稿）、④（群組不能巢狀、一個場次不能同時屬於兩個群組 —— 由樹結構免費保證）。成員各佔一個**頂層場次號**（`26`／`27`／`28`）、場次表各一列；**群組本身不佔號、不進場次表**。`projectScenes()` 對 `groupMember` 與 `scene` 一視同仁。手勢：`/` →「對剪到…」建立群組（第二步沿用「選既有場次或建立新的一場」）；`⌘+1`／`⌘+2`／`⌘+3` 切換游標所在片段的歸屬，**直接定址**，超出成員數是**無效鍵**（`⌘+4` 在三成員時永遠不會憑空建立場次）。command `assignFragmentToMember(groupId, fragmentIndex, memberId)` —— `fragmentIndex` 是呼叫當下由編輯器從游標算出的傳遞參數，**不被任何東西儲存**（保護規則 2／3）。片段正規化：相鄰兩片段歸屬同一成員時 `appendTransaction` 合併（標 `addToHistory: false`）。**片段在 v1 不給 id、不給任何東西引用**。`groupId` 去重與 `sceneId` 走同一套。成員可以有自己的子場次（群組不能巢狀，但階層裝得進平行）。「以下對剪」不進資料模型。

**Blocked by:** 11

**Status:** verified

- [x] `/` →「對剪到…」建立群組；成員各得一個頂層場次號
- [x] schema 保證群組不能巢狀、一個場次不屬於兩個群組
- [x] 同群組成員 metadata 完全相同時自動是草稿（不變式 ③）—— 判準 `echoingMembers` 已在 kernel，**接進草稿推導是票券 14**（同票 11 的 ②）
- [x] `⌘+1/2/3` 直接定址切換片段歸屬；`⌘+4` 在三成員時是無效鍵，不建立場次
- [x] `assignFragmentToMember` 以 id 定址，`fragmentIndex` 不被持久化
- [x] 相鄰同成員片段自動合併，標 `addToHistory: false`
- [x] 片段沒有 id，沒有任何持久化引用指向片段
- [x] `groupId` 走與 `sceneId` 相同的去重規則；群組成員可有自己的子場次

## Comments

**2026-10-20 實作（agent）**：kernel（三個節點、`intercutTo`／`assignFragmentToMember`／`normalizeFragmentsPlugin`、`findContainer` 定址、`groupId` 去重、`echoingMembers`、`projectScenes` 成員編號）＋編輯器（`/intercut` 兩步、`FragmentKeys`、成員共用 `SceneView`、片段原生 node view、「以下對剪」decoration）。待瀏覽器驗收。

使用者裁決：

1. 第二步「選既有場次」＝**收編**：那一場保住 `sceneId` 與 metadata、原本的內容變成它的片段（不鑄造；只有「建立新的一場」是 `createGroupMember`）。
2. `⌘+N` **從游標這一行切開**：游標區塊（含其後）歸給成員 N；第一行＝整段改歸屬、末尾空行＝開新片段。command 多一個傳遞參數 `fromBlockIndex`。

實作時自己做的判斷：

3. schema 寫 `groupMember* groupFragment*`（§5.1 意圖 `+`）—— 兩者都帶無 default 的 id，放在必填位置 schema 建不起來，與 `doc` 同一顆雷。「至少兩個成員、一個片段」由 command 守。
4. 片段裡的區塊以 **成員 `sceneId` ＋ `fragmentIndex`（群組裡第幾個片段）＋ 區塊序** 定址（kernel `ContainerAddress`）。`setBlockType`／`setDialogueCharacters`／`createSubscene` 因此在片段裡照常可用。
5. 在群組裡按「對剪到…」＝**加入一個成員**，新片段接在游標所在片段之後 —— 三地對剪的第三個成員只能從這個入口來（⌘+4 不建立場次）。
6. 刪成員連帶它的片段；**只剩一個成員時群組解散**，那個成員變回普通場次（保住 id 與 metadata、片段依序接起來）；剩下的成員都沒有片段時補一段空的。⚠️ 這是新的產品決定，ADR／spec 沒有寫，需要確認。
7. 正規化多做一件事：**孤兒片段**（`memberId` 不是本群組成員，例如單一片段貼進別的群組）歸給前一段的成員（第一段歸第一個成員），再照常合併。
8. 游標在**成員的子場次**裡按 `⌘+N` 是無效鍵 —— 片段不能從子場次切開（同不變式 ①）。
9. 片段的常駐標籤：號碼住 gutter、地點是片段開頭一行小字（地點未填就印「地點未填」）。**票券 15 的「點標籤修正歸屬」沒有做** —— `⌘+N` 在第一行就是整段改歸屬，同一件事已有鍵盤路徑。
10. 群組的「＋ 新增下一場」在群組腳部，接在整個群組之後。成員 chip row 前印 `⌘1`／`⌘2`… 作為鍵的提示。

**2026-10-21 驗收第一輪（使用者回饋）**：

1. **同地點、同時間不能對剪**：「對剪到…」第二步不列、`intercutTo` 拒絕（kernel `sameSpaceTime`）。只在地點與時間都填了、而且都相同時擋；有一欄沒填不擋（還不知道）。地點連到實體的比 id，還沒連的比顯示名。在群組裡按時跟每一個既有成員比。
2. **場次多時的選單**：slash 選單限高自己捲，方向鍵走到的那一列捲進來；第二步可以接著打字篩（`/intercut港邊`），不會退回第一步。`/insert`／`/continue` 的「套用…」第二步同樣受惠。
3. **⌘+A 在片段裡**：改成「區塊 → 片段內文 → 整個群組 → 整份」。原本第三步選的是片段節點，沒有反白，看起來像選取消失；第四步之後在 `AllSelection` 上又落到「區塊」分支，對 doc 建 TextSelection —— 那條 `TextSelection endpoint not pointing into a node with inline content (doc)` 警告就是它。現在整份時再按就停在整份；群組被選起來時整塊一個反白。
4. **取消對剪**（使用者裁決：兩個都做）：成員選單多兩列。
   - 「移出對剪」（`ungroupMember`）：那一場變回普通場次、**接在群組後面**，`sceneId`／metadata／子場次保住，片段依閱讀順序接成它的內文；其餘成員的交錯不動，只剩一個成員時群組也解散。
   - 「解散對剪」（`dissolveGroup`）：每個成員依成員順序變回普通場次。
   - 兩者 ⌘Z 一步回來。
5. **開 DevTools 偶發當機（RESULT_CODE_HUNG）**：已解（見本條最後）。`main` 上沒重現到，但偶發、不能排除。程式裡沒看到會不收斂的 `appendTransaction` 或 resize 迴圈；之前那次 CPU 飆高的紀錄在 repo／PR／對話紀錄裡都沒找到。下次發生時用 Chrome 工作管理員（Shift+Esc）看飆高的是分頁還是 DevTools。
   - 追加（使用者提供前一次的總結）：前一次的根因是 `@tiptap/react` 在 ProseMirror 更新途中掛新 React node view 時無條件 `flushSync`；動作／插入畫面已改原生，但 `SceneView`（場次、子場次、**群組成員**）與對白仍是 React。本票多出幾個在更新途中新掛它們的時機（建立成員、移出／解散、⌘+N 切開與合併重排片段裡的對白）—— 推論，未重現。
   - 使用者裁決：**先加斷路器抓觸發點**。開發環境掛 `RunawayGuard`：沒有輸入、一秒重繪超過 300 次 → 把輸入、transaction 摘要、游標節點路徑、React node view 數寫進 `localStorage["scenephonie:runaway"]`，並設成唯讀斷迴圈（`syncEditable` 讀它的 storage，不會再改回可編輯）。已在本機瀏覽器用 400 次強制重繪驗過會跳閘並保持唯讀。拿到紀錄再決定要不要 patch `@tiptap/react` 的 `flushSync`。
   - **根因找到並修掉**（第三份紀錄的 `accepted`）：ProseMirror 讀回的全是 React 畫外殼（`div.block`、`div.scene`）與 Tiptap 搬 contentDOM 的變動。Tiptap 預設 `ignoreMutation` 的行動裝置分支（`isiOS() || isAndroid()`、有焦點、增刪節點都 `isContentEditable` → 不忽略）在開著 DevTools 的 Mac Chrome 上誤中 —— `isiOS()` 用 `userAgent` 含 Mac ＋ `ontouchend in document` 認 iPad。於是每掛一個 React node view 就整個節點標髒 → 重建 → React 再掛 → 再讀回。修法：場次與對白的 `ReactNodeViewRenderer` 改用 `ignoreReactChromeMutation`（`nodes/react-mutations.ts`），只讀回 node view 自己 contentDOM 裡的變動。回歸測試在 jsdom 讓 `isiOS()` 成立，拿掉修正會紅。
   - 同一個根因很可能也是「按 Enter 新行出現、游標留在原處、重新整理就好」那一次：節點被重建時 DOM 選取跟丟。
   - 斷路器留著（開發環境）當保險；前一次「動作區塊改原生 node view」的修法其實是繞過同一個問題。

**2026-10-21 驗收第二輪（使用者）**：第一輪回饋 1–5 全部複驗通過（含開著 DevTools）。

使用者裁決：

- 實作判斷 6「只剩一個成員時群組解散」：**同意**。
- 實作判斷 9「票券 15 的點標籤修正歸屬不做」：**同意**（⌘+N 在第一行就是同一件事）。
- 成員事後被手動改成同地點、同時間：**不在編輯當下擋**，接進票券 14 的草稿推導（已記到票券 14）。
- 開發環境斷路器（`RunawayGuard`）：**留著**（只在開發環境載入；代價是包了 ProseMirror 私有的 `domObserver.registerMutation`，升級後失效只少一欄紀錄）。
- 實作判斷 5「群組裡按『對剪到…』＝加入成員」：**維持現狀**（成員選單不另加「新增對剪成員」入口）。
