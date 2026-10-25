/**
 * 專案儀表板的三區（票券 72）：主區、「已封存（N）」、「已刪除（N）」。
 *
 * 後兩區是**預設收起的 `<details>`，數量是 0 就不出現** —— 這兩區很少去、而且通常是空的，新使用者
 * 根本不會看到這兩個概念。有東西時就在同一頁：還原或取消封存之後，卡片從一區換到另一區，看得到它去哪了。
 *
 * 封存與刪除都不先問「確定嗎？」，做完跳「復原」提示 —— **只有一個例外**：要刪的專案還有生效中的分享連結。
 * 那是唯一的外部後果（製作方正開著的活連結會突然變成「已停用」），所以先在頁內確認，而且確認框有具體的話
 * 可以說：「2 條分享連結會立即停用」。封存不碰連結，永遠不問。
 *
 * 寫入是注入的（頁面 bind 好的 server action）—— 這個元件只在做完時 `refresh`，讓伺服器那份三區重新說話。
 */
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPortal } from "react-dom";

import { cardMeta } from "@/documents/document-card";
import { UndoToast } from "@/ui/undo-toast";

import { CardMenu } from "./card-menu";
import { ProjectCard } from "./project-card";
import type { ProjectSummary } from "./project-store";
import { PROJECT_RETENTION_DAYS, purgeCountdown, type DashboardShelves } from "./retention";

/** 每一支都回答「做成了沒」；沒做成（斷線、沒有權限）畫面就不說它做到了。 */
export type ShelfActions = {
  archive: (projectId: string) => Promise<boolean>;
  unarchive: (projectId: string) => Promise<boolean>;
  remove: (projectId: string) => Promise<boolean>;
  restore: (projectId: string) => Promise<boolean>;
};

/** 卡片在哪一區。藏起來的鍵帶著它：refresh 之後同一張卡會出現在另一區，那裡不該跟著被藏。 */
type Shelf = "active" | "archived" | "deleted";

/** 剛做完、還能「復原」的那一件。 */
type Undoable = {
  message: string;
  byKeyboard: boolean;
  /** 那張卡原本在哪（藏起來的鍵）。 */
  key: string;
  undo: () => Promise<boolean>;
};

/** 等著確認的刪除。 */
type PendingDelete = { project: ProjectSummary; shelf: Shelf; byKeyboard: boolean };

