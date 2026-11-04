/**
 * metadata 欄位旁邊的說明（票券 08 驗收回饋 2026-09-10）。
 *
 * **它只講定義與出路，不勸、不擋。** 每個欄位各自有一件編劇會踩到的事 —— 雜景為什麼長在
 * 內外欄、地點為什麼只能填一個、登場人物的判準是入鏡而不是台詞、一群人齊聲說為什麼不是人物
 * （票券 09 加進來的第五格）—— 而這些話必須在**打字之前**
 * 就在那裡，不是被拒絕之後才冒出來。這是 ADR-0006 那條方法論的同一個形狀：事前標注勝過
 * 事後提示，因為它在錯誤發生前作用。
 *
 * 時間欄沒有坑，但也給一份：同一排裡有的有 icon、有的沒有，看起來像漏了。
 *
 * ── 三種人三條路 ──────────────────────────────────────────────────────
 * 原本每格旁邊一顆 ⓘ（`tabIndex={-1}`，懸停才印出 ⌥/）。票 101 把它拿掉：每場 5 顆、三場 15 顆，
 * 而懸停提示在觸控上根本不存在。說明改成**欄位選單最下面的一列** `ⓘ 關於地點 (⌥/)`，
 * 快捷鍵直接寫在列上，滑鼠、觸控、鍵盤都看得到：
 *
 * | 誰 | 路 |
 * |---|---|
 * | 滑鼠／觸控 | 點進欄位 → 選單最下面那一列（空欄位也開，只有點進來才開 —— Tab 進來不開） |
 * | 螢幕閱讀器 | 欄位的 `aria-describedby` 指向 `summary` —— 一聚焦就聽見，不必開彈窗 |
 * | 純鍵盤 | 欄位上按 **⌥/**（`aria-keyshortcuts` 宣告出來；一打字，選單的說明列也印著它） |
 *
 * 那一列什麼時候出現、能不能被預選，是欄位元件自己的事（它們各自握著選單）；這裡經由
 * context 交給它們要印的字與打開的動作（`useFieldInfoRow`）。
 *
 * 快捷鍵原本是 F1（那是它在桌面軟體裡的老位置），改成 ⌥/ 是因為 macOS 的 F1 預設是螢幕
 * 亮度鍵 —— 要按 `fn+F1` 才傳得到網頁，等於這條路對多數人不存在（使用者裁決 2026-09-10）。
 *
 * 彈窗關閉時焦點回到**欄位** —— 打開前焦點在哪就還給哪裡。
 *
 * ── 返回（票 101 第二輪）─────────────────────────────────────────────
 * 打開前畫面上有選單或待確認面板的話，面板最上面放一列 `← 返回 (Esc)`；它與 Esc（以及再按一次
 * ⌥/）做同一件事：**退一層**，回到打開說明前的那一層，高亮停在原處。打開前什麼都沒有（Tab 進來
 * 直接按 ⌥/）就不放，Esc 照舊只回到欄位 —— 「返回」只回剛才在的地方，不替欄位新開選單。
 * 剛才有沒有、要怎麼回去，只有欄位知道：它經由 `provideBack` 交一個 `BackSource` 過來，
 * 這裡在打開的那一刻問它。點到面板外是走掉，不是返回。
 */
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import { useAnchoredPosition } from "./use-anchored-position";

/**
 * 這一下是不是「開說明」——**⌥/**。
 *
 * ⚠️ macOS 上 `⌥/` 送出來的 `key` 是 `÷`（Option 會改寫字元），所以不能只比對 `"/"`。
 * `code` 是實體鍵位（`Slash`），跨鍵盤配置都對得上，那才是主要判準；`key` 的兩種寫法留著
 * 當備援，給 `code` 不可靠的環境（部分測試工具、虛擬鍵盤）。
 */
export function isHelpKey(e: {
  altKey: boolean;
  key: string;
  code?: string;
}): boolean {
  return e.altKey && (e.code === "Slash" || e.key === "/" || e.key === "÷");
}

/** 給 `aria-keyshortcuts` 用的宣告字串（欄位那一側掛的就是它）。 */
export const HELP_KEY_HINT = "Alt+/";

export type FieldInfoKey = "intExt" | "time" | "location" | "character" | "extras";

type FieldInfoText = {
  title: string;
  /** 一句話版本 —— 掛在欄位的 `aria-describedby` 上。彈窗是它的展開，不是它的替代。 */
  summary: string;
  body: ReactNode;
};

