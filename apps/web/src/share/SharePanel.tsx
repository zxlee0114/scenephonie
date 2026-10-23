/**
 * 分享面板（票券 20，§10）—— 編劇自己的那一側。
 *
 * - **即時連結**：一份劇本一條，建立了就一直跟著存檔走。
 * - **交付連結**：匯出 PDF 時「取得這次交付的連結」是一條路；這裡的「建立交付連結」是另一條 ——
 *   先把手上的存掉，用那一刻的存檔建立一筆交付（不印 PDF），再鑄它的連結（使用者裁決，2026-10-23）。
 *   清單上有交付時間，與「之後劇本已有修改」—— 這句只在編劇自己的清單上說，凍結頁的讀者永遠看不到
 *   （§10.2：有用且零洩漏）。
 * - **停用**要確認一次：停了就打不開，重新分享是新的網址（舊的那列留著，不復活）。交付連結可以勾選
 *   幾條（或全選）一次停用 —— 不設上限、不自動停用最舊的：最舊的往往正是寄給評審的那一條。
 * - **備註**：每條連結一行「這條給了誰」，只有編劇看得到（使用者裁決，2026-10-23）。除此之外仍是
 *   零配置：沒有標題、沒有密碼、沒有有效期（§10.3）。
 *
 * 讀寫都是注入的（路由層接 Server Action，存檔是編輯器的）—— 這裡只認得 token，網址怎麼組也由
 * 呼叫端決定。
 */
"use client";

import { useEffect, useRef, useState } from "react";

import "../styles/share.css";
import { minuteText } from "./banner";
import { CopyLink } from "./CopyLink";
import { SHARE_NOTE_MAX_LENGTH } from "./share-note";

/** 清單上的一條有效連結。`delivery` 為 `null` ＝ 即時連結。 */
export interface SharedLinkSummary {
  shareId: string;
  token: string;
  /** 編劇的備註；`null` ＝ 沒寫。 */
  note: string | null;
  delivery: { deliveredAt: Date; changedSince: boolean } | null;
}

export interface SharePanelCapability {
  /** 這份劇本現在有效的連結（新的在前）。 */
  list: () => Promise<SharedLinkSummary[]>;
  /** 建立即時連結（已有就拿回那一條）。`false` ＝ 沒建起來。 */
  shareLive: () => Promise<boolean>;
  /** 把手上還沒存的存掉。`false` ＝ 沒存進去 —— 那就不建交付連結（拍到的不會是編劇眼前那一份）。 */
  flush: () => Promise<boolean>;
  /** 用現在的存檔建立一筆交付並鑄它的連結。`false` ＝ 沒建起來。 */
  shareSnapshot: () => Promise<boolean>;
  /** 停用一條或幾條。`false` ＝ 一條都沒停到。 */
  revoke: (shareIds: string[]) => Promise<boolean>;
  /** 寫備註（空白 ＝ 拿掉）。`false` ＝ 沒寫進去。 */
  setNote: (shareId: string, note: string) => Promise<boolean>;
  /** token → 完整網址。 */
  urlOf: (token: string) => string;
}

