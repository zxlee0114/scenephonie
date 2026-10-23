import { NOT_INVITED_ERROR } from "@/auth/allowlist";

/**
 * 登入沒有完成時，登入頁要說哪一種話。
 *
 * 只有 allowlist 那一種失敗說得出原因；其餘（使用者按取消、Google 端出錯、`state_mismatch`…）
 * 不硬猜，否則會把「你被拒絕了」栽贓給一個只是點錯的人。
 */
export type SignInFailure = "uninvited" | "generic";

/**
 * `?error=` 的值 → 要說的話。沒有錯誤回 `null`。
 *
 * 收 `string[]` 是因為網址裡可以有好幾個 `error`（Next 會給陣列）—— 票券 64 之前
 * `errorCallbackURL` 自己帶了一個、Better Auth 又接一個，`=== "..."` 就永遠不成立。
 * 現在網址只該有一個，但頁面不該因為多一個 query 就說錯話或拋錯。
 */
export function signInFailure(error: string | string[] | undefined): SignInFailure | null {
  const codes = [error ?? []].flat().filter((code) => code.length > 0);
  if (codes.length === 0) return null;
  return codes.includes(NOT_INVITED_ERROR) ? "uninvited" : "generic";
}
