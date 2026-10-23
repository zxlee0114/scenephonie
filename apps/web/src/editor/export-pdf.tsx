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
 * 匯出前防呆（票券 19，§9.6）是面板的第一步：**「這份 PDF 會少掉這幾場」**，不是「要不要輸出這一場」
 * —— 清單只提醒、不擋，不處理任何一場也能按「下一步」。草稿一多，清單會把匯出選項推出視窗，所以
 * 拆成兩步；只在還有要提醒的草稿時才攔在第一步，否則直接到選項（多按一次的代價只付在該看的時候）。
 * 靜默地少印幾場是最糟的失敗模式，所以就算每一場都設成不再提醒，印好之後那一行
 * 「本次略過 N 場草稿」照樣說。
 *
 * **凍結分享是這個面板的副產品**（票券 20，§10.2）：印完（或印壞了）之後多一顆「取得這次交付的連結」。
 * 快照必然、連結自願 —— 交付每次匯出都建立，連結只在按了這顆之後才鑄；否則「我只是想印一份 PDF」
 * 會在背後多出一條公開網址。它不是分享面板上的第二個選項：分享面板只有即時連結。
 *
 * 編輯器不認識路由層（§6.3）：存檔、建立交付、PDF 的網址、鑄連結都是注入的；預檢、「不再提醒」的寫入與
 * 「前往修改」由編輯器注入（它手上有 doc）。
 */
"use client";

import { useEffect, useRef, useState } from "react";

import type {
  DraftReason,
  ExportPreflight,
  SceneMetaField,
  SkippedCount,
  SkippedDraft,
} from "@scenephonie/schema";

import {
  DEFAULT_EXPORT_OPTIONS,
  exportOptionsToQuery,
  type ExportOptions,
  type PrintFont,
} from "@/pdf/export-options";
import { CopyLink } from "@/share/CopyLink";

/** 匯出要用到的三樣能力，全部由路由層注入。 */
export interface ExportPdfCapability {
  /** 把手上還沒存的存掉。`false` ＝ 沒存進去（斷線、衝突、沒有權限）。 */
  flush: () => Promise<boolean>;
  /** 建立一筆交付，回傳它的 id；`null` ＝ 被拒絕。 */
  createDelivery: () => Promise<string | null>;
  /** 一筆交付的 PDF 網址。`query` 是匯出選項。 */
  pdfUrl: (deliveryId: string, query: string) => string;
  /** 「取得這次交付的連結」：鑄（或拿回）那一筆交付的凍結分享連結，回傳完整網址；`null` ＝ 沒鑄出來。 */
  shareDelivery: (deliveryId: string) => Promise<string | null>;
  /** 這份稿現在匯出的話會少掉哪幾場、哪些登場人物該提醒（讀當下的 doc）。 */
  preflight: () => ExportPreflight;
  /** 「之後不再提醒」（`true`）／「恢復提醒」（`false`）—— 記在那幾場上（`sceneId`）。 */
  setDraftReminderDismissed: (sceneIds: string[], dismissed: boolean) => void;
  /** 「前往修改」：把游標帶到那一場（面板先關掉）。 */
  revealScene: (sceneId: string) => void;
}

/** 第一步是匯出前清單，第二步是原本的匯出選項。 */
type Step = "check" | "options";

type Phase =
  | { kind: "idle" }
  | { kind: "working"; text: string }
  | { kind: "unsaved" }
  | { kind: "refused" }
  | { kind: "deliveryFailed" }
  | {
      kind: "printFailed";
      deliveryId: string;
      url: string;
      skipped: SkippedCount;
    }
  | { kind: "done"; deliveryId: string; skipped: SkippedCount };

/** 「取得這次交付的連結」那一格。 */
type Link = { kind: "idle" } | { kind: "working" } | { kind: "ready"; url: string } | { kind: "failed" };

const MESSAGE: Record<
  Exclude<Phase["kind"], "idle" | "working">,
  { text: string; alert: boolean }
> = {
  unsaved: {
    text: "還有修改沒存進去，這次沒有匯出 —— 等存檔恢復再試。",
    alert: true,
  },
  refused: { text: "沒有權限匯出這份劇本，請重新登入。", alert: true },
  deliveryFailed: {
    text: "交付沒有建立起來（連線問題？），這次沒有匯出 —— 再按一次匯出。",
    alert: true,
  },
  printFailed: { text: "交付已經建立，但 PDF 沒有印出來。", alert: true },
  done: { text: "已下載。", alert: false },
};