export function SharePanel({ list, shareLive, flush, shareSnapshot, revoke, setNote, urlOf }: SharePanelCapability) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<SharedLinkSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [working, setWorking] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const refresh = async () => setLinks(await list());

  /** 跑一個動作再重讀清單；失敗（拒絕或斷線）就說出來，不假裝成功。 */
  const run = async (action: () => Promise<boolean>) => {
    setWorking(true);
    setFailed(false);
    try {
      if (!(await action())) setFailed(true);
      await refresh();
    } catch {
      setFailed(true);
    } finally {
      setWorking(false);
    }
  };

  const openPanel = async () => {
    setOpen(true);
    setFailed(false);
    try {
      await refresh();
    } catch {
      setLinks([]);
      setFailed(true);
    }
  };

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  // 讀完清單才有東西可以聚焦：落在即時連結那一格網址（或「建立即時連結」）—— 不落在備註欄，
  // 一打開就像在等人打字。
  const loading = links === null;
  useEffect(() => {
    if (open && !loading)
      panel.current
        ?.querySelector<HTMLElement>(".share-panel__section .copy-link__row input, .share-panel__section > button")
        ?.focus();
  }, [open, loading]);

  const live = links?.find((l) => l.delivery === null);
  const frozen = links?.filter((l) => l.delivery !== null) ?? [];
  const noteOf = (link: SharedLinkSummary) => (note: string) => void run(() => setNote(link.shareId, note));

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="share-panel__trigger"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (open ? close() : void openPanel())}
      >
        分享
      </button>

      {open && (
        <div className="share-panel__scrim" onMouseDown={close}>
          <div
            ref={panel}
            className="share-panel"
            role="dialog"
            aria-modal="true"
            aria-label="分享"
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                close();
              }
            }}
          >
            <h2 className="share-panel__title">分享</h2>
            {links === null ? (
              <p className="share-panel__hint" role="status">
                讀取中…
              </p>
            ) : (
              <>
                <p className="share-panel__hint">任何有連結的人都可以觀看劇本及場次表，不含草稿。</p>

                <section className="share-panel__section">
                  <h3 className="share-panel__subtitle">即時連結</h3>
                  <p className="share-panel__hint">此連結在每次存檔時都會即時更新內容。</p>
                  {live ? (
                    <LinkRow
                      name="即時連結"
                      url={urlOf(live.token)}
                      note={live.note}
                      working={working}
                      onNote={noteOf(live)}
                      onRevoke={() => void run(() => revoke([live.shareId]))}
                    />
                  ) : (
                    <button type="button" disabled={working} onClick={() => void run(shareLive)}>
                      建立即時連結
                    </button>
                  )}
                </section>

                <section className="share-panel__section">
                  <h3 className="share-panel__subtitle">交付連結</h3>
                  <p className="share-panel__hint">顯示產生連結時的內容頁面，不受後續編輯影響。</p>
                  {frozen.length > 0 && (
                    <FrozenLinks
                      links={frozen}
                      urlOf={urlOf}
                      working={working}
                      onNote={noteOf}
                      onRevoke={(shareIds) => void run(() => revoke(shareIds))}
                    />
                  )}
                  <button
                    type="button"
                    className="share-panel__create"
                    disabled={working}
                    onClick={() => void run(async () => (await flush()) && (await shareSnapshot()))}
                  >
                    建立交付連結
                  </button>
                </section>
              </>
            )}

            {failed && (
              <p className="share-panel__status" role="alert">
                沒有成功（連線問題，或需要重新登入），再試一次。
              </p>
            )}

            <div className="share-panel__actions">
              <button type="button" onClick={close}>
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * 交付連結清單：每條可以勾選，上方「全選」與「停用所選（N）」，停用前確認一次。清單太長就在這一塊
 * 裡捲動（即時連結與底下的鈕留在原地）—— 不分頁：分頁會讓「全選」變得含糊（這一頁？全部？）。
 */
