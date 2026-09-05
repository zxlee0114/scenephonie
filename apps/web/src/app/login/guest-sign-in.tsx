"use client";

import { useTransition } from "react";

import { enterAsGuestAction } from "./actions";

/**
 * 第二道門（票券 24 §6）：**不放公開帳密**，因為那會把剛否決的密碼從後門放回來。
 *
 * 點下去會拿到自己的使用者身分與自己的一份範例稿 —— 不是共用帳號。文案要說清楚
 * 「這一份是你的、可以隨便改」，否則體驗的人會以為自己在動別人的東西而不敢下手。
 *
 * 排在 Google 之後、視覺上次一階：v1 的正式入口只有一個，訪客入口是給還沒有帳號的人看的。
 */
export function GuestSignIn() {
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        className="sign-in__guest"
        disabled={pending}
        onClick={() => startTransition(() => enterAsGuestAction())}
      >
        {pending ? "準備範例劇本…" : "以訪客身分體驗"}
      </button>
      <p className="sign-in__note">訪客會拿到一份自己的範例劇本，可以隨意修改；閒置七天後自動清除。</p>
    </>
  );
}
