# 25 — CI actions 升到 Node 24 runtime（upkeep）

**What to build:** 把 `.github/workflows/ci.yml` 的三個 action 從 Node 20 runtime 的大版本升到目前最新：`actions/checkout@v4 → v7`、`actions/setup-node@v4 → v7`、`pnpm/action-setup@v4 → v6`。

**為什麼是 upkeep、為什麼是現在：** 票券 04 合併時 CI 的 `verify` job 印出：

> Node.js 20 is deprecated. The following actions target Node.js 20 but are being forced to run on Node.js 24: actions/checkout@v4, actions/setup-node@v4, pnpm/action-setup@v4.
> （<https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/>）

這裡講的是 **action 自己的 JS runtime**，與專案編譯／測試用的 Node 無關（那個由 `.nvmrc` ＝ 22 加 `setup-node` 決定，不受影響）。GitHub 目前**強制**把這些 action 提到 Node 24 上跑，所以 CI 現在是綠的、行為正確；警告是預告「移除這層相容墊片之後，還釘在舊 major 的 workflow 會壞」。趁 `main` 乾淨、改動只有一個檔案時處理掉。

**背景 —— 各 action 的 Node 24 分界與本次選版**

| action | 目前 | 首個 Node 24 版 | 本票升到 | 備註 |
|---|---|---|---|---|
| `actions/checkout` | v4 | v5.0.0 | **v7** | v6/v7 的 breaking change 是 `pull_request_target`／`workflow_run` 不再預設 checkout fork PR（新增 `allow-unsafe-pr-checkout`）。本 workflow 用的是 `pull_request`，不受影響。 |
| `actions/setup-node` | v4 | v5.0.0 | **v7** | v7 遷移到 ESM ＋ 相依升級；新增 `cache-primary-key`／`cache-matched-key` outputs。本 workflow 只用 `node-version-file` ＋ `cache`，介面不變。 |
| `pnpm/action-setup` | v4 | v5.0.0（release note 就寫 "Updated the action to use Node.js 24"） | **v6** | v6.0.0 ＝ 支援 pnpm v11，與 `package.json` 的 `packageManager: pnpm@11.9.0` 相配。 |

**要盯的一點：** 本 workflow 刻意**不指定** `version:`，pnpm 版本由 `package.json` 的 `packageManager` 決定（bootstrap 後 self-update）。升版後要確認這個行為沒變 —— 這是這張票唯一有實質風險的地方，驗收看 CI log 裡實際用的 pnpm 版本是不是 `11.9.0`。

**不在這張票內：** `pnpm/action-setup` 的 README 已把使用者導向後繼的 **`pnpm/setup`** action（另一個 repo，目前 v2）。換 action 是獨立決定（inputs 與快取行為都不同），不混進這張只為了 runtime 的 upkeep 票；若之後要換，另開票。

**Blocked by:** 無（與 tracer-bullet 依賴圖無關）

**Status:** ready-for-agent

## 影響檔案

- `.github/workflows/ci.yml` —— 三行 `uses:` 的 tag

## 驗收

- [ ] `verify` job 綠燈，且**不再出現** Node.js 20 deprecation 警告
- [ ] CI log 中 pnpm 版本仍是 `packageManager` 指定的 `11.9.0`（沒有被 action 內建版本蓋掉）
- [ ] `setup-node` 的 pnpm store 快取仍然命中（`cache: pnpm` 行為不變）
- [ ] lint／typecheck／test／build 四關與升版前一致

## Comments

**開票（2026-09-04）** —— 起因：票券 04 的 PR（#30）合併時作者注意到 `verify` job 的 deprecation 警告，確認為 action runtime 而非專案 Node 版本問題。
