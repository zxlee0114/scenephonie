/**
 * 分享面板（票券 20，§10）—— 編劇自己的那一側。
 *
 * - **即時連結**：一份劇本一條，建立了就一直跟著存檔走。
 * - **交付連結**：匯出 PDF 時「取得這次交付的連結」是一條路；這裡的「建立交付連結」是另一條 ——
 *   先把手上的存掉，用那一刻的存檔建立一筆交付（不印 PDF），再鑄它的連結（使用者裁決，2026-10-23）。
 *   清單上有交付時間，與「之後劇本已有修改」—— 這句只在編劇自己的清單上說，凍結頁的讀者永遠看不到
 *   （§10.2：有用且零洩漏）。
 * - **停用**要確認一次：停了就打不開，重新分享是新的網址（舊的那列留著，不復活）。
 * - **零配置**：沒有標題、沒有密碼、沒有有效期（§10.3）。
 *
 * 讀寫都是注入的（路由層接 Server Action，存檔是編輯器的）—— 這裡只認得 token，網址怎麼組也由
 * 呼叫端決定。
 */
"use client";

import { useEffect, useRef, useState } from "react";

import "../styles/share.css";
import { minuteText } from "./banner";
import { CopyLink } from "./CopyLink";

/** 清單上的一條有效連結。`delivery` 為 `null` ＝ 即時連結。 */
export interface SharedLinkSummary {
  shareId: string;
  token: string;
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
  /** 停用一條。`false` ＝ 沒停到。 */
  revoke: (shareId: string) => Promise<boolean>;
  /** token → 完整網址。 */
  urlOf: (token: string) => string;
}

export function SharePanel({ list, shareLive, flush, shareSnapshot, revoke, urlOf }: SharePanelCapability) {
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

  // 讀完清單才有東西可以聚焦：落在面板的第一個控制項（建立即時連結，或那一格網址）。
  const loading = links === null;
  useEffect(() => {
    if (open && !loading) panel.current?.querySelector<HTMLElement>(".share-panel__section button, .share-panel__section input")?.focus();
  }, [open, loading]);

  const live = links?.find((l) => l.delivery === null);
  const frozen = links?.filter((l) => l.delivery !== null) ?? [];

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
                      working={working}
                      onRevoke={() => void run(() => revoke(live.shareId))}
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
                    <ul className="share-panel__list">
                      {frozen.map((link) => {
                        const name = `${minuteText(link.delivery!.deliveredAt)} 交付`;
                        return (
                          <li key={link.shareId}>
                            <LinkRow
                              name={name}
                              label={name}
                              note={link.delivery!.changedSince ? "之後劇本已有修改" : undefined}
                              url={urlOf(link.token)}
                              working={working}
                              onRevoke={() => void run(() => revoke(link.shareId))}
                            />
                          </li>
                        );
                      })}
                    </ul>
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

/** 一條連結：名字、（漂移）、唯讀網址、複製、停用（按兩次）。 */
function LinkRow({
  name,
  label,
  note,
  url,
  working,
  onRevoke,
}: {
  name: string;
  label?: string;
  note?: string;
  url: string;
  working: boolean;
  onRevoke: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="share-panel__link">
      <CopyLink
        name={name}
        label={
          label && (
            <>
              {label}
              {note && <span className="share-panel__note"> · {note}</span>}
            </>
          )
        }
        url={url}
      >
        {/* 確認期間留在原位（變灰），網址那一列才不會跳。 */}
        <button type="button" onClick={() => setConfirming(true)} disabled={working || confirming}>
          停用
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