export const FIELD_INFO: Record<FieldInfoKey, FieldInfoText> = {
  intExt: {
    title: "內外",
    summary: "這一場在室內或室外。雜景是逃生口，宣告這一場橫跨多個未指定的地點。",
    body: (
      <>
        <p>這一欄回答攝影機在室內還是室外。業界順場表上它叫「景」。</p>
        <p>
          同一場既有室內也有室外的戲選<b>內外景</b>。
        </p>
        <p>
          <b>雜景</b>是第四個值，但它不描述室內外 —— 它宣告「這一場橫跨多個未指定的地方」
          （主角在街頭巷尾到處找失蹤的小狗）。它長在這一欄，是因為台灣業界既有的寫法就把它
          寫在這個位置。
        </p>
        <p>選了雜景，這一場的地點欄才可以填多個，也可以留空。</p>
        <p>
          鍵盤上按一顆字母就直接選好，不必開選單 —— 用的是場次標題行本來的英文寫法：
          <b>i</b> (INT.) 內景、<b>e</b> (EXT.) 外景、<b>m</b> (MONTAGE) 雜景。
          內外景也是 <b>i</b> (INT./EXT.) —— 同一顆鍵命中兩個，再按一次就換到下一個。
        </p>
      </>
    ),
  },
  time: {
    title: "時間",
    summary: "這一場的時段：日、夜、晨、昏。它決定的是打光，不是劇情的鐘點。",
    body: (
      <>
        <p>四個值：日、夜、晨、昏。</p>
        <p>
          業界順場表上這一欄叫「光」—— 它要回答的是這一場<b>怎麼打光</b>，不是故事發生在幾點。
          下午三點與上午十點的戲都是「日」。
        </p>
        <p>
          鍵盤上按一顆字母就直接選好，不必開選單 —— 用的是場次標題行本來的英文寫法：
          <b>d</b> (DAY) 日、<b>n</b> (NIGHT) 夜。晨 (DAWN) 與昏 (DUSK) 也是 <b>d</b> ——
          三個都撞在同一顆鍵上，再按一次就換到下一個。
        </p>
      </>
    ),
  },
  location: {
    title: "地點",
    summary: "一個場次一個地點。橫跨多地時用雜景或接續子場次。",
    body: (
      <>
        <p>一個場次發生在一個地點 —— 時空一變就是新場次，所以這一欄是單值。</p>
        <p>
          <b>算不算同一個地點，看美術上要不要分開處理</b>，不是看名字，也不是看地理位置。
          同一個房間的「二十年前」與「現在」是兩個地點（要陳設兩次）；「未知大樓房間」與後段
          揭露的「海豚公寓房間」是同一個地點的兩個名字（陳設只有一套）。
        </p>
        <p>地點之間沒有從屬關係：「公寓」與「公寓客廳」是兩筆各自獨立的地點，不是父子。</p>
        <p>需要多個地點時，這個工具裡有兩條路：</p>
        <ul>
          <li>
            快速跳接的多地畫面（街頭巷尾到處問人）→ 內外欄選<b>雜景</b>，這一欄就變成多值。
          </li>
          <li>
            人物從一處走到另一處的連續動作（客廳走到陽台）→ 用<b>接續子場次</b>
            {" "}(<code>/continue-to</code>)，兩段各自單值。
          </li>
        </ul>
      </>
    ),
  },
  character: {
    title: "登場人物",
    summary: "這一場入鏡的人物。判準是入鏡，不是有沒有台詞；匯出時預設不印。",
    body: (
      <>
        <p>這一欄給劇組排通告用 —— 它回答的是「這一場要叫哪些演員來」。</p>
        <p>
          <b>判準是入鏡，不是有沒有台詞。</b>
          只有聲音的角色（標了 V.O.／O.S.）不算；沒有台詞但站在畫面裡的算。
        </p>
        <p>
          系統不會從對白替你推導這一欄（推導會讓製片誤排通告），只會在某人有一般對白卻不在
          名單上時提示一次，你可以忽略它。
        </p>
        <p>
          <b>匯出時預設不印這一欄</b> —— GHSA 範本 2022 年改版已經拿掉人物欄。需要的話在匯出
          選項打開。
        </p>
      </>
    ),
  },
  extras: {
    title: "群演",
    summary:
      "這一場的背景演員：描述加人數，可以多組。一個人說話寫成人物，一群人齊聲說才是群演。",
    body: (
      <>
        <p>
          背景演員的需求，寫成<b>描述 ＋ 人數</b>（<code>咖啡廳客人 x8</code>）。一場可以有好幾組，
          用頓號隔開。
        </p>
        <p>
          <b>一個人說話 → 人物</b>（就算他只叫「路人甲」，那也要單獨找一個會演的演員、單獨排通告）。
          <b>一群人齊聲說 → 群演</b>（那 20 個人一起喊一聲，就是這批背景演員）。對白的人物欄兩種都填得進去。
        </p>
        <p>
          群演<b>不是人物</b> —— 第 3 場的路人與第 7 場的路人不是同一批人。所以描述雖然會幫你補上
          別場打過的字，那<b>只是字</b>，兩場之間不會產生任何關聯。
        </p>
        <p>這一欄<b>進場次表，不進 PDF</b>。「臨演」與「群眾演員」不分（劇本這一層沒有資訊分得開）。</p>
      </>
    ),
  },
};

/**
 * 欄位選單最下面那一列（票 101）—— `FieldInfo` 經由 context 交給包在裡面的欄位元件。
 *
 * 欄位自己決定這一列什麼時候出現、能不能被預選（規則見票 101 的結論）；這裡只給它要印的字、
 * 打開說明的動作，以及說明現在開著沒（開著時選單與待確認面板要讓位）。
 */
