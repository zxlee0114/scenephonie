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
 * ── 無障礙 ────────────────────────────────────────────────────────────
 * icon 本身 `tabIndex={-1}`：編劇每一場都要用 Tab 走一遍 metadata，一格一個 icon 會讓那條路
 * 加倍長。但只把它移出 tab 序會讓純鍵盤使用者再也按不到它（WCAG 2.1.1），所以三種人各有
 * 一條完整的路：
 *
 * | 誰 | 路 |
 * |---|---|
 * | 滑鼠 | 點 icon |
 * | 螢幕閱讀器 | 欄位的 `aria-describedby` 指向 `summary` —— 一聚焦就聽見，不必開彈窗 |
 * | 純鍵盤 | 欄位上按 **⌥/**（`aria-keyshortcuts` 宣告出來，懸停 icon 時也印在旁邊） |
 *
 * 快捷鍵原本是 F1（那是它在桌面軟體裡的老位置），改成 ⌥/ 是因為 macOS 的 F1 預設是螢幕
 * 亮度鍵 —— 要按 `fn+F1` 才傳得到網頁，等於這條路對多數人不存在（使用者裁決 2026-09-10）。
 *
 * 彈窗關閉時焦點回到**欄位**而不是 icon —— 回到一個 Tab 走不到的地方等於把焦點丟掉。
 */
"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

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
          <b>i</b>（INT.）內景、<b>e</b>（EXT.）外景、<b>m</b>（MONTAGE）雜景。
          內外景也是 <b>i</b>（INT./EXT.）—— 同一顆鍵命中兩個，再按一次就換到下一個。
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
          <b>d</b>（DAY）日、<b>n</b>（NIGHT）夜。晨（DAWN）與昏（DUSK）也是 <b>d</b> ——
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
            （<code>/continue-to</code>），兩段各自單值。
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
  /** 開啟前焦點在哪 —— 關閉時要還它（而不是還給 tab 走不到的 icon）。 */
  const returnTo = useRef<HTMLElement | null>(null);

  const openPanel = () => {
    returnTo.current = document.activeElement as HTMLElement | null;
    setOpen(true);
  };

  const closePanel = () => {
    setOpen(false);
    returnTo.current?.focus();
  };

  // 開啟後把焦點移進面板：Esc 才有地方接，螢幕閱讀器也才會讀出標題與內文。
  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);

  // 點到別處就關 —— 但**不**搶焦點回來，使用者正要去點的就是別的東西。
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (ev: PointerEvent) => {
      if (!host.current?.contains(ev.target as Node)) setOpen(false);
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

  return (
    <span className={`field-info${className ? ` ${className}` : ""}`} ref={host} onKeyDown={onKeyDown}>
      {children(summaryId)}

      {/* 一句話版本只給輔助技術 —— 它是欄位的 aria-describedby，畫面上不佔位。 */}
      <span id={summaryId} className="sr-only">
        {text.summary}
      </span>

      <button
        type="button"
        className="field-info__button"
        // 每一場都要 Tab 走一遍 metadata，一格一個 icon 會讓那條路加倍長。移出 tab 序的代價由
        // aria-describedby（螢幕閱讀器）與 ⌥/（純鍵盤）補回來 —— 見檔頭那張表。
        tabIndex={-1}
        aria-label={`關於${text.title}`}
        aria-expanded={open}
        onMouseDown={(e) => {
          // chip row 住在 contentEditable={false} 裡，預設行為會把選取丟到別處。
          e.preventDefault();
          if (open) setOpen(false);
          else openPanel();
        }}
      >
        ⓘ
      </button>

      {/* 懸停時才出現的快捷鍵提示。icon 走不到 tab 序，這是它唯一自己說得出「還有鍵盤這條路」
          的地方 —— 而且看得到 icon 的人正好就是還沒發現快捷鍵的人。 */}
      {!open && (
        <span className="field-info__hint" aria-hidden="true">
          ⌥/
        </span>
      )}

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
          <h2 id={titleId} className="field-info__title">
            {text.title}
          </h2>
          {text.body}
        </div>
      )}
    </span>
  );
}
