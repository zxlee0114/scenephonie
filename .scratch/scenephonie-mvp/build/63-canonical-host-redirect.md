# 63 — 非正式網域一律轉到 `BETTER_AUTH_URL` 的 host（upkeep）

**What to build:** 請求的 host 跟 `BETTER_AUTH_URL` 的 host 不同時，用 308 轉到同一個 path、query，
只換 host。這樣不管從哪個 Vercel 網址進站，Google 登入都從同一個網域出發，也在同一個網域收尾。

**為什麼：** 2026-10-07 在 production 連續兩次 Google 登入失敗。Vercel log 顯示同一次登入跨了兩個 host：

| 請求 | host |
|---|---|
| `POST /api/auth/sign-in/social`（Better Auth 在這裡設簽章過的 `state` cookie） | `web-ten-sigma-x8upro1…`（從 Vercel dashboard 點進去的 deployment 網址） |
| `GET /api/auth/callback/google`（在這裡讀那顆 cookie） | `scenephonie-zxlee0114…`（`BETTER_AUTH_URL`，Google redirect URI 也指向這裡） |

cookie 只屬於設它的那個網域，callback 讀不到，結果就是
`State mismatch: State not persisted correctly`（`state_security_mismatch`，
`better-auth/dist/state.mjs` 的 database state 策略）。失敗後使用者被導回 `BETTER_AUTH_URL` 的
`/login`，再試一次就成功了，所以看起來像是「偶爾失敗」。

`authClient`（`src/auth/auth-client.ts`）沒有設 `baseURL`，打的是同源的 `/api/auth/*`，所以 cookie
落在使用者當下開的網域。

**前置（不在本票的程式碼裡，屬於 dashboard 設定）：** 先在 Vercel 定一個固定的 production 網域，
把 `BETTER_AUTH_URL` 和 Google OAuth 的 redirect URI 都指向它，再 redeploy。本票只是補一道保險，
讓人誤點 deployment 網址時也不會踩到這個問題。

**Blocked by:** 無

**Status:** open

## 開工前要定的事

- **放在哪裡**：`src/proxy.ts` 目前的 `matcher` 只有 `/projects/:path*`，canonical redirect 要掛在
  所有頁面上。可以有兩種做法：
  1. 擴大 `proxy.ts` 的 matcher，但 session 檢查仍只對 `/projects` 做。這樣檔頭那句「刪掉這個檔案，
     安全性一點都不會變」還是成立，因為 host redirect 也不是授權。
  2. 改用 `vercel.json` / `next.config.ts` 的 `redirects`（以 `has: host` 判斷）。可是 host 是動態的
     deployment 網址，靜態規則不好寫。
- **preview deployment**：照這個規則，preview 也會被轉去 production。要嘛接受這件事
  （preview 本來就沒辦法跑 Google 登入，因為 redirect URI 不會涵蓋每個 preview 網址），
  要嘛只在 `VERCEL_ENV === "production"` 時才轉。
- **本機**：`localhost:3000` 跟 `BETTER_AUTH_URL` 一致，不受影響。但要確認沒設 `BETTER_AUTH_URL`
  時是「不轉」，而不是讓整個 proxy 拋錯。

## 驗收

- [ ] 從 deployment 網址（非 `BETTER_AUTH_URL` host）開任何頁面，都會 308 轉到同一個 path 的正式 host，query 保留
- [ ] 從 deployment 網址出發的 Google 登入，第一次就成功
- [ ] `/api/auth/*` 的行為不變（callback 本來就在正式 host 上）
- [ ] preview 的處理方式符合開工前的決定
- [ ] 沒設 `BETTER_AUTH_URL` 時不轉、不拋錯
- [ ] 有測試蓋住「host 不同 → 308、host 相同 → 放行」

## Comments

**開票（2026-10-07）**：起因是 PR #73（RLS）那個 session 裡，使用者回報部署環境的 Google 登入
「第一次失敗、重試成功」。從 Vercel log 判斷是跨 host，已排除 Supabase Data API 關閉的影響，
因為 callback 時 `verifications` 那一列有找到，缺的是瀏覽器那顆 cookie。另一張票
[64](./64-login-error-code-swallowed.md) 處理的是同一次調查發現的錯誤碼被吞掉的問題。
