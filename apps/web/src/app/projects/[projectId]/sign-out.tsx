"use client";

import { useRouter } from "next/navigation";

import { authClient } from "@/auth/auth-client";

/** 登出。session 是 DB session，所以這一下是真的把那一列作廢，不是只丟掉 cookie。 */
export function SignOut() {
  const router = useRouter();

  return (
    <button
      type="button"
      className="project-hub__sign-out"
      onClick={() => {
        void authClient.signOut().then(() => router.replace("/login"));
      }}
    >
      登出
    </button>
  );
}
