# 自動追蹤 Node.js 安全更新

Type: task
Status: ready-for-agent
Blocked by:

## Why

[票 31](./31-nodejs-security-update-2026-10.md) 把 `.nvmrc` 與 `engines.node` 釘到 22.23.4，**釘死的代價是之後每一次 Node 安全版都得有人記得去改**。2026 年已有 4 次安全公告（3/24、6/18、7/29、10/21），平均每 2 個月一次。釘版本之後沒有任何機制會提醒「該升了」，漏洞窗口完全取決於人想起來的時間。

目前 repo 沒有 `renovate.json`，也沒有 `.github/dependabot.yml`。

## What to do

1. **選工具**。傾向 Renovate，因為它有 `nvm` manager（讀 `.nvmrc`）與 `node` datasource，可以直接對 `.nvmrc` 與 `engines.node` 開 PR；Dependabot 不支援 `.nvmrc`。**實作前先到官方文件確認這兩點**，不要憑印象。
2. **範圍限定在 22.x 的 minor／patch**：Node 大版本升級（22 → 24）不自動開 PR，由人另開票評估（票 31 已排除在範圍外）。
3. **`.nvmrc` 與 `engines.node` 要一起動**：兩個值必須同步，否則 `engines` 會擋住 `.nvmrc`，或下限落後於實際版本。用 Renovate 的 grouping 讓它們進同一個 PR，或加一個 CI 檢查驗證兩者一致。
4. **安全版優先**：安全版 PR 不要被排程延後，也不要被合併進其他 PR。
5. **Vercel 不在自動化範圍**：Vercel 的 Node 版本在 dashboard 設定、只有大版本（`22.x`），小版本由 Vercel 自己維護。PR 描述或票上註明這點，避免誤以為 repo 的版本號等於線上版本。

## Acceptance criteria

- [ ] 有一份設定（Renovate 或等價工具）能對 `.nvmrc` 的 22.x 新版本自動開 PR
- [ ] `.nvmrc` 與 `engines.node` 同步更新，或有 CI 檢查擋住兩者不一致
- [ ] 大版本升級不會被自動開 PR
- [ ] 實際跑出至少一個 PR（可用降一版 `.nvmrc` 的測試分支驗證），再還原
- [ ] 票上記錄 Vercel 不在自動化範圍

## Out of scope

- Node 大版本升級（22 → 24）
- 非 Node 的依賴更新策略（npm 套件、GitHub Actions 版本）。若同一個工具順便處理，另開票決定規則
- 自動 merge

## Comments
