/**
 * 建立精靈（票券 71）：專案儀表板上的「建立專案」與它打開的那個彈窗。
 *
 * 三步：**名稱**（專案名稱、劇本名稱都必填）→ **文件**（故事大綱／分場大綱兩個頁籤）→ **確認**
 * （進入專案頁／直接撰寫劇本）。走完最後那一下才一次建好專案、劇本與兩份大綱；在那之前資料庫裡
 * 什麼都沒有，中途留下的只有本機草稿（`./creation-draft`），下次按「建立專案」時問要不要接著做。
 *
 * **只有真的會丟東西時才問。** 草稿存得進去，×、取消、Esc、上一頁、重新整理、關分頁一律不問 ——
 * 什麼都沒丟；存不進去才問，並請瀏覽器在離開前攔一下。點彈窗外面不關：多步表單最常見的誤觸，
 * 而沒有人用點背景來表達「我不要了」。
 *
 * 純彈窗、沒有網址：重新整理等於關閉，進度靠草稿接回，不靠網址。
 *
 * 建立是注入的（`create`）—— 這個元件不認識路由層，同 `DocumentEditor` 的存檔。
 */
"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { documentFromJSON, wordCount } from "@scenephonie/schema";

import { writtenSoFar } from "@/documents/document-card";
import { DocumentEditor } from "@/documents/document-editor";
import { documentLabel } from "@/documents/labels";
import type { PersistedDoc } from "@/persistence";

import type { CreateProject } from "./create-capability";
import {
  blankCreationDraft,
  creationDraftStore,
  type CreationDraft,
  type OutlineTab,
  type SavedCreationDraft,
} from "./creation-draft";

import "../styles/documents.css";

type View = { name: "closed" } | { name: "restore"; saved: SavedCreationDraft } | { name: "wizard" };

/** 頁籤對到草稿上的哪一份。 */
const OUTLINE_FIELD = { 交件大綱: "submissionOutline", 分場大綱: "sceneOutline" } as const;
const TABS: OutlineTab[] = ["交件大綱", "分場大綱"];

