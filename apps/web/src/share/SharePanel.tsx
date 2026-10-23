/**
 * 分享面板（票券 20，§10）—— 編劇自己的那一側。
 *
 * - **即時連結是面板上唯一可以建立的東西。** 凍結連結不是這裡的第二個選項（那會退化成 Figma 藏在
 *   版本歷史裡的那個開關），而是匯出 PDF 的副產品「取得這次交付的連結」。
 * - **交付的連結**只列出來：交付時間，與「之後劇本已有修改」—— 這句只在編劇自己的清單上說，凍結頁
 *   的讀者永遠看不到（§10.2：有用且零洩漏）。
 * - **停用**要確認一次：停了就打不開，重新分享是新的網址（舊的那列留著，不復活）。
 * - **零配置**：沒有標題、沒有密碼、沒有有效期（§10.3）。
 *
 * 讀寫都是注入的（路由層接 Server Action）—— 這裡只認得 token，網址怎麼組也由呼叫端決定。
 */
"use client";

import { useEffect, useRef, useState } from "react";

import "../styles/share.css";
import { minuteText } from "./banner";

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
  /** 停用一條。`false` ＝ 沒停到。 */
  revoke: (shareId: string) => Promise<boolean>;
  /** token → 完整網址。 */
  urlOf: (token: string) => string;
}

export function SharePanel({ list, shareLive, revoke, urlOf }: SharePanelCapability) {
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
                <section className="share-panel__section">
                  <p className="share-panel__hint">
                    拿到連結的人不必登入，就能看劇本與場次表。看到的永遠是最新存檔的版本，不含草稿。
                  </p>
                  {live ? (
                    <LinkRow
                      label="即時連結"
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

                {frozen.length > 0 && (
                  <section className="share-panel__section">
                    <h3 className="share-panel__subtitle">交付的連結</h3>
                    <p className="share-panel__hint">每一條都停在那一次交付的內容；讀的人不會知道之後的改動。</p>
                    <ul className="share-panel__list">
                      {frozen.map((link) => (
                        <li key={link.shareId}>
                          <LinkRow
                            label={`${minuteText(link.delivery!.deliveredAt)} 交付`}
                            note={link.delivery!.changedSince ? "之後劇本已有修改" : undefined}
                            url={urlOf(link.token)}
                            working={working}
                            onRevoke={() => void run(() => revoke(link.shareId))}
                          />
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
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

/** 一條連結：名字、（漂移）、唯讀網址（點一下全選好複製）、停用（按兩次）。 */
function LinkRow({
  label,
  note,
  url,
  working,
  onRevoke,
}: {
  label: string;
  note?: string;
  url: string;
  working: boolean;
  onRevoke: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="share-panel__link">
      <label className="share-panel__field">
        <span>
          {label}
          {note && <span className="share-panel__note"> · {note}</span>}
        </span>
        <input type="text" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
      </label>
      {confirming ? (
        <span className="share-panel__confirm">
          停用後這個網址就打不開了。
          <button type="button" onClick={() => setConfirming(false)} disabled={working}>
            取消
          </button>
          <button type="button" className="share-panel__danger" onClick={onRevoke} disabled={working}>
            確定停用
          </button>
        </span>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} disabled={working}>
          停用
        </button>
      )}
    </div>
  );
}
