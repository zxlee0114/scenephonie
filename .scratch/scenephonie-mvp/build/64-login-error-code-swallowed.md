# 64 — 登入頁讀不到 Better Auth 的錯誤碼，「不在受邀清單上」永遠顯示不出來

**What to build:** 讓登入頁依照 Better Auth 實際回傳的錯誤碼決定顯示什麼訊息。特別是 allowlist
擋人時，要真的顯示「這個 Google 帳號不在受邀清單上」。

**為什麼壞了：** `src/app/login/google-sign-in.tsx` 把 `errorCallbackURL` 設成
`/login?error=not-allowed`。但 Better Auth 不會換掉這個 query，它會**接在後面**
（`@better-auth/core/utils/url` 的 `appendQueryParams`，由 `api/routes/callback.mjs` 的
`redirectOnError` 呼叫），所以實際網址是：

```text
/login?error=not-allowed&error=<真正的錯誤碼>
```

網址裡有兩個 `error`，Next 的 `searchParams.error` 就是陣列，`src/app/login/page.tsx` 的
`error === "not-allowed"` 永遠不成立，任何失敗都只會顯示通用的「登入沒有完成，請再試一次」。
真正的錯誤碼只留在網址裡。

結果有兩個：

1. **allowlist 的提示其實從來沒顯示過。** 被擋的人只看到「再試一次」，正是登入頁註解要避免的
   「沉默的失敗會讓人以為是 Google 壞了」。
2. **其他錯誤也沒有分類。** 例如 2026-10-07 的 `state_mismatch`（跨 host，見
   [63](./63-canonical-host-redirect.md)），從頁面上完全看不出來，得翻 Vercel log 才知道。

**Blocked by:** 無

**Status:** open

## 開工前要定的事

- **allowlist 被擋時，Better Auth 回的是哪個錯誤碼**：要看 `src/auth/auth.ts` 的 `user.create` hook
  拋的是什麼。如果是 `APIError` 且帶 `body.code`，callback 會用 `redirectOnError(e.body.code, …)`
  原樣傳出；如果不是，就得先讓它帶一個我們認得的 code。用整合測試把實際的 redirect URL 釘死，不要猜。
- **錯誤碼對應到哪些訊息**：原則照登入頁現有的註解，只有說得出原因的才說，其餘不硬猜。
  應該只有「不在受邀清單」這一種要特別講，`state_mismatch` 之類的照樣顯示通用訊息就好。
- `errorCallbackURL` 改成不帶 query 的 `/login`，讓 Better Auth 自己補上唯一的那個 `?error=`。

## 驗收

- [ ] 不在 allowlist 的 Google 帳號登入，會回到 `/login`，顯示「這個 Google 帳號不在受邀清單上」
- [ ] 其他錯誤碼（如 `state_mismatch`）顯示通用訊息
- [ ] `/login?error=a&error=b` 這類多值 query 不會讓頁面拋錯
- [ ] 有測試把「allowlist 拒絕 → redirect URL 帶的 error code」釘住，Better Auth 升版時改了錯誤碼會報錯

## Comments

**開票（2026-10-07）**：跟 [63](./63-canonical-host-redirect.md) 在同一次調查中發現。Vercel log 的
`errorURL: '/login?error=not-allowed'` 加上 `appendQueryParams` 的實作，確認了兩個 `error` 疊在一起的情況。