function FrozenLinks({
  links,
  urlOf,
  working,
  onNote,
  onRevoke,
}: {
  links: SharedLinkSummary[];
  urlOf: (token: string) => string;
  working: boolean;
  onNote: (link: SharedLinkSummary) => (note: string) => void;
  onRevoke: (shareIds: string[]) => void;
}) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  // 停用之後清單重讀：已經不在的那幾條不算勾著。
  const selected = links.filter((l) => picked.has(l.shareId)).map((l) => l.shareId);
  const allPicked = selected.length === links.length;

  const toggle = (shareId: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(shareId)) next.add(shareId);
      return next;
    });

  return (
    <>
      <div className="share-panel__bulk">
        <label className="share-panel__pick">
          <input
            type="checkbox"
            checked={allPicked}
            ref={(el) => {
              if (el) el.indeterminate = selected.length > 0 && !allPicked;
            }}
            onChange={() => setPicked(allPicked ? new Set() : new Set(links.map((l) => l.shareId)))}
            disabled={working}
          />
          全選
        </label>
        {selected.length > 0 && (
          <button type="button" onClick={() => setConfirming(true)} disabled={working || confirming}>
            停用所選（{selected.length}）
          </button>
        )}
      </div>
      {confirming && selected.length > 0 && (
        <div className="share-panel__confirm">
          <span>將停用 {selected.length} 條交付連結，停用之後連結將會失效</span>
          <span className="share-panel__confirm-actions">
            <button type="button" onClick={() => setConfirming(false)} disabled={working}>
              取消
            </button>
            <button
              type="button"
              className="share-panel__danger"
              onClick={() => {
                setConfirming(false);
                setPicked(new Set());
                onRevoke(selected);
              }}
              disabled={working}
            >
              確定停用
            </button>
          </span>
        </div>
      )}
      <ul className="share-panel__list">
        {links.map((link) => {
          const name = `${minuteText(link.delivery!.deliveredAt)} 交付`;
          return (
            <li key={link.shareId} className="share-panel__item">
              <input
                type="checkbox"
                className="share-panel__item-pick"
                aria-label={`選取 ${name}`}
                checked={picked.has(link.shareId)}
                onChange={() => toggle(link.shareId)}
                disabled={working}
              />
              <LinkRow
                name={name}
                label={name}
                drift={link.delivery!.changedSince ? "之後劇本已有修改" : undefined}
                url={urlOf(link.token)}
                note={link.note}
                working={working}
                onNote={onNote(link)}
                onRevoke={() => onRevoke([link.shareId])}
              />
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** 一條連結：名字、（漂移）、備註、唯讀網址、複製、停用（按兩次）、備註鈕。 */
function LinkRow({
  name,
  label,
  drift,
  url,
  note,
  working,
  onNote,
  onRevoke,
}: {
  name: string;
  label?: string;
  drift?: string;
  url: string;
  note: string | null;
  working: boolean;
  onNote: (note: string) => void;
  onRevoke: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  // 只有空白的備註等於沒有 —— 不佔一行。
  const shownNote = note?.trim() || null;
  return (
    <div className="share-panel__link">
      <CopyLink
        name={name}
        label={
          label && (
            <>
              {label}
              {drift && <span className="share-panel__note"> · {drift}</span>}
            </>
          )
        }
        url={url}
        above={
          editingNote ? (
            <NoteField
              name={name}
              saved={shownNote}
              onDone={(changed) => {
                setEditingNote(false);
                if (changed !== null) onNote(changed);
              }}
            />
          ) : (
            shownNote && <p className="share-panel__memo-text">{shownNote}</p>
          )
        }
      >
        {/* 確認期間留在原位（變灰），網址那一列才不會跳。 */}
        <button type="button" onClick={() => setConfirming(true)} disabled={working || confirming}>
          停用
        </button>
        <button
          type="button"
          className="share-panel__memo-button"
          aria-label={shownNote ? "編輯備註" : "新增備註"}
          title={shownNote ? "編輯備註" : "新增備註"}
          onClick={() => setEditingNote(true)}
          disabled={working || editingNote}
        >
          <NoteIcon />
        </button>
      </CopyLink>
      {confirming && (
        <div className="share-panel__confirm">
          <span>停用之後，連結將會失效</span>
          <span className="share-panel__confirm-actions">
            <button type="button" onClick={() => setConfirming(false)} disabled={working}>
              取消
            </button>
            <button type="button" className="share-panel__danger" onClick={onRevoke} disabled={working}>
              確定停用
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * 備註欄：點了備註鈕才出現，一出現就聚焦。離開欄位（或 Enter）收起來，有改才存（`onDone` 給新值；
 * 沒改給 `null`）；Esc 放棄這次的修改 —— 只收欄位，不關面板。
 */
function NoteField({
  name,
  saved,
  onDone,
}: {
  name: string;
  saved: string | null;
  onDone: (changed: string | null) => void;
}) {
  const [value, setValue] = useState(saved ?? "");
  const cancelled = useRef(false);
  return (
    <input
      type="text"
      className="share-panel__memo"
      aria-label={`${name}的備註`}
      placeholder="這條連結給了誰（只有你看得到）"
      maxLength={SHARE_NOTE_MAX_LENGTH}
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        // 輸入法選字時的 Enter 是在確認選字，不是「寫完了」。
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          cancelled.current = true;
          onDone(null);
        }
      }}
      onBlur={() => {
        if (cancelled.current) return;
        onDone(value.trim() !== (saved ?? "") ? value : null);
      }}
    />
  );
}

/** 一枝鉛筆（備註）。裝飾用 —— 名字在鈕上。 */
function NoteIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M11.5 2.5l2 2L6 12H4v-2z" strokeLinejoin="round" />
      <path d="M3 14h10" strokeLinecap="round" />
    </svg>
  );
}
