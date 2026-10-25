import type { CreatedProject, ProjectDraft } from "./project-store";

/**
 * 「建立一個專案」這個能力的形狀 —— **建立精靈手上那個函式**（票券 71）。
 *
 * 精靈拿到的是這個型別的一個函式（由頁面從 server action 注入），不是 project-store 本身 ——
 * 同 `editor/save-capability.ts`：這個檔案沒有任何執行期相依，精靈、server action、頁面三邊都 import 得起。
 *
 * `signed-out` 是 server action 那一層加上去的（session 過期）；`failed` 不分原因 —— 精靈對每一種都是
 * 同一個處置：停在第三步、草稿還在、可以再按一次。
 */
export type CreateProjectOutcome = ({ status: "created" } & CreatedProject) | { status: "signed-out" | "failed" };

export type CreateProject = (draft: ProjectDraft) => Promise<CreateProjectOutcome>;
