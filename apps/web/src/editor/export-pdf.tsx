/**
 * 匯出 PDF（票券 18，§9.2）—— header 右端那顆鈕與它的選項面板。
 *
 * 順序是被迫的：**先存檔 → 再建立交付 → 再印那一筆**。
 *
 * - 交付承諾的是 canonical state，不是這個分頁記憶體裡還沒存的那一份 —— 所以先把手上的存掉；
 *   存不進去就不匯出（印出一份少了剛才那幾個字的 PDF，比不印更糟）。
 * - 「交付記了、紙沒印出來」沒有說謊、可回復：印壞了，「再印一次」拿**同一筆**交付重印，
 *   不會多出第二筆（重試 ≠ 再匯出一次）。
 *
 * 編輯器不認識路由層（§6.3）：存檔、建立交付、PDF 的網址都是注入的。
 */
"use client";

import { useEffect, useRef, useState } from "react";

import { DEFAULT_EXPORT_OPTIONS, exportOptionsToQuery, type ExportOptions } from "@/pdf/export-options";

/** 匯出要用到的三樣能力，全部由路由層注入。 */
export interface ExportPdfCapability {
  /** 把手上還沒存的存掉。`false` ＝ 沒存進去（斷線、衝突、沒有權限）。 */
  flush: () => Promise<boolean>;
  /** 建立一筆交付，回傳它的 id；`null` ＝ 被拒絕。 */
  createDelivery: () => Promise<string | null>;
  /** 一筆交付的 PDF 網址。`query` 是匯出選項。 */
  pdfUrl: (deliveryId: string, query: string) => string;
}

type Phase =
  | { kind: "idle" }
  | { kind: "working"; text: string }
  | { kind: "unsaved" }
  | { kind: "refused" }
  | { kind: "deliveryFailed" }
  | { kind: "printFailed"; deliveryId: string; url: string }
  | { kind: "done" };

const MESSAGE: Record<Exclude<Phase["kind"], "idle" | "working">, { text: string; alert: boolean }> = {
  unsaved: { text: "還有修改沒存進去，這次沒有匯出 —— 等存檔恢復再試。", alert: true },
  refused: { text: "沒有權限匯出這份劇本，請重新登入。", alert: true },
  deliveryFailed: { text: "交付沒有建立起來（連線問題？），這次沒有匯出 —— 再按一次匯出。", alert: true },
  printFailed: { text: "交付已經建立，但 PDF 沒有印出來。", alert: true },
  done: { text: "已下載。", alert: false },
};

export function ExportPdf({ flush, createDelivery, pdfUrl }: ExportPdfCapability) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const working = phase.kind === "working";

  const close = () => {
    if (working) return;
    setOpen(false);
    setPhase({ kind: "idle" });
    trigger.current?.focus();
  };

  useEffect(() => {
    if (open) panel.current?.querySelector("input")?.focus();
  }, [open]);

  async function print(deliveryId: string, url: string) {
    setPhase({ kind: "working", text: "正在印 PDF…" });
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`PDF ${response.status}`);
      download(await response.blob(), `${deliveryId}.pdf`);
      setPhase({ kind: "done" });
    } catch {
      setPhase({ kind: "printFailed", deliveryId, url });
    }
  }

  async function exportPdf() {
    setPhase({ kind: "working", text: "正在存檔…" });
    if (!(await flush())) return setPhase({ kind: "unsaved" });

    setPhase({ kind: "working", text: "正在建立交付…" });
    let deliveryId: string | null;
    try {
      deliveryId = await createDelivery();
    } catch {
      // 斷線或伺服器出錯 —— 不是權限問題，別叫人重新登入。
      return setPhase({ kind: "deliveryFailed" });
    }
    if (!deliveryId) return setPhase({ kind: "refused" });

    await print(deliveryId, pdfUrl(deliveryId, exportOptionsToQuery(options)));
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="export-pdf__trigger"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (open ? close() : setOpen(true))}
      >
        匯出 PDF
      </button>

      {open && (
        <div className="export-pdf__scrim" onMouseDown={close}>
          <div
            ref={panel}
            className="export-pdf"
            role="dialog"
            aria-modal="true"
            aria-label="匯出 PDF"
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                close();
              }
            }}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void exportPdf();
              }}
            >
              <h2 className="export-pdf__title">匯出 PDF（優良電影劇本獎格式）</h2>
              <p className="export-pdf__note">草稿場次不會印出來。</p>

              <label className="export-pdf__field">
                <span>浮水印文字</span>
                <input
                  type="text"
                  value={options.watermark}
                  placeholder="例：僅供第48屆優良電影劇本獎評審使用"
                  onChange={(e) => setOptions({ ...options, watermark: e.target.value })}
                />
              </label>
              <label className="export-pdf__check">
                <input
                  type="checkbox"
                  checked={options.appearingCharacters}
                  onChange={(e) => setOptions({ ...options, appearingCharacters: e.target.checked })}
                />
                場次標題下印登場人物
              </label>
              <label className="export-pdf__check">
                <input
                  type="checkbox"
                  checked={options.timestamp}
                  onChange={(e) => setOptions({ ...options, timestamp: e.target.checked })}
                />
                頁尾印時間戳（交付建立的時間）
              </label>

              {phase.kind === "working" && (
                <p className="export-pdf__status" role="status">
                  {phase.text}
                </p>
              )}
              {phase.kind !== "idle" && phase.kind !== "working" && (
                <p
                  className={`export-pdf__status${MESSAGE[phase.kind].alert ? " export-pdf__status--loud" : ""}`}
                  role={MESSAGE[phase.kind].alert ? "alert" : "status"}
                >
                  {MESSAGE[phase.kind].text}
                </p>
              )}

              <div className="export-pdf__actions">
                <button type="button" onClick={close} disabled={working}>
                  關閉
                </button>
                {phase.kind === "printFailed" ? (
                  <button type="button" onClick={() => void print(phase.deliveryId, phase.url)}>
                    再印一次
                  </button>
                ) : (
                  <button type="submit" disabled={working}>
                    匯出
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

/** 把 PDF 交給瀏覽器下載。檔名用交付 id —— 同一筆交付重印，檔名也一樣。 */
function download(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(href), 0);
}