export type FieldInfoRow = {
  /** `ⓘ 關於地點 (⌥/)` —— 快捷鍵印在列上，滑鼠、觸控、鍵盤都看得到。 */
  label: string;
  isOpen: boolean;
  open: () => void;
  /** 欄位交來「怎麼回去」（見檔頭〈返回〉）；每次 render 後重交一次，拿到的才是當下的畫面。 */
  provideBack: (source: BackSource) => void;
};

/**
 * 說明打開的那一刻被問一次：剛才畫面上有選單或待確認面板的話，給一個「回到那裡」的動作
 * （高亮停在原處）；沒有就是 null —— 面板不放返回列。
 */
export type BackSource = () => (() => void) | null;

const FieldInfoContext = createContext<FieldInfoRow | null>(null);

/** 這一格掛了說明的話，選單要放的那一列；沒掛就是 null（欄位單獨使用時）。 */
export function useFieldInfoRow(): FieldInfoRow | null {
  return useContext(FieldInfoContext);
}

/** 返回列的文字 —— 選單與待確認面板共用一個「返回」，Esc 印在列上（同說明列印 ⌥/）。 */
const BACK_LABEL = "← 返回 (Esc)";

/** 說明列的文字。 */
const infoRowLabel = (info: FieldInfoKey) => `ⓘ 關於${FIELD_INFO[info].title} (⌥/)`;

/**
 * 包住一格 metadata 欄位，替它掛上說明。
 *
 * `children` 是函式，因為欄位本身要拿到 `describedBy`（`aria-describedby` 的目標 id）——
 * 說明的第一條路是「聚焦欄位就聽見」，那條路不經過這裡的任何 DOM。
 */
export function FieldInfo({
  info,
  className,
  children,
}: {
  info: FieldInfoKey;
  className?: string;
  children: (describedBy: string) => ReactNode;
}) {
  const text = FIELD_INFO[info];
  const summaryId = useId();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  /** 開啟前焦點在哪 —— 關閉時要還它。 */
  const returnTo = useRef<HTMLElement | null>(null);
  const backSource = useRef<BackSource | null>(null);
  /** 這一次打開時拿到的「回去」；null ＝ 打開前沒有選單，面板不放返回列。 */
  const [back, setBack] = useState<(() => void) | null>(null);

  const openPanel = () => {
    returnTo.current = document.activeElement as HTMLElement | null;
    // 現在就問 —— 欄位接著會收起選單，晚一步問就只剩「沒有」。
    const goBack = backSource.current?.() ?? null;
    setBack(() => goBack);
    setOpen(true);
  };

  /** Esc、返回列、再按一次 ⌥/：退一層。 */
  const closePanel = () => {
    setOpen(false);
    setBack(null);
    returnTo.current?.focus();
    back?.();
  };

  // 錨在整格上，開在欄位選單原本的位置 —— 說明**取代**選單（票 101；DESIGN.md 的
  // The One Placement Rule，票券 33）。
  useAnchoredPosition(panel, () => host.current, { active: open });

  // 開啟後把焦點移進面板：Esc 才有地方接，螢幕閱讀器也才會讀出標題與內文。
  useEffect(() => {
    // 不為了開說明捲動頁面（The One Placement Rule 第 5 條）—— 座標在 layout effect 裡已經放好了。
    if (open) panel.current?.focus({ preventScroll: true });
  }, [open]);

  // 點到面板外就關 —— 但**不**搶焦點回來，使用者正要去點的就是別的東西。點回欄位本身也算：
  // 那一下是又要選單了（欄位的 `pointerdown` 會把它開回來）。
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (ev: PointerEvent) => {
      if (panel.current?.contains(ev.target as Node)) return;
      setOpen(false);
      setBack(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  // ⌥/ 在這一格裡的任何地方都算（欄位聚焦時按下的鍵會冒泡到這裡）。
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (!isHelpKey(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (open) closePanel();
    else openPanel();
  };

  const row: FieldInfoRow = {
    label: infoRowLabel(info),
    isOpen: open,
    open: openPanel,
    provideBack: (source) => {
      backSource.current = source;
    },
  };

  return (
    <FieldInfoContext.Provider value={row}>
    <span className={`field-info${className ? ` ${className}` : ""}`} ref={host} onKeyDown={onKeyDown}>
      {children(summaryId)}

      {/* 一句話版本只給輔助技術 —— 它是欄位的 aria-describedby，畫面上不佔位。 */}
      <span id={summaryId} className="sr-only">
        {text.summary}
      </span>

      {open && (
        <div
          className="field-info__panel"
          role="dialog"
          aria-labelledby={titleId}
          tabIndex={-1}
          ref={panel}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            e.stopPropagation();
            closePanel();
          }}
        >
          {back && (
            // 標題前面：內文再長，一打開也看得到。
            <button type="button" className="field-info__back" onClick={closePanel}>
              {BACK_LABEL}
            </button>
          )}
          <h2 id={titleId} className="field-info__title">
            {text.title}
          </h2>
          {text.body}
        </div>
      )}
    </span>
    </FieldInfoContext.Provider>
  );
}