export function ProjectShelves({
  shelves,
  now,
  actions,
}: {
  shelves: DashboardShelves;
  /** 算倒數用的「現在」—— 由伺服器給，hydration 時兩邊才算出同一個字。 */
  now: Date;
  actions: ShelfActions;
}) {
  const router = useRouter();
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [undoable, setUndoable] = useState<Undoable | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  const keyOf = (shelf: Shelf, project: ProjectSummary) => `${shelf}:${project.projectId}`;

  const setVisible = (key: string, visible: boolean) =>
    setHidden((current) => {
      const next = new Set(current);
      if (visible) next.delete(key);
      else next.add(key);
      return next;
    });

  /** 做一件會讓卡片離開這一區的事：先藏起來，沒做成就放回來；做完都 refresh。 */
  const move = async (key: string, run: () => Promise<boolean>): Promise<boolean> => {
    setVisible(key, false);
    const done = await run();
    if (!done) setVisible(key, true);
    router.refresh();
    return done;
  };

  const archive = async (project: ProjectSummary, byKeyboard: boolean) => {
    const key = keyOf("active", project);
    if (await move(key, () => actions.archive(project.projectId))) {
      setUndoable({ message: `已封存「${project.title}」`, byKeyboard, key, undo: () => actions.unarchive(project.projectId) });
    }
  };

  const remove = async ({ project, shelf, byKeyboard }: PendingDelete) => {
    setPendingDelete(null);
    const key = keyOf(shelf, project);
    if (await move(key, () => actions.remove(project.projectId))) {
      setUndoable({ message: `已刪除「${project.title}」`, byKeyboard, key, undo: () => actions.restore(project.projectId) });
    }
  };

  const askToRemove = (pending: PendingDelete) => {
    if (pending.project.liveShareLinks > 0) setPendingDelete(pending);
    else void remove(pending);
  };

  const undo = async ({ key, undo }: Undoable) => {
    setUndoable(null);
    if (await undo()) setVisible(key, true);
    router.refresh();
  };

  const edited = (project: ProjectSummary) => `最後編輯 ${cardMeta({ updatedAt: project.lastEditedAt })}`;
  const shown = (shelf: Shelf) => (project: ProjectSummary) => !hidden.has(keyOf(shelf, project));

  return (
    <>
      <section className="project-hub__section" aria-label="專案">
        {shelves.active.length > 0 ? (
          <ul className="hub-cards">
            {shelves.active.filter(shown("active")).map((project) => (
              <ProjectCard
                key={project.projectId}
                href={`/projects/${project.projectId}`}
                meta={edited(project)}
                action={
                  <CardMenu
                    title={project.title}
                    rows={[
                      { label: "封存", run: (byKeyboard) => void archive(project, byKeyboard) },
                      { label: "刪除", run: (byKeyboard) => askToRemove({ project, shelf: "active", byKeyboard }) },
                    ]}
                  />
                }
                {...project}
              />
            ))}
          </ul>
        ) : (
          <p className="project-hub__empty">還沒有專案。按「建立專案」開始第一部。</p>
        )}
      </section>

      {shelves.archived.length > 0 && (
        <details className="project-hub__section dashboard__shelf">
          <summary className="project-hub__heading">已封存（{shelves.archived.length}）</summary>
          <ul className="hub-cards">
            {shelves.archived.filter(shown("archived")).map((project) => (
              <ProjectCard
                key={project.projectId}
                href={`/projects/${project.projectId}`}
                meta={edited(project)}
                action={
                  <CardMenu
                    title={project.title}
                    rows={[
                      {
                        label: "取消封存",
                        run: () => void move(keyOf("archived", project), () => actions.unarchive(project.projectId)),
                      },
                      { label: "刪除", run: (byKeyboard) => askToRemove({ project, shelf: "archived", byKeyboard }) },
                    ]}
                  />
                }
                {...project}
              />
            ))}
          </ul>
        </details>
      )}

      {shelves.deleted.length > 0 && (
        <details className="project-hub__section dashboard__shelf">
          <summary className="project-hub__heading">已刪除（{shelves.deleted.length}）</summary>
          <ul className="hub-cards">
            {shelves.deleted.filter(shown("deleted")).map((project) => (
              <ProjectCard
                key={project.projectId}
                meta={purgeCountdown(project.deletedAt!, now)}
                action={
                  <button
                    type="button"
                    className="hub-card__action dashboard__restore"
                    aria-label={`還原「${project.title}」`}
                    onClick={() => void move(keyOf("deleted", project), () => actions.restore(project.projectId))}
                  >
                    還原
                  </button>
                }
                {...project}
              />
            ))}
          </ul>
        </details>
      )}

      {pendingDelete && (
        <ConfirmDelete
          pending={pendingDelete}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void remove(pendingDelete)}
        />
      )}

      {undoable &&
        createPortal(
          <UndoToast
            key={undoable.key}
            message={undoable.message}
            takeFocus={undoable.byKeyboard}
            onUndo={() => void undo(undoable)}
            onExpire={() => setUndoable(null)}
          />,
          document.body,
        )}
    </>
  );
}

/**
 * 要刪的專案還有生效中的分享連結時，頁內的確認（不是瀏覽器原生 dialog）。焦點先落在「取消」：
 * 不小心連按 Enter 的結果應該是什麼都沒發生。
 */
function ConfirmDelete({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: PendingDelete;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { title, liveShareLinks } = pending.project;
  return (
    <div className="creator__scrim">
      <div
        className="creator dashboard__confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dashboard-confirm-title"
        aria-describedby="dashboard-confirm-body"
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
      >
        <p id="dashboard-confirm-title" className="creator__title">
          刪除「{title}」？
        </p>
        <p id="dashboard-confirm-body">
          {liveShareLinks} 條分享連結會立即停用。{PROJECT_RETENTION_DAYS} 天內可以從「已刪除」還原，連結也會跟著恢復。
        </p>
        <div className="creator__actions">
          <button type="button" autoFocus onClick={onCancel}>
            取消
          </button>
          <button type="button" className="creator__danger" onClick={onConfirm}>
            刪除
          </button>
        </div>
      </div>
    </div>
  );
}
