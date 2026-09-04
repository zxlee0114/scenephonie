import { redirect } from "next/navigation";

import { currentUserId } from "@/authorization";

// route handler／server component 必須連得到 Postgres —— 不可 edge-only（§13.1）。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 站台入口。登入了就去自己的專案，沒登入就去登入頁。
 *
 * v1 沒有行銷首頁 —— 使用者只有清單上那幾個人，他們要的是稿子不是介紹。
 */
export default async function HomePage() {
  redirect((await currentUserId()) ? "/projects" : "/login");
}