export function ProjectCreator({ userId, create }: { userId: string; create: CreateProject }) {
  const router = useRouter();
  const store = useRef(creationDraftStore(userId)).current;
  const [view, setView] = useState<View>({ name: "closed" });
  const [draft, setDraft] = useState<CreationDraft>(blankCreationDraft);
  // 編輯器的 `onUpdate` 在它建立時就綁定了 —— 交給它的回呼要讀得到**最新**的草稿，不是建立當下那一份。
  const latest = useRef(draft);
  /** 草稿現在是不是不會丟（存進去了，或根本沒東西）。 */
  const [kept, setKept] = useState(true);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  const change = useCallback(
    (patch: Partial<CreationDraft>) => {
      const next = { ...latest.current, ...patch };
      latest.current = next;
      setDraft(next);
      setKept(store.save(next));
    },
    [store],
  );

  const start = (from: CreationDraft) => {
    latest.current = from;
    setDraft(from);
    setKept(true);
    setConfirmingDiscard(false);
    setView({ name: "wizard" });
  };

  const openCreator = () => {
    const saved = store.load();
    if (saved) setView({ name: "restore", saved });
    else start(blankCreationDraft());
  };

  const close = () => {
    setConfirmingDiscard(false);
    setView({ name: "closed" });
  };

  /** ×、取消建立、Esc。草稿存得進去就直接關（下次問要不要接著做）；存不進去先問。 */
  const requestClose = () => {
    if (kept) close();
    else setConfirmingDiscard(true);
  };

  // 存不進去的時候，關分頁、重新整理、上一頁離開網站也要攔一下 —— 那是瀏覽器自己的那個「確定要離開？」。
  const unprotected = view.name === "wizard" && !kept;
  useEffect(() => {
    if (!unprotected) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unprotected]);

  return (
    <>
      <button type="button" className="dashboard__create" onClick={openCreator}>
        建立專案
      </button>
      {view.name !== "closed" && (
        // 點外面不關：故意沒有 onMouseDown（見檔頭）。
        <div className="creator__scrim">
          <div
            className="creator"
            role="dialog"
            aria-modal="true"
            aria-labelledby="creator-title"
            onKeyDown={(event) => {
              if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
              event.stopPropagation();
              if (view.name === "restore") close();
              else requestClose();
            }}
          >
            {view.name === "restore" ? (
              <RestorePrompt
                saved={view.saved}
                resume={() => start(view.saved)}
                restart={() => {
                  store.clear();
                  start(blankCreationDraft());
                }}
                close={close}
              />
            ) : (
              <Wizard
                draft={draft}
                change={change}
                kept={kept}
                requestClose={requestClose}
                create={async (destination) => {
                  const { creationId, projectTitle, screenplayTitle, sameName, submissionOutline, sceneOutline } =
                    latest.current;
                  const outcome = await create({
                    creationId,
                    projectTitle,
                    screenplayTitle: sameName ? projectTitle : screenplayTitle,
                    submissionOutline,
                    sceneOutline,
                  });
                  if (outcome.status === "signed-out") {
                    // 草稿留著：重新登入之後同一個人按「建立專案」就接得回來。
                    router.push("/login");
                    return true;
                  }
                  if (outcome.status !== "created") return false;
                  store.clear();
                  const hub = `/projects/${outcome.projectId}`;
                  router.push(destination === "hub" ? hub : `${hub}/screenplays/${outcome.screenplayId}`);
                  return true;
                }}
              />
            )}
            {confirmingDiscard && (
              <div className="creator__discard" role="alertdialog" aria-labelledby="creator-discard-title">
                <p id="creator-discard-title">要捨棄目前填的內容嗎？這台瀏覽器存不了草稿，關掉就找不回來。</p>
                <div className="creator__actions">
                  <button type="button" autoFocus onClick={() => setConfirmingDiscard(false)}>
                    繼續填
                  </button>
                  <button type="button" className="creator__danger" onClick={close}>
                    捨棄
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function RestorePrompt({
  saved,
  resume,
  restart,
  close,
}: {
  saved: SavedCreationDraft;
  resume: () => void;
  restart: () => void;
  close: () => void;
}) {
  const name = saved.projectTitle.trim() || "未命名";
  return (
    <>
      <Header title="建立專案" close={close} />
      <p className="creator__lede">
        上次沒完成的「{name}」（{timeAgo(saved.savedAt)}），要接著做嗎？
      </p>
      <div className="creator__actions">
        <button type="button" onClick={restart}>
          重新開始
        </button>
        <button type="button" className="creator__primary" autoFocus onClick={resume}>
          接著做
        </button>
      </div>
    </>
  );
}

function Wizard({
  draft,
  change,
  kept,
  requestClose,
  create,
}: {
  draft: CreationDraft;
  change: (patch: Partial<CreationDraft>) => void;
  kept: boolean;
  requestClose: () => void;
  /** @returns 這一下有沒有結果（建好了、或要去重新登入）；`false` ＝ 沒建成，留在這一步。 */
  create: (destination: "hub" | "editor") => Promise<boolean>;
}) {
  const [showNameErrors, setShowNameErrors] = useState(false);
  const [submitting, setSubmitting] = useState<"hub" | "editor" | null>(null);
  const [failed, setFailed] = useState(false);

  const screenplayTitle = draft.sameName ? draft.projectTitle : draft.screenplayTitle;
  const missingProject = !draft.projectTitle.trim();
  const missingScreenplay = !screenplayTitle.trim();

  const submit = async (destination: "hub" | "editor") => {
    setSubmitting(destination);
    setFailed(false);
    const done = await create(destination);
    // 建好了就維持鎖住 —— 接下來是換頁，不該還按得到。
    if (!done) {
      setSubmitting(null);
      setFailed(true);
    }
  };

  const footer = (children: ReactNode) => (
    <>
      {!kept && <p className="creator__unsaved">這台瀏覽器存不了草稿，關閉之後填的內容就會不見。</p>}
      <div className="creator__actions">{children}</div>
    </>
  );

  return (
    <>
      <Header title="建立專案" step={draft.step} close={requestClose} />

      {draft.step === 1 && (
        <form
          className="creator__names"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (missingProject || missingScreenplay) setShowNameErrors(true);
            else change({ step: 2 });
          }}
        >
          <NameField
            id="creator-project-title"
            label="專案名稱"
            value={draft.projectTitle}
            onChange={(projectTitle) => change({ projectTitle })}
            error={showNameErrors && missingProject ? "請填專案名稱" : undefined}
            autoFocus
          />
          <NameField
            id="creator-screenplay-title"
            label="劇本名稱"
            value={screenplayTitle}
            readOnly={draft.sameName}
            onChange={(screenplayTitle) => change({ screenplayTitle })}
            error={showNameErrors && missingScreenplay ? "請填劇本名稱" : undefined}
          />
          <label className="creator__same">
            <input
              type="checkbox"
              checked={draft.sameName}
              // 取消勾選時把當下看到的字留給劇本名稱 —— 接著改，不是從頭打。
              onChange={(event) =>
                change({
                  sameName: event.target.checked,
                  screenplayTitle: draft.sameName ? draft.projectTitle : draft.screenplayTitle,
                })
              }
            />
            與專案名稱相同
          </label>
          {footer(
            <button type="submit" className="creator__primary">
              下一步
            </button>,
          )}
        </form>
      )}

      {draft.step === 2 && (
        <>
          <div className="creator__tabs" role="tablist" aria-label="文件">
            {TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                id={`creator-tab-${tab}`}
                aria-selected={draft.tab === tab}
                aria-controls="creator-tab-panel"
                className="creator__tab"
                onClick={() => change({ tab })}
              >
                {documentLabel(tab)}
              </button>
            ))}
          </div>
          <div className="creator__panel" role="tabpanel" id="creator-tab-panel" aria-labelledby={`creator-tab-${draft.tab}`}>
            <DocumentEditor
              // 換頁籤就換一個編輯器：每一份的內文從草稿上接回來。
              key={draft.tab}
              kind={draft.tab}
              initialBody={draft[OUTLINE_FIELD[draft.tab]]}
              onDraftChange={(body) => change({ [OUTLINE_FIELD[draft.tab]]: body })}
            />
          </div>
          {footer(
            <>
              <button type="button" onClick={() => change({ step: 1 })}>
                上一步
              </button>
              <button type="button" className="creator__primary" onClick={() => change({ step: 3 })}>
                下一步
              </button>
            </>,
          )}
        </>
      )}

      {draft.step === 3 && (
        <>
          <dl className="creator__summary">
            <dt>專案名稱</dt>
            <dd>{draft.projectTitle.trim()}</dd>
            <dt>劇本名稱</dt>
            <dd>{screenplayTitle.trim()}</dd>
            {TABS.map((tab) => (
              <SummaryCount key={tab} kind={tab} body={draft[OUTLINE_FIELD[tab]]} />
            ))}
          </dl>
          {failed && (
            <p className="creator__error" role="alert">
              專案沒有建立成功。填的內容都還在，可以再按一次。
            </p>
          )}
          {footer(
            <>
              <button type="button" disabled={submitting !== null} onClick={() => change({ step: 2 })}>
                上一步
              </button>
              <button type="button" disabled={submitting !== null} onClick={requestClose}>
                取消建立
              </button>
              <span className="creator__spacer" />
              <button type="button" disabled={submitting !== null} onClick={() => void submit("hub")}>
                {submitting === "hub" ? "建立中…" : "進入專案頁"}
              </button>
              <button
                type="button"
                className="creator__primary"
                disabled={submitting !== null}
                onClick={() => void submit("editor")}
              >
                {submitting === "editor" ? "建立中…" : "直接撰寫劇本"}
              </button>
            </>,
          )}
        </>
      )}
    </>
  );
}

function Header({ title, step, close }: { title: string; step?: number; close: () => void }) {
  return (
    <div className="creator__head">
      <h2 id="creator-title" className="creator__title">
        {title}
      </h2>
      {step !== undefined && <span className="creator__step">{step} / 3</span>}
      <button type="button" className="creator__close" aria-label="關閉" onClick={close}>
        ×
      </button>
    </div>
  );
}

function NameField({
  id,
  label,
  value,
  onChange,
  error,
  readOnly = false,
  autoFocus = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  readOnly?: boolean;
  autoFocus?: boolean;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="creator__field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={value}
        readOnly={readOnly}
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && (
        <p id={errorId} className="creator__field-error">
          {error}
        </p>
      )}
    </div>
  );
}

/** 摘要裡的一份大綱寫了多少（同 hub 卡片）。 */
function SummaryCount({ kind, body }: { kind: OutlineTab; body: PersistedDoc }) {
  const words = wordCount(documentFromJSON(kind, body));
  return (
    <>
      <dt>{documentLabel(kind)}</dt>
      <dd>{writtenSoFar(words)}</dd>
    </>
  );
}

const RELATIVE = new Intl.RelativeTimeFormat("zh-TW", { numeric: "auto" });

/** 「3 分鐘前」「2 小時前」「昨天」。 */
function timeAgo(then: number): string {
  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return "剛剛";
  if (minutes < 60) return RELATIVE.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return RELATIVE.format(-hours, "hour");
  return RELATIVE.format(-Math.round(hours / 24), "day");
}
