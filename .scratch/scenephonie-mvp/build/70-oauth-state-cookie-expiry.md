# 70 — Google 登入超過 5 分鐘才回來，就只會看到「請再試一次」

**What to build:** 第一次用 Google 登入的人，如果在 Google 那邊花了超過 5 分鐘（輸帳號密碼、兩步驟驗證、
按同意），回到我們這邊時不應該莫名其妙地失敗。要嘛讓這段時間夠長，要嘛失敗時說得出原因。

**Blocked by:** 無

**Status:** needs-triage

## 為什麼

票 64 驗收時踩到：在訪客視窗登入另一個 Google 帳號，回來是 `/login?error=state_mismatch`，dev server log：

```text
ERROR [Better Auth]: Failed to parse state [Error [BetterAuthError]: State mismatch: State not persisted correctly] {
  code: 'state_security_mismatch', ... errorURL: '/login'
}
```

原因在 Better Auth 1.7.2 的 database state 策略（我們有設 `database`，所以預設就是它，`dist/state.mjs`）：

| 東西 | 壽命 |
|---|---|
| 簽章過的 `better-auth.state` cookie（`createAuthCookie("state", { maxAge: 300 })`） | **5 分鐘**，寫死 |
| `verifications` 表裡那筆 state | 10 分鐘 |

5 到 10 分鐘之間回來，DB 找得到 state、cookie 卻已經沒了，就會丟出 `state_security_mismatch`。這個錯誤碼
再被換成 `state_mismatch` 傳回 `/login`，登入頁顯示的是通用訊息「登入沒有完成，請再試一次」。
再試一次就會成功，所以看起來像是「偶爾失敗」，跟 [63](./63-canonical-host-redirect.md) 的症狀一模一樣，
從畫面上分不出來是哪一種。

會花超過 5 分鐘的，正好是**第一次登入的受邀者**：這台瀏覽器還沒登過那個 Google 帳號，而且第一次會看到
同意畫面。

## 開工前要定的事

- **改壽命，還是改訊息，還是兩個都做**：
  1. `account.storeStateStrategy: "cookie"`：state 加密存在 cookie 裡，cookie 跟 state 都是 10 分鐘
     （`state.mjs` 的 `oauth_state`，`maxAge: 600`）。代價是 `verifications` 表不再存 OAuth state；
     要確認有沒有別的東西依賴它（例如 `anonymous` plugin、日後的 account linking）。
  2. `skipStateCookieCheck: true`：**不考慮**。那顆 cookie 就是 OAuth 的 CSRF 防護，文件也標了 ⚠︎。
  3. 登入頁對 `state_mismatch` 說得具體一點（「登入花了太久，請再按一次」）。但同一個錯誤碼也會在跨 host
     （63）、按了兩次按鈕時出現，不一定是「太久」，要照票 64 的原則判斷說不說得出原因。
- **10 分鐘夠不夠**：如果改成 cookie 策略，壽命還是寫死的，只是比較長。真的不夠就只能靠第 3 點。
- **怎麼釘住**：可以沿用票 64 的 `google-callback.integration.test.ts`，用 fake timers 讓時間走過 5 分鐘，
  確認還是能走到 token 交換（假 code 會停在 `invalid_code`，代表 state 那關過了）。

## 驗收

（定完上面再寫）

## Comments

**開票（2026-10-23）**：票 64 瀏覽器驗收時發現。第一次試失敗，先到 accounts.google.com 登好帳號再走流程就成功，
差別只在花了多久。
