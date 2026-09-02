# 02 — Isomorphic schema kernel 與 `projectScenes()`

**What to build:** 場次序列的最小 canonical schema，與場次號的推導函式。node spec 涵蓋 `doc`、`scene`、`sceneBlock`（`action`／`dialogue`／`insertShot`），**先不含子場次與群組**。落實 null 鐵律（§5.3）：可為 null 的 attr（時間／內外／地點／登場人物）`default: null`；`發聲方式` 三值、不允許 null、`default: '一般'`；`manualDraft` 不允許 null、`default: false`。`sceneId`（`sc_` 前綴 nanoid，使用者永遠看不到）在建立節點時鑄造，存在節點 attr 上。`projectScenes(doc)` 是純函式，Node 與瀏覽器都能跑，依文件順序推導 `1..N`，不進 doc、不進 DB（§5.4）。node spec 與 node view 分家（§5.5）。

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] schema 模組零瀏覽器相依，測試在 Node 跑
- [ ] null 鐵律逐欄有測試：往返後 `default` 不會靜默改寫 null 欄位（票 19 的探針結果）
- [ ] `發聲方式`／`種類` 採「不允許 null」而非「預設 null」——「要嘛預設 null、要嘛不允許 null，不要兩者兼有」
- [ ] `projectScenes(doc)` 對一份多場次 doc 推導出 `1..N`
- [ ] `sceneId` 全域唯一、`sc_` 前綴、使用者不可見
- [ ] 同一份 schema 可餵給 `Node.fromJSON`（為 Yjs 路徑預留，不實作 Yjs）
