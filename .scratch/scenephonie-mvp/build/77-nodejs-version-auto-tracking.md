# 77 — 自動追蹤 Node.js 安全更新

**What to build:** 用自動化工具對 `.nvmrc` 與 `engines.node` 的 22.x 新版本開 PR，讓釘死的版本不會被遺忘。

**Blocked by:** 76

**Status:** `ready-for-agent`

## 為什麼

[票券 76](./76-nodejs-security-update-2026-10.md) 把 `.nvmrc` 與 `engines.node` 釘到 22.23.4，**釘死的代價是之後每一次 Node 安全版都得有人記得去改**。2026 年已有 4 次安全公告（3/24、6/18、7/29、10/21），平均每 2 個月一次。釘版本之後沒有任何機制會提醒「該升了」，漏洞窗口完全取決於人想起來的時間。

目前 repo 沒有 `renovate.json`，也沒有 `.github/dependabot.yml`。

## 做法

1. **選工具**。傾向 Renovate，因為它有 `nvm` manager（讀 `.nvmrc`）與 `node` datasource，可以直接對 `.nvmrc` 與 `engines.node` 開 PR；Dependabot 不支援 `.nvmrc`。**實作前先到官方文件確認這兩點**，不要憑印象。
2. **範圍限定在 22.x 的 minor／patch**：Node 大版本升級（22 → 24）不自動開 PR，由人另開票評估（票券 76 已排除在範圍外）。
3. **`.nvmrc` 與 `engines.node` 要一起動**：兩個值必須同步，否則 `engines` 會擋住 `.nvmrc`，或下限落後於實際版本。用 Renovate 的 grouping 讓它們進同一個 PR，或加一個 CI 檢查驗證兩者一致。
4. **安全版優先**：安全版 PR 不要被排程延後，也不要被合併進其他 PR。
5. **Vercel 不在自動化範圍**：Vercel 的 Node 版本在 dashboard 設定、只有大版本（`22.x`），小版本由 Vercel 自己維護。PR 描述或票上註明這點，避免誤以為 repo 的版本號等於線上版本。

## 驗收

- [x] 有一份設定（Renovate 或等價工具）能對 `.nvmrc` 的 22.x 新版本自動開 PR
- [x] `.nvmrc` 與 `engines.node` 同步更新，或有 CI 檢查擋住兩者不一致
- [x] 大版本升級不會被自動開 PR
- [ ] 實際跑出至少一個 PR（可用降一版 `.nvmrc` 的測試分支驗證），再還原
- [x] 票上記錄 Vercel 不在自動化範圍

## 不做

- Node 大版本升級（22 → 24）
- 非 Node 的依賴更新策略（npm 套件、GitHub Actions 版本）。若同一個工具順便處理，另開票決定規則
- 自動 merge

## Comments

編號：開票時放在 `issues/`、編為 32；2026-10-25 搬到 `build/` 改編 77，因 `build/32` 已被占用。

## 實作紀錄

- 工具：Renovate（文件確認：`nvm` manager 讀 `.nvmrc`、datasource `node-version`；npm manager 會抽出 `engines` 但 `>=` 範圍不會被改寫，所以 `engines.node` 改用 `customManagers` regex 處理）。設定在 `renovate.json`，`enabledManagers` 只開 `nvm` 與 `custom.regex`，因此不處理 npm 套件與 Actions 版本。
- 範圍：`allowedVersions: "<23"` 排除大版本；兩個檔案同屬 groupName `Node.js 22.x`，進同一個 PR；不排程、不 automerge。
- 保險：CI 加「Node 版本一致性」步驟，`.nvmrc` 與 `engines.node` 下限不同版就失敗。
- 驗證：用 `renovate --platform=local` 把 `.nvmrc`／`engines.node` 降到 22.22.0，產出單一分支 `renovate/node.js-22.x`，兩處皆升到 22.23.4、沒有 24.x，已還原。
- **Vercel 不在自動化範圍**：Vercel 的 Node 版本在 dashboard 設定、只有大版本（`22.x`），小版本由 Vercel 維護；repo 的版本號不等於線上版本。
- **需人工**：要在 GitHub 安裝 Renovate app（github.com/apps/renovate）並授權此 repo，設定才會生效；合併後才會看到真正的 PR。
