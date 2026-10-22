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
 * 匯出前防呆（票券 19，§9.6）也住在這張面板上：**「這份 PDF 會少掉這幾場」**，不是「要不要輸出這一場」
 * —— 清單只提醒、不擋，按「匯出」照樣印。靜默地少印幾場是最糟的失敗模式，所以就算每一場都設成
 * 不再提醒，印好之後那一行「本次略過 N 場草稿」照樣說。
 *
 * 編輯器不認識路由層（§6.3）：存檔、建立交付、PDF 的網址都是注入的；預檢與「不再提醒」的寫入由
 * 編輯器注入（它手上有 doc）。
 */
"use client";

import { useEffect, useRef, useState } from "react";

import type { DraftReason, ExportPreflight, SceneMetaField, SkippedDraft } from "@scenephonie/schema";

import {
  DEFAULT_EXPORT_OPTIONS,
  exportOptionsToQuery,
  type ExportOptions,
  type PrintFont,
} from "@/pdf/export-options";

/** 匯出要用到的三樣能力，全部由路由層注入。 */
export interface ExportPdfCapability {
  /** 把手上還沒存的存掉。`false` ＝ 沒存進去（斷線、衝突、沒有權限）。 */
  flush: () => Promise<boolean>;
  /** 建立一筆交付，回傳它的 id；`null` ＝ 被拒絕。 */
  createDelivery: () => Promise<string | null>;
  /** 一筆交付的 PDF 網址。`query` 是匯出選項。 */
  pdfUrl: (deliveryId: string, query: string) => string;
  /** 這份稿現在匯出的話會少掉哪幾場、哪些登場人物該提醒（讀當下的 doc）。 */
  preflight: () => ExportPreflight;
  /** 「之後不再提醒勾選的場次」—— 記在那幾場上（`sceneId`）。 */
  dismissDraftReminders: (sceneIds: string[]) => void;
}

type Phase =
  | { kind: "idle" }
  | { kind: "working"; text: string }
  | { kind: "unsaved" }
  | { kind: "refused" }
  | { kind: "deliveryFailed" }
  | { kind: "printFailed"; deliveryId: string; url: string; skipped: ExportPreflight["skipped"] }
  | { kind: "done"; skipped: ExportPreflight["skipped"] };

const MESSAGE: Record<Exclude<Phase["kind"], "idle" | "working">, { text: string; alert: boolean }> = {
  unsaved: { text: "還有修改沒存進去，這次沒有匯出 —— 等存檔恢復再試。", alert: true },
  refused: { text: "沒有權限匯出這份劇本，請重新登入。", alert: true },
  deliveryFailed: { text: "交付沒有建立起來（連線問題？），這次沒有匯出 —— 再按一次匯出。", alert: true },
  printFailed: { text: "交付已經建立，但 PDF 沒有印出來。", alert: true },
  done: { text: "已下載。", alert: false },
};

const FIELD_NAMES: Record<SceneMetaField, string> = { intExt: "內／外", time: "時間", location: "地點" };

/** 清單上那一行「為什麼是草稿」—— 逐項說，編劇才知道要回去補哪一欄。 */
function reasonText(reason: DraftReason): string {
  switch (reason.kind) {
    case "manual":
      return "手動標記為草稿";
    case "missingMeta":
      return `未填寫${reason.fields.map((f) => FIELD_NAMES[f]).join("、")}`;
    case "empty":
      return "沒有內文";
    case "echoesParent":
      return "內外、時間、地點與主場次相同";
    case "echoesMember":
      return "與同組另一場同時同地";
    case "parentDraft":
      return "主場次是草稿";
  }
}

/** 印好之後那一行。一場都沒略過就不說。 */
function skippedText({ drafts, groupMates }: ExportPreflight["skipped"]): string {
  if (drafts === 0) return "";
  const mates = groupMates > 0 ? `另有 ${groupMates} 場因為同組有草稿，整組一起略過。` : "";
  return `本次略過 ${drafts} 場草稿。${mates}`;
}

const FONT_CHOICES: { font: PrintFont; label: string }[] = [
  { font: "kai", label: "楷體（範本用的字型）" },
  { font: "sans", label: "黑體" },
];

