# 76 — Node.js 升級到 2026-10-21 安全修補版（22.23.4）

**What to build:** 把 Node 釘到 2026-10-21 安全更新的修補版（22.23.4）：`.nvmrc`、`engines.node`、CI、Vercel 專案設定一致，並驗證實際版本。

**Blocked by:** —

**Status:** verified

## 為什麼

Node.js 在 2026-10-21 發布安全更新（[公告](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)），一次修 10 個 CVE，其中 4 個 High。本專案所有環境都還在受影響版本：

| 環境 | 現況 | 修補版 |
|---|---|---|
| 本機 | v24.12.0 | 24.22.1 |
| CI | `.nvmrc` = `22`（setup-node 取當下最新 22.x，通常自動跟上，但要驗證） | 22.23.4 |
| Vercel | `apps/web` 專案設定的 Node 版本（未在 repo 內，需到 dashboard 確認） | 22.x 最新 |
| `engines` | `>=22`（沒有下限保證，擋不到未修補版） | — |

### 與本專案相關的 CVE（22.x 受影響 7 個，24.x 受影響 9 個）

| CVE | 嚴重度 | 說明 |
|---|---|---|
| CVE-2026-111497 | High | Brotli decoder 在無效 block switch 時越界寫入，可導致 crash／記憶體洩漏／RCE（`node:zlib`） |
| CVE-2026-106069 | High | 前導 0 的 IPv4（`0127.0.0.1`）TLS 檢查當八進位、OS resolver 當十進位，可能驗到錯的憑證 |
| CVE-2026-105482 | High | `dns.resolve*()`／`dns.reverse()` 遇到含 NUL byte 的 hostname 會靜默截斷 |
| CVE-2026-105483 | High | `tls.checkServerIdentity()` 把全形數字 IPv4 當 DNS name（**僅 24.x／26.x**，22.x 不受影響） |
| CVE-2026-105481 | Medium | keep-alive socket 可能接受「早於 request 送出」的 response |
| CVE-2026-106072 | Medium | 非標準 IPv4 寫法（`127.1`）讓只有 DNS SAN 的憑證通過 IP endpoint 驗證 |
| CVE-2026-106074 | Medium | snapshot／SEA 內的 `randomUUID()`／`randomInt()` cache 導致每個 process 重複同樣的值 |
| CVE-2026-106073 | Low | `--permission` 下 `fs.realpathSync()` 缺讀取權限檢查 |

另兩個 Low（CVE-2026-106070、-106071）只影響 26.x，與本專案無關。

### 實際暴露面評估

- repo 內沒有直接呼叫 `node:zlib`／`dns`／`tls.checkServerIdentity`／`--permission`（`apps/web/scripts/fonts/` 的 brotli 命中是 Python 字型腳本，不是 Node）。
- **間接暴露仍在**：Next.js server 對外 fetch（undici）會解 Brotli response，也會做 TLS 驗證；Brotli RCE 的攻擊面是「我們去連的上游回了惡意 body」。所以不能因為沒直接用就跳過。
- 這次公告同時更新了 undici、OpenSSL、c-ares 與 CA bundle。
- 近期其他 2026 公告（3/24、6/18、7/29）若尚未跟上，升到 22.23.4 會一併涵蓋；22.x 受影響的 CVE 以最新版為準。

## 做法

1. **確認基準線**：到 Vercel dashboard（Project Settings → Build & Deployment → Node.js Version）記下目前版本；若不是 22.x，改成 22.x。Vercel 的 22.x 是否已含 22.23.4 要看其 runtime 更新，記下實際版本（可在 build log 或 `process.version` 驗證）。
2. **本機**：升到 22.23.4（或 24.22.1，二擇一；建議跟 CI／Vercel 一致用 22 LTS 線，避免「本機 24、線上 22」的行為差異）。
3. **`.nvmrc`**：從 `22` 改釘 `22.23.4`，讓 CI 與本機不會悄悄落在未修補版。之後的安全版由 Renovate／手動票推進。
4. **`engines.node`**：`>=22` 改成 `>=22.23.4`，擋住裝在未修補版的環境。
5. **`@types/node`**：`apps/web/package.json` 目前 `^22.10.2`，確認 lockfile 解到 22.x 最新即可，不需追安全版號。
6. **驗證**：`pnpm install --frozen-lockfile`、`pnpm lint`、`pnpm test`、`pnpm build` 全過；CI 綠燈；Preview deploy 後開一個專案頁與一個 share link 走過一次。
7. 若 Vercel 的 22.x 尚未含 22.23.4，在票上留註記並設定追蹤，不要因此卡住 1–4。

## 驗收

- [x] 本機、CI、Vercel 三處 `node -v`／`process.version` 皆 ≥ 22.23.4（或 24.22.1），並在票上貼出三處實際版本
  - 本機：`v22.23.4`（repo 內 `nvm use`）；全域預設已升 24.22.1
  - CI：`22.23.4`（Actions `setup-node` log）
  - Vercel：專案設定與 Production 部署 `nodeVersion: 22.x`。Vercel API／build log 只給大版本，小版本由 Vercel 在 22.x 內維護，無法由我方直接驗證
- [x] `.nvmrc` 與 `engines.node` 的下限都是 22.23.4
- [x] `pnpm lint && pnpm test && pnpm build` 通過，CI 綠
- [x] Preview deploy 手動走過核心流程無異常（2026-10-25 作者在重新部署後的 Production 驗過）
- [x] 若 Vercel 版本落後，已記錄預期時程（merge 時 Production 仍是 24.x，因專案設定在部署之後才改；已改為 22.x 並重新部署 Production，新部署確認 `22.x`）

## 不做

- 升級到 Node 24／26 大版本（另開票評估）
- 導入 Renovate／Dependabot 的 Node 版本自動更新（可另開一張，建議做）
- 非 Node 的依賴漏洞（`pnpm audit` 另案）

## Comments

### 實作紀錄（分支 `ticket-31-nodejs-security-update`）

- `.nvmrc`：`22` → `22.23.4`；`engines.node`：`>=22` → `>=22.23.4`；README 需求文字同步。
- 本機（nvm 22.23.4）驗證：`pnpm install --frozen-lockfile`、`lint`、`typecheck`、`test`（78 檔通過、14 檔 skipped，929 tests passed）、`build` 全過。
- 本機預設 nvm alias 仍是 24.12.0（未修補）。在 repo 內 `nvm use` 會切到 22.23.4；全域預設需自行 `nvm alias default 22.23.4`。
- 驗收收尾：PR #99 merge 後發現 Vercel 專案 Node.js Version 原為 24.x，與 CI／本機的 22 不一致；改為 22.x 並 `vercel redeploy` Production，API 確認 `nodeVersion: 22.x`，核心流程手動驗過。

編號：開票時放在 `issues/`、編為 31（PR #99 與當時的 commit 以「票 31」稱呼）；2026-10-25 搬到 `build/` 改編 76，因 `build/31` 已被占用。