const FIELD_NAMES: Record<SceneMetaField, string> = {
  intExt: "內／外",
  time: "時間",
  location: "地點",
};

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
function skippedText({ drafts, groupMates }: SkippedCount): string {
  if (drafts === 0) return "";
  const mates =
    groupMates > 0 ? `另有 ${groupMates} 場因為同組有草稿，整組一起略過。` : "";
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
  setDraftReminderDismissed,
  revealScene,
  shareDelivery,
}: ExportPdfCapability) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("options");
  /** 這次打開走過第一步沒有 —— 走過，回頭的鈕才叫「上一步」；沒走過（直接到選項）叫「查看提醒」。 */
  const [sawCheck, setSawCheck] = useState(false);
  /** 打開面板那一刻的預檢；改了提醒設定之後重讀。面板是 modal，開著時 doc 不會被別的手改。 */
  const [check, setCheck] = useState<ExportPreflight | null>(null);
  const [options, setOptions] = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [link, setLink] = useState<Link>({ kind: "idle" });
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const working = phase.kind === "working";
  const loud = check ? check.drafts.filter((d) => !d.dismissed) : [];
  const quiet = check ? check.drafts.filter((d) => d.dismissed) : [];
  /** 第一步有沒有東西可看 —— 有就給回頭的鈕，就算這次沒有攔在那裡。 */
  const hasCheck =
    !!check && (check.drafts.length > 0 || check.appearing.length > 0);

  const close = () => {
    if (working) return;
    setOpen(false);
    setPhase({ kind: "idle" });
    setLink({ kind: "idle" });
    trigger.current?.focus();
  };

  const openPanel = () => {
    const next = preflight();
    setCheck(next);
    const stop = next.drafts.some((d) => !d.dismissed);
    setStep(stop ? "check" : "options");
    setSawCheck(stop);
    setOpen(true);
  };

  /** 「前往修改」：焦點交給編輯器那一場，不還給觸發鈕。 */
  const goTo = (sceneId: string) => {
    if (working) return;
    setOpen(false);
    setPhase({ kind: "idle" });
    revealScene(sceneId);
  };

  const remind = (sceneIds: string[], dismissed: boolean) => {
    setDraftReminderDismissed(sceneIds, dismissed);
    setCheck(preflight());
    // 勾的那幾列換了地方 —— 焦點別跟著掉到 body。
    panel.current
      ?.querySelector<HTMLButtonElement>(
        ".export-pdf__actions button:last-child",
      )
      ?.focus();
  };

  useEffect(() => {
    if (!open) return;
    // 第一步落在「下一步」：有意為之的人一按 Enter 就過；第二步照舊落在浮水印欄。
    const target =
      step === "check"
        ? ".export-pdf__actions button:last-child"
        : 'input[type="text"]';
    panel.current?.querySelector<HTMLElement>(target)?.focus();
  }, [open, step]);

  async function print(deliveryId: string, url: string, skipped: SkippedCount) {
    setPhase({ kind: "working", text: "正在印 PDF…" });
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`PDF ${response.status}`);
      download(
        await response.blob(),
        filenameOf(response) ?? `${deliveryId}.pdf`,
      );
      setPhase({ kind: "done", deliveryId, skipped });
    } catch {
      setPhase({ kind: "printFailed", deliveryId, url, skipped });
    }
  }

  async function getLink(deliveryId: string) {
    setLink({ kind: "working" });
    try {
      const url = await shareDelivery(deliveryId);
      setLink(url ? { kind: "ready", url } : { kind: "failed" });
    } catch {
      setLink({ kind: "failed" });
    }
  }

  async function exportPdf() {
    // 新的一次匯出是新的一筆交付 —— 上一筆的連結不是它的。
    setLink({ kind: "idle" });
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
    await print(
      deliveryId,
      pdfUrl(deliveryId, exportOptionsToQuery(options)),
      preflight().skipped,
    );
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

      {open && check && (
        <div className="export-pdf__scrim" onMouseDown={close}>
          <div
            ref={panel}
            className={`export-pdf${step === "check" ? " export-pdf--check" : ""}`}
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
            <h2 className="export-pdf__title">
              匯出 PDF（優良電影劇本獎格式）
            </h2>
            {step === "check" ? (
              <>
                <div className="export-pdf__check-body">
                  {check.skipped.drafts > 0 && (
                    <SkippedDrafts
                      total={check.skipped.drafts}
                      loud={loud}
                      quiet={quiet}
                      onRemind={remind}
                      onGoTo={goTo}
                    />
                  )}
                  {check.appearing.length > 0 && (
                    <AppearingReminders check={check} onGoTo={goTo} />
                  )}
                </div>
                <div className="export-pdf__actions">
                  <button type="button" onClick={close}>
                    關閉
                  </button>
                  <button type="button" onClick={() => setStep("options")}>
                    下一步
                  </button>
                </div>
              </>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void exportPdf();
                }}
              >
                <p className="export-pdf__note">
                  {check.skipped.drafts > 0
                    ? `本次會略過 ${check.skipped.drafts} 場草稿。`
                    : "草稿場次不會印出來。"}
                  {check.appearing.length > 0 &&
                    `另有 ${check.appearing.length} 場的台詞有人不在登場人物欄${sawCheck ? "，上一步可以查看" : ""}。`}
                </p>

                <label className="export-pdf__field">
                  <span>浮水印文字</span>
                  <input
                    type="text"
                    value={options.watermark}
                    placeholder="例：僅供第48屆優良電影劇本獎評審使用"
                    onChange={(e) =>
                      setOptions({ ...options, watermark: e.target.value })
                    }
                  />
                </label>
                <label className="export-pdf__check">
                  <input
                    type="checkbox"
                    checked={options.appearingCharacters}
                    onChange={(e) =>
                      setOptions({
                        ...options,
                        appearingCharacters: e.target.checked,
                      })
                    }
                  />
                  場次標題下印登場人物
                </label>
                <label className="export-pdf__check">
                  <input
                    type="checkbox"
                    checked={options.timestamp}
                    onChange={(e) =>
                      setOptions({ ...options, timestamp: e.target.checked })
                    }
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

                {(phase.kind === "done" || phase.kind === "printFailed") && (
                  <DeliveryLink link={link} onGet={() => void getLink(phase.deliveryId)} />
                )}

                <div className="export-pdf__actions">
                  {hasCheck && (
                    <button
                      type="button"
                      className="export-pdf__back"
                      onClick={() => {
                        setPhase({ kind: "idle" });
                        setStep("check");
                        setSawCheck(true);
                      }}
                      disabled={working}
                    >
                      {sawCheck ? "上一步" : "查看提醒"}
                    </button>
                  )}
                  <button type="button" onClick={close} disabled={working}>
                    關閉
                  </button>
                  {phase.kind === "printFailed" ? (
                    <button
                      type="button"
                      onClick={() =>
                        void print(phase.deliveryId, phase.url, phase.skipped)
                      }
                    >
                      再印一次
                    </button>
                  ) : (
                    <button type="submit" disabled={working}>
                      匯出
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * 凍結分享的把手。按了才鑄；鑄好了直接複製進剪貼簿（按這顆鈕就是要那條網址），框右邊說「已複製」。
 */
function DeliveryLink({ link, onGet }: { link: Link; onGet: () => void }) {
  if (link.kind === "ready") {
    return (
      <div className="export-pdf__link">
        <CopyLink name="這次交付的連結" label="這次交付的連結" url={link.url} autoCopy />
      </div>
    );
  }
  return (
    <div className="export-pdf__link">
      <button type="button" onClick={onGet} disabled={link.kind === "working"}>
        取得這次交付的連結
      </button>
      <p className="export-pdf__hint">此連結將是這次交付內容的快照，不會受後續編輯影響。</p>
      {link.kind === "failed" && (
        <p className="export-pdf__status export-pdf__status--loud" role="alert">
          連結沒有建立起來（連線問題？），再按一次試試。
        </p>
      )}
    </div>
  );
}

/**
 * 「本次匯出會略過以下 N 場草稿」—— 每筆附內容首行（標籤對編劇是個空號）與缺了什麼；可多選、全選，
 * 勾了的可以設成之後不再提醒。N 含已經設成不再提醒的那幾場（它們照樣不印），那幾場收進可展開的
 * 一區，在那裡可以恢復提醒。
 */
function SkippedDrafts({
  total,
  loud,
  quiet,
  onRemind,
  onGoTo,
}: {
  total: number;
  loud: SkippedDraft[];
  quiet: SkippedDraft[];
  onRemind: (sceneIds: string[], dismissed: boolean) => void;
  onGoTo: (sceneId: string) => void;
}) {
  return (
    <fieldset className="export-pdf__skipped">
      <legend>本次匯出會略過以下 {total} 場草稿</legend>
      <p className="export-pdf__hint">若是有意為之，直接按下一步即可。</p>
      {loud.length > 0 && (
        <DraftRows
          drafts={loud}
          action="不再提醒"
          onAct={(ids) => onRemind(ids, true)}
          onGoTo={onGoTo}
        />
      )}
      {quiet.length > 0 && (
        <details className="export-pdf__quiet">
          <summary>其中 {quiet.length} 場已標記不再提醒</summary>
          <div
            role="group"
            aria-label={`其中 ${quiet.length} 場已標記不再提醒`}
          >
            <DraftRows
              drafts={quiet}
              action="恢復提醒"
              onAct={(ids) => onRemind(ids, false)}
              onGoTo={onGoTo}
            />
          </div>
        </details>
      )}
    </fieldset>
  );
}

/** 一串可勾選的草稿，底下「全選」與一顆對勾了的那幾場動手的鈕。勾選是這一串自己的事，動完就清掉。 */
function DraftRows({
  drafts,
  action,
  onAct,
  onGoTo,
}: {
  drafts: SkippedDraft[];
  action: string;
  onAct: (sceneIds: string[]) => void;
  onGoTo: (sceneId: string) => void;
}) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const all = drafts.every((d) => picked.has(d.sceneId));
  const toggle = (sceneId: string) => {
    const next = new Set(picked);
    if (!next.delete(sceneId)) next.add(sceneId);
    setPicked(next);
  };

  return (
    <>
      <ul className="export-pdf__rows">
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
                {draft.excerpt ? `「${draft.excerpt}」` : "（沒有內文）"}
              </span>
            </label>
            <p className="export-pdf__reason">
              {draft.reasons.map(reasonText).join("；")}
              {draft.group && (
                <GroupConsequence groupMates={draft.group.groupMates} />
              )}
            </p>
            <GoTo label={draft.label} onClick={() => onGoTo(draft.sceneId)} />
          </li>
        ))}
      </ul>
      <div className="export-pdf__skipped-actions">
        <label className="export-pdf__check">
          <input
            type="checkbox"
            checked={all}
            onChange={() =>
              setPicked(all ? new Set() : new Set(drafts.map((d) => d.sceneId)))
            }
          />
          全選
        </label>
        <button
          type="button"
          onClick={() => {
            onAct([...picked]);
            setPicked(new Set());
          }}
          disabled={picked.size === 0}
        >
          {action}
        </button>
      </div>
    </>
  );
}

/** 草稿成員讓整組印不出來（殘缺的對剪比不印更糟）—— 略過它的後果比表面上大，要說出來。 */
function GroupConsequence({ groupMates }: { groupMates: string[] }) {
  return (
    <span className="export-pdf__group">
      ，此場屬於對剪群組，
      {groupMates.length > 0
        ? `同組的 ${groupMates.join("、")} 會一起略過`
        : "整組都不會印"}
    </span>
  );
}

/** 「前往修改」。名字帶場次號 —— 一整排同名的鈕，螢幕閱讀器分不出是哪一場的。 */
function GoTo({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="export-pdf__goto"
      aria-label={`前往修改 ${label}`}
      onClick={onClick}
    >
      前往修改
    </button>
  );
}

/** 登場人物提示（§4.7）另外列：**提醒但不阻擋**，它可能是正確狀態（聲音入鏡、人沒入鏡）。 */
function AppearingReminders({
  check,
  onGoTo,
}: {
  check: ExportPreflight;
  onGoTo: (sceneId: string) => void;
}) {
  return (
    <div
      className="export-pdf__appearing"
      role="group"
      aria-labelledby="export-pdf-appearing"
    >
      <p id="export-pdf-appearing" className="export-pdf__appearing-title">
        有台詞、但不在登場人物欄的人：
      </p>
      <p className="export-pdf__hint">
        不阻擋匯出；但如果要在場次標題下印登場人物，這幾位不會出現在上方。
      </p>
      <ul className="export-pdf__appearing-rows">
        {check.appearing.map(({ sceneId, label, speakers }) => (
          <li key={sceneId}>
            <span className="export-pdf__appearing-label">{label}</span>
            <span>{speakers.join("、")}</span>
            <GoTo label={label} onClick={() => onGoTo(sceneId)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 伺服器在 `content-disposition` 的 `filename*` 給的檔名（劇本名稱_交付時間）。 */
function filenameOf(response: Response): string | null {
  const match = /filename\*=UTF-8''([^;]+)/i.exec(
    response.headers.get("content-disposition") ?? "",
  );
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