export function ExportPdf({
  flush,
  createDelivery,
  pdfUrl,
  preflight,
  dismissDraftReminders,
}: ExportPdfCapability) {
  const [open, setOpen] = useState(false);
  /** 打開面板那一刻的預檢；「不再提醒」之後重讀。面板是 modal，開著時 doc 不會被別的手改。 */
  const [check, setCheck] = useState<ExportPreflight | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
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

  const openPanel = () => {
    setCheck(preflight());
    setPicked(new Set());
    setOpen(true);
  };

  const remember = () => {
    dismissDraftReminders([...picked]);
    setCheck(preflight());
    setPicked(new Set());
    // 勾的那幾列消失了 —— 焦點別跟著掉到 body。
    panel.current?.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus();
  };

  useEffect(() => {
    if (open) panel.current?.querySelector<HTMLInputElement>('input[type="text"]')?.focus();
  }, [open]);

  async function print(deliveryId: string, url: string, skipped: ExportPreflight["skipped"]) {
    setPhase({ kind: "working", text: "正在印 PDF…" });
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`PDF ${response.status}`);
      download(await response.blob(), filenameOf(response) ?? `${deliveryId}.pdf`);
      setPhase({ kind: "done", skipped });
    } catch {
      setPhase({ kind: "printFailed", deliveryId, url, skipped });
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

    // 交付讀的是剛存進去的那一份，與手上這一份相同 —— 這裡算的就是那筆交付少掉的場數。
    await print(deliveryId, pdfUrl(deliveryId, exportOptionsToQuery(options)), preflight().skipped);
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="export-pdf__trigger"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (open ? close() : openPanel())}
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
              {check && check.drafts.length > 0 ? (
                <SkippedDrafts
                  check={check}
                  picked={picked}
                  onPick={setPicked}
                  onRemember={remember}
                  disabled={working}
                />
              ) : (
                <p className="export-pdf__note">草稿場次不會印出來。</p>
              )}
              {check && check.appearing.length > 0 && <AppearingReminders check={check} />}

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
              <fieldset className="export-pdf__fonts">
                <legend>字型</legend>
                {FONT_CHOICES.map(({ font, label }) => (
                  <label key={font} className="export-pdf__check">
                    <input
                      type="radio"
                      name="export-pdf-font"
                      checked={options.font === font}
                      onChange={() => setOptions({ ...options, font })}
                    />
                    {label}
                  </label>
                ))}
              </fieldset>

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
                  {phase.kind === "done" && skippedText(phase.skipped)}
                </p>
              )}

              <div className="export-pdf__actions">
                <button type="button" onClick={close} disabled={working}>
                  關閉
                </button>
                {phase.kind === "printFailed" ? (
                  <button type="button" onClick={() => void print(phase.deliveryId, phase.url, phase.skipped)}>
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

/**
 * 「本次輸出會略過 N 場草稿」—— 每筆附內容首行（標籤對編劇是個空號）與缺了什麼；可多選、全選，
 * 勾了的可以設成之後不再提醒。N 含已經設成不再提醒的那幾場（它們照樣不印）。
 */
function SkippedDrafts({
  check,
  picked,
  onPick,
  onRemember,
  disabled,
}: {
  check: ExportPreflight;
  picked: ReadonlySet<string>;
  onPick: (next: ReadonlySet<string>) => void;
  onRemember: () => void;
  disabled: boolean;
}) {
  const { drafts, skipped } = check;
  const quiet = skipped.drafts - drafts.length;
  const all = drafts.every((d) => picked.has(d.sceneId));
  const toggle = (sceneId: string) => {
    const next = new Set(picked);
    if (!next.delete(sceneId)) next.add(sceneId);
    onPick(next);
  };

  return (
    <fieldset className="export-pdf__skipped">
      <legend>
        本次輸出會略過 {skipped.drafts} 場草稿：
        {quiet > 0 && <span className="export-pdf__quiet">（其中 {quiet} 場已設成不再提醒，不列出）</span>}
      </legend>
      <ul>
        {drafts.map((draft) => (
          <li key={draft.sceneId}>
            <label className="export-pdf__check">
              <input
                type="checkbox"
                checked={picked.has(draft.sceneId)}
                onChange={() => toggle(draft.sceneId)}
              />
              <span>
                {draft.label}
                {draft.excerpt ? `「${draft.excerpt}」` : "（沒有內文）"} — {draft.reasons.map(reasonText).join("；")}
              </span>
            </label>
            {draft.group && <GroupConsequence draft={draft} />}
          </li>
        ))}
      </ul>
      <div className="export-pdf__skipped-actions">
        <label className="export-pdf__check">
          <input
            type="checkbox"
            checked={all}
            onChange={() => onPick(all ? new Set() : new Set(drafts.map((d) => d.sceneId)))}
          />
          全選
        </label>
        <button type="button" onClick={onRemember} disabled={disabled || picked.size === 0}>
          之後不再提醒勾選的場次
        </button>
      </div>
    </fieldset>
  );
}

/** 草稿成員讓整組印不出來（殘缺的對剪比不印更糟）—— 略過它的後果比表面上大，要說出來。 */
function GroupConsequence({ draft }: { draft: SkippedDraft }) {
  const mates = draft.group!.groupMates;
  return (
    <p className="export-pdf__group">
      這場屬於一個對剪群組，整組都不會印
      {mates.length > 0 && `：同組的 ${mates.join("、")} 也會一起略過`}。
    </p>
  );
}

/** 登場人物提示（§4.7）另外列：**提醒但不阻擋**，它可能是正確狀態（聲音入鏡、人沒入鏡）。 */
function AppearingReminders({ check }: { check: ExportPreflight }) {
  return (
    <div className="export-pdf__appearing" role="group" aria-labelledby="export-pdf-appearing">
      <p id="export-pdf-appearing">有台詞、但不在登場人物欄的人（只是提醒，不影響匯出）：</p>
      <ul>
        {check.appearing.map(({ sceneId, label, speakers }) => (
          <li key={sceneId}>
            {`${label}\u3000${speakers.join("、")}`}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 伺服器在 `content-disposition` 的 `filename*` 給的檔名（劇本名稱_交付時間）。 */
function filenameOf(response: Response): string | null {
  const match = /filename\*=UTF-8''([^;]+)/i.exec(response.headers.get("content-disposition") ?? "");
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return null;
  }
}

/** 把 PDF 交給瀏覽器下載。同一筆交付重印，檔名也一樣。 */
function download(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(href), 0);
}
