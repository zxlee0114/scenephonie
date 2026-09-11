/**
 * 實體欄位 —— 地點欄、登場人物欄與對白人物欄共用的一個元件（§4.7、§7.6）。
 *
 * 三件事在這裡並存：
 *
 * **① 多值輸入規則**（`@scenephonie/schema` 的 `splitNamesLive`）：標點是分隔符、空白是名字的
 * 一部分，即時切成 chip，Backspace 還原成可編輯文字，貼上走同一份解析。規則本身住在 kernel，
 * 這裡只負責把它接到鍵盤上 —— 「頓號怎麼切」在伺服器端與這裡必須是同一個答案。
 *
 * **② 自動補全三列**：命中既有（`📍`／`👤`）／建立新實體（`＋`）／作為既有實體的另一個名字
 * （`🔗`）。**打字當下不問任何問題** —— 系統不可能懷疑「海豚公寓房間」就是「未知大樓房間」，
 * 積極合併相似名會把兩套陳設併成一套。第三列是留給編劇**主動說出口**的地方，他寫的當下就知道。
 *
 * **③ 注音組字期間選單完全不動作**（§7.6）：組字中不切 chip、不接手任何一顆鍵、不回寫外部
 * 狀態。**看得見不等於動得了** —— 組字中會浮出一份唯讀的預覽（命中哪幾筆），但它接不到鍵盤
 * 也接不到滑鼠；要選什麼，等 `compositionend` 之後才算數。
 * 這是票券 03 那個 bug 家族的同一條防線 —— 注音的空白鍵是選字鍵、Enter 是送出鍵，把任何
 * 語意綁在那兩顆鍵上都會在組字期間被 IME 吃掉。
 *
 * ⚠️ **建立實體與寫入 doc 的順序在這裡定案**：`onCreate` 先跑完（實體落地、目錄多一筆），
 * 才呼叫 `onCommit` 讓上層跑 domain command。反過來的話 command 會被自己的不變式擋下（§6.6）。
 */
"use client";

import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import { isExtraId, parseExtra, splitNamesLive } from "@scenephonie/schema";

import { useChipCaret } from "./chip-caret";
import { chipRow, columns } from "./chip-row";
import { EXTRA_MARK, HIT_MARK, NEW_MARK, RENAME_MARK } from "./field-marks";
import { HELP_KEY_HINT } from "./field-info";

export type EntityOption = { id: string; name: string };
/**
 * 本場一批群演在這一欄的樣子：`{ id: extraId, name: 描述, count: 人數 }`。
 *
 * 人數在這裡是**措辭的一部分**，不是裝飾：升格那一列要在按下去之前就說出「群演剩 1 人」，
 * 而剩下 0 人時那一筆會整批消失（票券 35），措辭也得跟著換。
 */
export type SceneExtraOption = EntityOption & { count: number };
/**
 * 一個引用：實體 id ＋ **這一場顯示的名字**（別名不存在實體上，就是這個欄位）。
 *
 * `id` 為 `null` ＝ **從來沒有 id 的過渡引用**（票券 04／07 的佔位形狀）。讀取容忍它、
 * chip 照樣顯示顯示名，但它寫不回去 —— 沒有實體可指（§6.6）。用 `null` 而不是空字串，
 * 是因為「沒有實體」是一個狀態，不是一個名字剛好是空的 id。
 */
export type EntityRef = { id: string | null; displayName: string };

export type EntityKind = "location" | "character";

/**
 * 一筆實體是**從哪一條路**生出來的。
 *
 * 存在的理由只有一個，而且是暫時的：票券 08 留了個暫時措施「在對白人物欄新建的人物順手掛進
 * 登場人物欄」，而**升格出來的那一位不套用**（票券 35 裁決 —— 推導不自動把有台詞的人加進
 * 登場人物欄）。呼叫端分不出兩條路的話，就只能一律套用或一律不套用。
 *
 * ⚠️ 票券 10 把那個暫時措施換成提示選單的那一天，這個型別就沒有讀者了，跟著拆掉。
 */
export type EntityBirth = "typed" | "promote";

type Props = {
  kind: EntityKind;
  /** 未填時的提示字，也是無障礙標籤。 */
  placeholder: string;
  refs: readonly EntityRef[];
  /** 這個專案的名字目錄（append-only）。 */
  options: readonly EntityOption[];
  /**
   * 每筆實體被幾場引用 —— 選單第一列的「（12 場）」。沒給就不印。
   *
   * **是函式不是值**：算它要走一遍整份 doc，而對白的 node view 每打一個字就重繪一次（§7.7）。
   * 只有選單真的要畫的時候才問。
   */
  usage?: () => ReadonlyMap<string, number>;
  /** 多值欄（地點／登場人物）；對白人物欄是單值。 */
  multiple?: boolean;
  /**
   * 單值欄已經有一筆時，第二筆**先問過編劇**，不直接覆蓋。
   *
   * 不是所有單值欄都要問：對白人物欄換一個人講話是常態，問他等於每次改口都要按兩次。
   * 地點欄不一樣 —— 打第二個地點的編劇多半不是要換掉第一個，而是這一場真的橫跨兩地，
   * 那是一個**場次形狀**的問題（§4.3），不該由一次靜悄悄的覆蓋替他決定。
   */
  confirmReplace?: {
    /** 「兩個都留」那條路（地點欄 ＝ 把這一場改成雜景）。沒給就只有取代與放棄。 */
    escalate?: { label: string; run: () => boolean };
  };
  /**
   * 本場次的群演，作為**這一欄的另一種合法目標**（§4.7、§5.1）。只有對白的人物欄給。
   *
   * 分界規則是：**一個人說話 → 人物**（即使名字只是「路人甲」），**一群人齊聲說 → 群演**。
   * 判準跟著通告走 —— 路人甲有一句台詞就要單獨找一個演員；那 20 個人齊聲喊一聲，就是那批
   * 背景演員一起喊。系統分不出來，所以兩種目標並列在選單裡，由編劇挑。
   *
   * 形狀是 `{ id: extraId, name: 描述 }`。它們**不經過 `usage`** —— 群演的存在性不是
   * 「被幾場引用」，而是它就寫在這一場的 `extras` attr 裡。
   */
  sceneExtras?: readonly SceneExtraOption[];
  /**
   * 在這一欄**直接新建一筆群演**（`眾人 x20` → 一筆本場的群演 ＋ 一個指向它的引用）。
   *
   * 存在的理由是心流：齊聲那一句寫到一半跳去簡表填群演欄，回來時思緒就斷了（§4.7）。
   * 同步回傳（不像 `onCreate` 要落地到伺服器）—— 群演的家就是這份 doc。
   */
  onCreateExtra?: (text: string) => EntityOption | null;
  /**
   * 從本場某一批群演裡**拉一個人出來**（升格 ＝ 特約，票券 35）。只有對白的人物欄給。
   *
   * 這一欄只負責人物那一半 —— 走的是與其他三列同一條 `resolve`（命中既有就是那一位，沒命中
   * 就建一筆新的），**系統不替人物取名**。群演減一那一半由呼叫端接手，兩半要落在同一個
   * transaction（⌘Z 一次回到升格前），所以這支在 `onCommit` **之前**同步呼叫，讓呼叫端把它
   * 記在手上 —— 與 `onCreateExtra` 同一個形狀。
   */
  onPromoteFromExtra?: (extraId: string, characterId: string) => void;
  /** 引用有變動時回報**整份**引用清單（上層跑 domain command 寫回 doc）。 */
  onCommit: (refs: EntityRef[]) => void;
  /** 建立一筆新實體。**必須在 `onCommit` 之前完成** —— 先建立實體、再寫入 doc。 */
  onCreate: (name: string, via: EntityBirth) => Promise<EntityOption | null>;
  /** 把實體本身改名（`✏️` 那一列，以及第三列第二步的「同時把實體改名」）。沒給就不出現。 */
  onRenameEntity?: (id: string, name: string) => void;
  /**
   * 改名之後，**別場還印著舊名的那些引用**要不要一起跟上（票券 39）。
   *
   * 這裡不替編劇決定：顯示名剛好等於舊實體名的引用，可能是他沒特地取名（那就該跟著改），
   * 也可能是他就要那幾場印那個字。所以 `count` 先數出來**寫在按下去之前**（ADR-0006），
   * 數到 0 就一步改完 —— 沒有別場印舊名時沒有什麼好問的。
   *
   * 沒給這支就只有「改目錄 ＋ 這一筆」那一半，與這張票之前的行為相同。
   */
  retitleOthers?: {
    /**
     * 還印著 `name` 的場次數（手上那一筆已經從 doc 拿掉，不在裡面）。
     *
     * ⚠️ **可能包含編劇正站著的這一場**：他改的是這一欄那一筆，而同一場的別欄（登場人物欄
     * 與對白人物欄常是同一個人）仍印著舊名。那一場確實還印著舊名，所以它算進來是誠實的 ——
     * 措辭因此是「還有 N 場印著…」而不是「別的 N 場」。
     */
    count: (id: string, name: string) => number;
    /**
     * 把那些引用的顯示名從 `from` 改成 `to`（走 kernel command，動的是 doc）。
     *
     * 回傳寫成功了沒 —— 被 command 拒絕時**整個改名都不做**，不留下「目錄改了、稿沒改」
     * 的半套（見 `renameEntity`）。
     */
    run: (id: string, from: string, to: string) => boolean;
  };
  className?: string;
  inputClassName?: string;
  /**
   * 欄位說明的 id（`FieldInfo` 給的）。有它就代表這一格掛了說明 —— 於是也宣告 ⌥/，
   * 讓純鍵盤使用者知道那個 `tabIndex={-1}` 的 icon 有一條鍵盤路。
   */
  describedBy?: string;
  /** 這一格自己用不到的鍵（chip row 的格線導航）。焦點在 chip 上時 target 是那個 chip。 */
  onKeyDown?: (event: ReactKeyboardEvent<HTMLElement>) => void;
  inputRef?: React.Ref<HTMLInputElement>;
};

/**
 * 選單的階段。`aliasPick`／`aliasMode` 是第三列（別名）展開後的兩步；`rename` 是 `✏️`
 * 那一列展開的第二步（**只在別場還印著舊名時才展開** —— 沒得問就不問，票券 39）。
 */
type Stage =
  | { name: "suggest" }
  | { name: "aliasPick" }
  | { name: "aliasMode"; target: EntityOption }
  /** `others` ＝ 還印著舊名的場次數，兩列的措辭都靠它。 */
  | { name: "rename"; target: EntityOption; others: number };

type Row = {
  key: string;
  label: ReactNode;
  run: () => void;
};

export function EntityField({
  kind,
  placeholder,
  refs,
  options,
  usage,
  sceneExtras = [],
  onCreateExtra,
  onPromoteFromExtra,
  multiple = false,
  confirmReplace,
  onCommit,
  onCreate,
  onRenameEntity,
  retitleOthers,
  className,
  inputClassName,
  describedBy,
  onKeyDown,
  inputRef,
}: Props) {
  const [text, setText] = useState("");
  const [stage, setStage] = useState<Stage>({ name: "suggest" });
  /** 只為了重繪 —— 「手上那一筆」是 ref 不是 state（見 `editing`），改它不會驚動 React。 */
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  /** 這一輪由本欄位建出來的實體 —— 新建 chip 與命中 chip 視覺可辨（`＋` vs `📍`）。 */
  const [bornHere, setBornHere] = useState<readonly string[]>([]);
  /**
   * 打好了、但**還沒變成實體**的第二個名字（見 `confirmReplace`）。
   *
   * 它停在輸入框裡並且**整串反白** —— 編劇一個 Backspace 就能把它清掉，或從面板挑一條路。
   * 這一刻沒有任何實體被建立、也沒有任何引用被動到：待確認就是字面意思。
   */
  const [pending, setPending] = useState<string | null>(null);
  /**
   * 剛在這一欄升格過一個人 → 欄位下方那一行命名提示（票券 35）。
   *
   * **這一欄失焦就收**：他移開就是決定了。所以不需要一顆 ✕，也就不必存任何「他關掉過」的
   * 狀態 —— 那正是 §7.3 否決過的那種看不見的狀態。它是建議不是規則，不擋任何寫入。
   */
  const [showNamingHint, setShowNamingHint] = useState(false);
  /**
   * 組字中嗎 —— **ref 是真相（同步），state 是畫面（重繪）**。
   *
   * 只有 ref 的話會漏掉一次重繪：注音按 Enter 送出時 `text` 通常與組字期間的最後一次
   * `onChange` 相同，React 於是 bail out，選單要等到下一次真的改到 `text`（使用者多打的
   * 那個空白）才畫出來。**「確認輸入」的那一刻就是 `compositionend`**，它必須自己觸發一次
   * 重繪，否則選單的時機會晚一個按鍵。
   */
  const composing = useRef(false);
  const [composingNow, setComposingNow] = useState(false);
  /**
   * 正在被重新編輯的那一筆引用（點 chip、或空欄位上按 Backspace 拿下來的那一筆）。
   *
   * 它已經從 doc 拿掉了，所以如果沒有別場引用它，此刻它**暫時是孤兒** —— 而孤兒不算存在
   * （ADR-0005），`resolve` 於是會把原樣放回的名字當成新東西再建一筆。那是憑空多一筆實體，
   * 舊的那筆變成真的孤兒。拿下來的東西放回去就該是原來那一個。
   */
  const editing = useRef<EntityRef | null>(null);
  /**
   * 拿起來**那一刻**，手上那一筆實體用在幾場 —— **含編劇正站著的這一場**。
   *
   * 為什麼要快照：`editRef` 第一件事就是把引用從 doc 上拿掉，`usage()` 從那之後就少算這一場
   * （除非同一場的別欄也引用它）。但編劇要判斷的是「這筆實體有多大」，那個數字不該因為他把
   * chip 拿起來就少一 —— 判準與 ADR-0005 那條邊界同一條：**手上那一筆不是孤兒**。
   */
  const heldScenes = useRef<number | null>(null);
  /**
   * **輸入框排在第幾格** —— `0` ＝ 所有 chip 之前，`null` ＝ 全部之後（平常的樣子）。
   *
   * 一個 ref 扛三件事，因為它們本來就是同一件事「游標停在哪」：
   * - 拿一筆起來改時輸入框停在它原本的位置（改一個字不該讓它跑到隊尾）；
   * - 定案之後游標停在**那一顆之後**（見 `merge`），接著打的字就接在它後面；
   * - 點兩顆 chip 之間那道縫也是改它 —— 下一筆插在哪由編劇決定（2026-09-11 驗收回饋）。
   *
   * 住在 `ref` 不是 state：`merge`／`editRef` 讀的必須是這一刻的值，不是上一次重繪的值。
   * 改了它要自己 `redraw()`。
   */
  const caret = useRef<number | null>(null);
  /** 下一次重繪之後把輸入框整串反白（值要先進 DOM 才選得到）。 */
  const selectNext = useRef(false);
  /** 呼叫端也可能要這個 input（焦點串接），所以自己留一份再轉交出去。 */
  const input = useRef<HTMLInputElement>(null);
  const takeInput = (el: HTMLInputElement | null) => {
    input.current = el;
    if (typeof inputRef === "function") inputRef(el);
    else if (inputRef)
      (inputRef as { current: HTMLInputElement | null }).current = el;
  };
  const field = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectNext.current) return;
    selectNext.current = false;
    input.current?.select();
  });

  /**
   * 目前**存在**的實體 —— 目錄減掉孤兒（存在＝被引用，ADR-0005）。
   *
   * 沒有 `usage` 可問時（獨立使用的欄位、測試）就是整份目錄：那時沒有 doc，也就沒有
   * 「被誰引用」這個問題。
   */
  const existing = (): readonly EntityOption[] => {
    const counts = usage?.();
    return counts ? options.filter((o) => counts.has(o.id)) : options;
  };

  /** 同名的**存在**實體。孤兒不算命中 —— 它不存在，所以那個名字仍然是「建立新實體」。 */
  const byName = (name: string) =>
    existing().find((o) => o.name === name) ?? null;

  /**
   * 手上正在編輯的那一筆，**如果這個名字就是它**（票券 38）。
   *
   * `editRef` 為了把 chip 變回文字會先把引用從 doc 上拿掉，只被引用一次的實體於是暫時掉出
   * `existing()` —— 但**它不是孤兒，只是暫時被拿在手上**。ADR-0005 要擋的是 ⌘Z 留在目錄裡
   * 的殘骸，不是一個進行到一半的編輯動作。
   *
   * ⚠️ 只認**手上那一筆**，不放寬 `existing()`：孤兒仍然不進自動補全。
   */
  const editingMatch = (name: string): EntityOption | null => {
    const held = editing.current;
    const entity = heldEntity();
    if (!held || !entity) return null;
    return name === held.displayName || name === entity.name ? entity : null;
  };

  /**
   * 手上正握著的那一筆**指向哪一筆實體**（不問框裡的字改了沒）。
   *
   * 與 `editingMatch` 的差別就是那一句「不問名字」：命中列要的是「原封放回的是同一個」，
   * 改名列要的是「這個 id 的名字要換掉」—— 後者的前提正是**字已經改掉了**。
   *
   * 群演不在目錄裡，所以這一查順手把它們排除掉：群演沒有跨場次身分，也就沒有「實體改名」
   * 這件事（改它的顯示名就只是改這一場的叫法）。
   */
  const heldEntity = (): EntityOption | null => {
    const held = editing.current;
    if (held?.id == null) return null;
    return options.find((o) => o.id === held.id) ?? null;
  };

  /** 把幾筆引用併進現有的（單值欄就是取代成最後一筆）。 */
  const merge = (added: EntityRef[]) => {
    if (added.length === 0) return;
    if (!multiple) {
      onCommit([added[added.length - 1]!]);
      return;
    }
    const kept = refs.filter((r) => !added.some((a) => a.id === r.id));
    // 放在**游標停的地方**（2026-09-11 驗收回饋）：拿起來改的那一筆回到它原本的位置，點縫隙
    // 插進去的落在編劇指的那一格。登場人物欄的次序是編劇排的（誰先出場、誰是主角），改一個
    // 字就被擠到隊尾不合理。一口氣切出好幾筆（`小明、小華`）就整串插在那裡，順序跟他打的一樣。
    const at = caret.current;
    if (at != null && at <= kept.length) {
      caret.current = at + added.length; // 定案之後游標停在**這一串之後**
      onCommit([...kept.slice(0, at), ...added, ...kept.slice(at)]);
      return;
    }
    caret.current = null;
    onCommit([...kept, ...added]);
  };

  /**
   * 把一個名字變成引用：**命中同名實體就用它，否則建立一筆新的**。
   *
   * 這就是「打字當下不問任何問題」—— 不問「這是不是你上次那個？」，也不積極合併相似名。
   * 要說兩個名字指同一筆實體，走第三列。
   *
   * ⚠️ 這支只解析、**不寫回**：一次貼上多個名字時要等全部解析完才寫一次，否則第二筆會
   * 覆蓋掉第一筆（`refs` 是 prop，中途還沒重繪過）。
   */
  const resolve = async (
    name: string,
    via: EntityBirth = "typed",
  ): Promise<EntityRef | null> => {
    const held = editing.current;
    // 剛拿下來的那一筆是**群演**：改字改的是「這一場顯示的名字」，不是換一個目標。
    // （CONTEXT.md：群演欄寫「咖啡廳客人 x8」，對白顯示「眾人」—— 兩者本來就可以不同。）
    // 少了這一條，改一個字就會把 `ex_` 引用悄悄換成一筆新建的**人物**，而一人說話與一群
    // 齊聲說的分界是編劇的宣告，不該由改名這個動作替他翻面。
    if (isExtraId(held?.id)) return { id: held!.id, displayName: name };
    // 一般實體：名字沒改就是原封放回，用回它自己的 id（見 `editing`）。
    // 判準與選單那一列共用 `editingMatch` —— 兩邊對「沒改」的定義分家的話，選單會說一件事、
    // 按下去做另一件事，正好是票券 38 修掉的那種不一致。
    if (held?.id != null && editingMatch(name))
      return { id: held.id, displayName: name };

    const hit = byName(name);
    if (hit) return { id: hit.id, displayName: name };

    const created = await onCreate(name, via);
    if (!created) return null; // 建立失敗就什麼都不寫 —— 沒有實體就不該有引用（不變式 ⑧）
    setBornHere((ids) => [...ids, created.id]);
    return { id: created.id, displayName: name };
  };

  /** 一次解析多個名字（貼上、連打頓號），解析完寫一次。 */
  const resolveAll = async (names: string[]) => {
    const resolved: EntityRef[] = [];
    for (const name of names) {
      const ref = await resolve(name);
      if (ref) resolved.push(ref);
    }
    merge(resolved);
    // 那串字已經變成 chip 了 —— 手上不再握著任何一筆。Enter／離開欄位那條路走的是
    // `reset`，打頓號切出 chip 這條路少了這一句，手會一直握著一筆放不下來。
    editing.current = null;
    heldScenes.current = null;
    redraw();
  };

  /**
   * 把一個 chip 還原成**可編輯的文字**（點它，或在空欄位上按 Backspace）。
   *
   * 不是「刪掉再重打」：字回到輸入框、整串反白，於是改一個字就會重新走一次命中／新建／
   * 別名那三列 —— 改名這件事本來就該經過那個選單，而不是在 chip 上原地改掉（原地改分不出
   * 「這一場叫別的名字」與「這個實體改名了」，而那正是 §4.7 要編劇說清楚的事）。
   *
   * **手上已經握著一筆時擋住**（2026-09-11 裁決，推翻同日先做的「接力」）。接力是點下去先
   * 把手上那一筆定案、再拿起新的：少一次點擊，但同一個手勢有兩種看不見的結果 —— 那串字
   * 可能被當成改名定案，也可能被當成一筆新實體建出來，而按下去之前沒有人說得出是哪一種。
   * 擋住換回「編劇一次只在處理一筆」這件事永遠成立。
   *
   * 擋住的樣子看得見：握著時其餘 chip 掛 `.entity-chip--locked`（游標變回一般，連 × 一起）。
   * 跨欄位不在這條規則裡 —— 焦點一離開，`blur` 就把手上那一筆定案了，那不是同時握著兩筆。
   */
  const editRef = (ref: EntityRef) => {
    if (editing.current) return;
    // ⚠️ 在 `onCommit` 之前問 —— 引用一從 doc 上拿掉，這一場就從場次數裡消失了。
    heldScenes.current =
      ref.id == null ? null : (usage?.().get(ref.id) ?? null);
    caret.current = refs.indexOf(ref);
    editing.current = ref;
    onCommit(refs.filter((r) => r !== ref));
    setText(ref.displayName);
    setDismissed(false);
    setActive(0);
    // 拿起來的那一筆**整串反白**：再一顆 Backspace 就整串清掉，也可以直接覆寫。滑鼠點進來
    // 原本游標停在字尾，與 Backspace 進來兩種樣子 —— 統一成這一種（2026-09-11 驗收回饋）。
    selectNext.current = true;
    input.current?.focus();
  };

  /**
   * 輸入框排在第幾格（`caret` 的**收斂版**：夾住上界，`null` 就是隊尾）。
   *
   * 正在改某一筆時它就是那一筆原本的位置 —— 少了這一段，拿起來的那一筆在編輯途中看起來
   * 跑到了隊尾，放回去又跳回原位，中間那一段畫面是騙人的（2026-09-11 驗收回饋）。
   */
  const inputAt = Math.min(caret.current ?? refs.length, refs.length);

  /** chip 之間的方向鍵（票券 34 第三輪）—— 規則與版面說明見 `./chip-caret`。 */
  const chipCaret = useChipCaret({
    count: refs.length,
    home: inputAt,
    input,
    text,
    exit: (event) => onKeyDown?.(event),
    edit: (i) => {
      const ref = refs[i];
      if (ref) editRef(ref);
    },
    // 方向鍵也停得進 chip 之間那道縫（與滑鼠點它同一個結果）。手上握著一筆時不動 ——
    // 那一刻輸入框「排在第幾格」說的是那一筆的位置，挪走它畫面就對不上了。
    moveCaret: (at) => {
      if (editing.current) return;
      caret.current = at;
      redraw();
    },
  });

  /**
   * 把手上那一筆**放掉** —— 這一場對它的引用就此沒了（它在 chip 被拿起來時就從 doc 上撤掉了，
   * 這一步只是承認編劇不打算放回去）。
   *
   * 它是一個**獨立的一步**，不跟「字刪光」綁在一起：清空之後那一筆還握在手上，因為編劇可能
   * 正要重新命名它（2026-09-11 驗收裁決）。所以整條路是三段 —— 拿起來（字反白）／清空
   * （還握著，可以改名）／再一次 Backspace 才放手。
   */
  const letGo = () => {
    editing.current = null;
    heldScenes.current = null;
    // `caret` 刻意不動 —— 引用沒了，游標就留在它原本站的那一格（`a b |`，不是跳回隊尾）。
    redraw(); // 手上那一筆住在 ref 裡，放手不會自己觸發一次渲染（抬頭要跟著收）。
  };

  const closeMenu = () => {
    setStage({ name: "suggest" });
    setDismissed(true);
  };

  const reset = () => {
    editing.current = null;
    heldScenes.current = null;
    // `caret` 不清 —— `merge` 剛把它挪到新 chip 之後，那就是游標該在的地方。
    setText("");
    setStage({ name: "suggest" });
    setActive(0);
    setDismissed(false);
  };

  const query = text.trim();
  /** 這一筆會覆蓋掉已經在的那一筆嗎 —— 是的話就先問過（見 `confirmReplace`）。 */
  const needsConfirm = !multiple && !!confirmReplace && refs.length > 0;
  // 組字期間選單完全不動作（§7.6）；Esc 之後也不再自己彈回來，直到下一次打字。
  const menuOpen = !composingNow && !dismissed && query.length > 0;

  const rows: Row[] = [];
  if (pending && !dismissed && !composingNow) {
    // 待確認時面板**取代**自動補全 —— 這一刻要問的不是「哪一筆實體」，而是「這一場是什麼形狀」。
    const held = refs[0]?.displayName ?? "";
    rows.push({
      key: "replace",
      label: `⇄ 改成「${pending}」 —— 原本的「${held}」會被拿掉`,
      run: () => void replacePending(),
    });
    if (confirmReplace?.escalate) {
      rows.push({
        key: "escalate",
        label: confirmReplace.escalate.label,
        run: () => void escalatePending(),
      });
    }
    rows.push({
      key: "discard",
      label: `✕ 放棄「${pending}」`,
      run: () => {
        setPending(null);
        reset();
      },
    });
  } else if (menuOpen) {
    // **孤兒不出現在自動補全**（ADR-0005）—— 「存在＝被引用」不是一句口號，選單是它唯一
    // 看得見的地方。目錄是 append-only 的，裡面一定會累積 ⌘Z 留下的孤兒；「v1 永不清理」
    // 指的是**不刪資料列**，不是「照樣顯示」。
    const counts = usage?.();
    /** 選單印的場次數 —— 手上那一筆用拿起來之前的快照（見 `heldScenes`）。 */
    const scenesOf = (id: string) =>
      (id === editing.current?.id ? heldScenes.current : null) ??
      counts?.get(id);
    const known = existing();
    // 手上那一筆也算命中 —— 少了它，把自己拿回來改會看到「建立新實體『它自己』」（票券 38）。
    const exact = known.find((o) => o.name === query) ?? editingMatch(query);
    // ⚠️ 排掉的是 `exact` **那一筆**，不是「名字剛好等於 query 的」。兩者多數時候同一件事，
    // 但手上那一筆的顯示名可能不等於它在目錄裡的名字（別名，或實體改名後舊引用還留著舊字）
    // —— 那時同一筆實體會從 `exact` 與 `hits` 各進榜一次，選單印出兩列一模一樣的名字。
    const hits = known
      .filter((o) => o !== exact && o.name.includes(query))
      .slice(0, 5);

    if (stage.name === "suggest") {
      for (const option of [...(exact ? [exact] : []), ...hits]) {
        const count = scenesOf(option.id);
        // 手上那一筆的顯示名可能不是它在目錄裡的名字（別名，或實體改名後舊引用留著舊字）
        // —— 那時標籤主體印**實體名**、括號裡補這一場的叫法，沿用場次表那條慣例
        // （CONTEXT.md 地點詞條：印 `實體名（這一場的顯示名）`，只在兩者不同時才印）。
        // 主體是實體名而不是編劇打的字：他打的字他自己知道，不知道的是它會綁到誰。
        const alias = option === exact && query !== option.name ? query : null;
        const note = [alias && `這場顯示為 ${alias}`, count && `${count} 場`]
          .filter(Boolean)
          .join("，");
        rows.push({
          key: `hit:${option.id}`,
          label: `${HIT_MARK[kind]} ${option.name}${note ? `（${note}）` : ""}`,
          run: () => {
            // 命中列的顯示名就是實體名 —— 但**手上那一筆**用回框裡的字：它的顯示名可能是
            // 這一場的別名（ADR-0005：別名住在引用上），拿目錄名蓋回去等於靜悄悄改掉它。
            // 目錄命中的那一列兩者本來就相同，這一條只在「拿回來改」那條路上有差別。
            merge([
              {
                id: option.id,
                displayName: option === exact ? query : option.name,
              },
            ]);
            reset();
          },
        });
      }
      // 本場次的群演也是這一欄的合法目標（§5.1）——「一群人齊聲說」那一半。它們不經過
      // `existing()`：群演的存在性不是「被幾場引用」，而是它就寫在這一場的 attr 裡。
      for (const extra of sceneExtras.filter((e) => e.name.includes(query))) {
        rows.push({
          key: `extra:${extra.id}`,
          label: `${EXTRA_MARK} ${extra.name}`,
          run: () => {
            merge([{ id: extra.id, displayName: extra.name }]);
            reset();
          },
        });
      }
      // 升格（特約，票券 35）—— 齊聲與升格是「那批人」的兩種讀法，所以緊接在齊聲那列後面；
      // `＋ 建立新實體` 是「剛好同名的另一個人」，那是別的東西，留在底下。
      if (onPromoteFromExtra) {
        // 命中的是同一個 query，所以在迴圈外問一次就好。
        const hit = byName(query);
        const scenesUsing = hit ? scenesOf(hit.id) : undefined;
        // 命中既有存在人物時講明白它會指向誰 —— 系統不替人物取名，也就不靠取名擋住「兩位
        // 特約被靜靜併成同一個人」；擋它的是編劇按下去之前讀到的這一行字（票券 35）。
        const who = hit
          ? `${hit.name}${scenesUsing ? `（${scenesUsing} 場）` : ""}`
          : `新的人物「${query}」`;
        for (const extra of sceneExtras) {
          // 命中條件比齊聲那列**多認一條：query 以描述開頭**。少了它，打「服務生小李」的編劇
          // 看不到這一列，於是選「建立新實體」—— 拿到人物、群演還是 x2。代價不是名字難看，
          // 是**人數少算一個群演**（票券 35 的起點就是這個坑）。
          if (!extra.name.includes(query) && !query.startsWith(extra.name))
            continue;
          // 人數變化寫在**按下去之前**：升格會動到編劇沒有打過字的地方（群演那一欄），那句話
          // 該在他做決定的當下就在眼前，而不是事後去簡表才發現（ADR-0006 那條方法論）。
          const left =
            extra.count > 1
              ? `群演剩 ${extra.count - 1} 人`
              : "這批群演就此用完";
          rows.push({
            key: `promote:${extra.id}`,
            label: `${HIT_MARK[kind]} 從「${extra.name} x${extra.count}」裡升格一個人 —— ${who}（${left}）`,
            run: () => void promote(extra),
          });
        }
      }
      if (!exact) {
        rows.push({
          key: "create",
          label: `${NEW_MARK} 建立新實體「${query}」`,
          run: () => {
            void commitText();
          },
        });
      }
      // 直接在這裡新建一筆群演 —— 齊聲那一句寫到一半不必跳去簡表（§4.7 的心流理由）。
      if (onCreateExtra) {
        const parsed = parseExtra(query);
        if (parsed) {
          rows.push({
            key: "create-extra",
            label: `${EXTRA_MARK} 新增群演「${parsed.description}」${parsed.count} 人`,
            run: () => createExtra(),
          });
        }
      }
      // ✏️ 把實體改名（票券 39）—— 條件是**手上握著一筆實體，而框裡的字不是它在目錄裡的
      // 名字**。不看 `exact`：打了新字之後手上那一筆就不再是「命中」了（票券 38 的 `editingMatch`
      // 刻意如此），而那正好是要改名的時候。孤兒進不來 —— 這一列問的是手上那一筆，不是目錄。
      //
      // **排在 `＋ 建立新實體` 後面**，不是排版問題：第一列就是 Enter 會做的事，而改名是
      // 專案層級、⌘Z 回不來的動作（改名走 server action，不進 ProseMirror 的 history ——
      // 票券 37 是同一個接縫）。它該是按出來的，不該是打完字順手 Enter 就發生的。
      //
      // 與命中那一列的差別要讀得出來：那一列是「這一場顯示為 X，實體還是叫舊名」，這一列是
      // 「這筆實體從此叫 X」。改完**別的劇本也會看到** —— 實體屬於專案，不屬於劇本。
      // ⚠️ 打的字剛好是**另一筆存在實體**的名字時這一列不出現：那會讓目錄裡有兩筆同名，而
      // 編劇要的多半是「這一場指的是那一筆」（`📍` 那一列）或把兩筆併起來（合併不在這張票裡，
      // ADR-0005 講過形狀）。同一條線也擋掉了 `＋ 建立新實體`，理由一樣。
      const renameTarget =
        onRenameEntity && !byName(query) ? heldEntity() : null;
      if (renameTarget && query !== renameTarget.name) {
        const target = renameTarget;
        // 代價寫在**按下去之前**（ADR-0006 那條方法論）—— 而代價是「改完還有幾場印著舊名」，
        // 不是「這筆實體用在幾場」。後者聽起來像會動到那麼多場，但改名預設一場都不代換。
        const others = retitleOthers?.count(target.id, target.name) ?? 0;
        const note =
          others > 0 ? `（還有 ${others} 場印著「${target.name}」）` : "";
        rows.push({
          key: "rename",
          label: `${RENAME_MARK} 把實體改名為「${query}」${note}`,
          run: () => {
            // 那幾場要不要跟上是**編劇的裁決**，不是這裡的預設值。一場都沒有就沒什麼好問的。
            if (others === 0) {
              renameEntity(target, false);
              return;
            }
            setStage({ name: "rename", target, others });
            setActive(0);
          },
        });
      }
      // 第三列永遠在 —— 它不是建議，是一個入口。（一個存在的實體都沒有時就沒得指了。）
      if (known.length > 0) {
        rows.push({
          key: "alias",
          label: "🔗 作為既有實體的另一個名字…",
          run: () => {
            setStage({ name: "aliasPick" });
            setActive(0);
          },
        });
      }
    } else if (stage.name === "rename") {
      // 改名的第二步（票券 39）。兩列的差別是**別場的舊名跟不跟著走**，所以兩邊都把場數
      // 說出來 —— 讀得到代價才算裁決。
      const { target, others } = stage;
      rows.push({
        key: "rename-scene-only",
        // 「這一筆」而不是「這一場」：改的是手上那個 chip，同一場的別欄若也印著舊名，
        // 它就在那 N 場裡面（見 `retitleOthers.count`）。
        label: `只改這一筆的叫法 —— 那 ${others} 場繼續印「${target.name}」`,
        run: () => renameEntity(target, false),
      });
      rows.push({
        key: "rename-retitle",
        label: `連那 ${others} 場一起改成「${query}」`,
        run: () => renameEntity(target, true),
      });
    } else if (stage.name === "aliasPick") {
      for (const option of known) {
        rows.push({
          key: `alias:${option.id}`,
          label: `${HIT_MARK[kind]} ${option.name}`,
          run: () => {
            setStage({ name: "aliasMode", target: option });
            setActive(0);
          },
        });
      }
    } else {
      const target = stage.target;
      rows.push({
        key: "alias-scene-only",
        label: `只當這一場的名字（${target.name}）`,
        run: () => {
          merge([{ id: target.id, displayName: query }]);
          reset();
        },
      });
      if (onRenameEntity) {
        rows.push({
          key: "alias-rename",
          label: `同時把實體改名為「${query}」`,
          run: () => {
            // 改實體的名字**不代換全文**：別場的顯示名與正文一個字都不動。
            onRenameEntity(target.id, query);
            merge([{ id: target.id, displayName: query }]);
            reset();
          },
        });
      }
    }
  }

  /**
   * 組字中的**預覽**（使用者裁決 2026-09-10）。
   *
   * 選單照樣邊打邊出現，但**完全不接手鍵盤與滑鼠** —— §7.6 那條線一步都沒退：注音的空白是
   * 選字鍵、Enter 是送出鍵，這一刻它們全部屬於 IME。這裡只回答一個問題：「我正在打的這幾個
   * 字，本子裡已經有嗎」，讓編劇在**送出之前**就看得出來會命中還是會新建（搜尋框那樣）。
   * 真正做決定的那一刻仍然是 `compositionend`，不是現在。
   *
   * 只列命中，不列「建立新實體」與別名入口 —— 那兩列是動作，而這一刻不該有任何動作可按。
   */
  const preview =
    composingNow && query.length > 0 && !pending
      ? existing()
          .filter((o) => o.name.includes(query))
          .slice(0, 5)
      : [];

  /**
   * 手上握著一筆實體時，選單頂端那一行**唯讀**的抬頭（票券 39 收票）。
   *
   * 它補的是一個沒有回饋的時刻：**字還沒改**。那時沒有任何一列提到改名（確實沒東西可改），
   * 於是「改這裡的字就能改名」這條路完全不可見 —— 編劇不會去試一個他不知道存在的東西。
   * 字改過之後它仍然在，因為那時框裡的字已經不是那筆實體的名字了，**「我在編輯誰」得有人說**。
   *
   * 它**不是一列選項**：不進 `rows`、選不到、Enter 碰不到它。標籤放結果、說明另外放，這條
   * 分工是票券 36 立的；等 36 的側邊說明欄落地，這一行可以搬進去。
   *
   * **框裡清空了它也還在** —— 那一刻那一筆還握在手上（可以重新命名），而畫面上除了這一行
   * 沒有任何東西說得出這件事。那時措辭換成下一顆 Backspace 會做什麼：放手（見 `letGo`）。
   */
  const heldEntityNow = heldEntity();
  const heldNote =
    !onRenameEntity ||
    !heldEntityNow ||
    pending ||
    dismissed ||
    composingNow ||
    stage.name !== "suggest"
      ? null
      : query === ""
        ? `${RENAME_MARK} 正在編輯「${heldEntityNow.name}」，再按一次 Backspace 移除這一場的引用`
        : `${RENAME_MARK} 正在編輯「${heldEntityNow.name}」，修改文字可更新名稱`;

  const activeRow = rows[Math.min(active, rows.length - 1)];

  /** 把還沒 chip 化的字定案（Enter、離開欄位、選單的「建立新實體」都走這裡）。 */
  const commitText = async () => {
    if (!query) return;
    // 第二個值先問過 —— **不 resolve、不建實體**，只把字留在框裡反白起來。
    if (needsConfirm) {
      setPending(query);
      setDismissed(false);
      setActive(0);
      selectNext.current = true;
      return;
    }
    const ref = await resolve(query);
    if (ref) merge([ref]);
    reset();
  };

  /**
   * 在這一欄直接新建一筆**群演**（`眾人 x20`）。
   *
   * 與建立人物是兩條路而不是一個猜測：系統分不出「一個人說話」與「一群人齊聲說」，那是
   * 編劇按下哪一列的宣告（同子場次的種類）。人數走與群演欄相同的 `描述 x 人數` 解析。
   */
  const createExtra = () => {
    const parsed = parseExtra(query);
    if (!parsed || !onCreateExtra) return;
    const created = onCreateExtra(query);
    if (!created) return;
    merge([{ id: created.id, displayName: created.name }]);
    reset();
  };

  /**
   * 從那批群演裡拉一個人出來 —— **升格 ＝ `resolve(打的字)` ＋ 那批人減一**（票券 35）。
   *
   * 人物那一半一個字都不新增：命中既有存在人物就是那一位，沒命中就建一筆新的，與這一欄其他
   * 三列同一條路。**系統不替人物取名** —— CONTEXT.md 裡的「路人甲」是編劇的手寫慣例。
   *
   * 兩半要落在同一個 transaction，所以先同步告訴呼叫端「這次還要拉走一個」，再 `merge` 觸發
   * `onCommit`（⌘Z 一次回到升格前）。順序反過來的話，那一次寫入不會帶到減一。
   */
  const promote = async (extra: SceneExtraOption) => {
    if (!onPromoteFromExtra) return;
    // 升格是一個**新的宣告**，不是把剛拿下來那一筆原封放回去 —— 手上若正握著一筆群演引用，
    // `resolve` 會用回那個 `ex_` id，於是「升格」產出的會是一筆群演，正好相反。
    editing.current = null;
    caret.current = null; // 升格是新的一筆，排在隊尾（不是把誰放回原位）。
    const ref = await resolve(query, "promote");
    if (!ref?.id) return;
    onPromoteFromExtra(extra.id, ref.id);
    merge([ref]);
    setShowNamingHint(true);
    reset();
  };

  /**
   * 把**實體本身**改名（`✏️` 那一列，票券 39）。
   *
   * 三件事，刻意分開三個地方做：那幾場的舊稱呼走 `retitleOthers`（kernel command，動的是
   * doc）、目錄那一筆走 `onRenameEntity`（server action，改完**別的劇本也會看到**）、手上
   * 這一筆則是照常寫一筆引用。**那幾場只在編劇說要的時候才跑** —— 別名住在引用上
   * （ADR-0005），系統不替他決定哪幾場的字該被換掉。
   *
   * **順序是先 doc、後目錄**：doc 那一半會被 command 拒絕（回 false），拒絕了就整個不做 ——
   * 反過來的話會留下「目錄改了、稿沒改」的半套，而那一半 ⌘Z 回不來。
   *
   * ⚠️ 三者不在同一個 transaction。改名走 server action、不進 ProseMirror 的 history，所以
   * ⌘Z 只退得回 doc 那一半（那幾場的字回到舊名，目錄仍是新名 —— 那幾場於是變成別名）。
   * 這是票券 37 那個接縫，那張票落地前先別假設它會自己好。
   */
  const renameEntity = (target: EntityOption, alsoOthers: boolean) => {
    if (
      alsoOthers &&
      retitleOthers &&
      !retitleOthers.run(target.id, target.name, query)
    )
      return;
    onRenameEntity?.(target.id, query);
    merge([{ id: target.id, displayName: query }]);
    reset();
  };

  /** 取代原本那一筆（編劇明確說了「就是要換掉」）。 */
  const replacePending = async () => {
    const name = pending!;
    setPending(null);
    const ref = await resolve(name);
    if (ref) onCommit([ref]);
    reset();
  };

  /** 兩個都留 —— 先把場次升級（地點欄 ＝ 改成雜景），成功了才寫第二筆。 */
  const escalatePending = async () => {
    const name = pending!;
    if (!confirmReplace?.escalate?.run()) return; // 升級被拒就什麼都不動，字留在框裡
    setPending(null);
    const ref = await resolve(name);
    // ⚠️ 不走 `merge`：`multiple` 是上一次 render 的 prop，此刻還是 false（升級才剛發生，
    // 中間沒有重繪），交給它會走單值分支把第一筆蓋掉 —— 正好是這整段要防的事。
    if (ref) onCommit([...refs, ref]);
    reset();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    // 組字中把每一顆鍵都還給 IME —— 選字用的方向鍵與 Enter 都不是我們的。
    if (event.nativeEvent.isComposing || composing.current) return;

    if (rows.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((i) => (i + 1) % rows.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((i) => (i - 1 + rows.length) % rows.length);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        activeRow?.run();
        return;
      }
    }

    if (event.key === "Escape") {
      // Esc ＝「現在別煩我」：關掉選單，打到一半的字留著。
      event.preventDefault();
      event.stopPropagation();
      if (stage.name !== "suggest") {
        setStage({ name: "suggest" });
        return;
      }
      // 框裡空著時，抬頭是這個狀態**唯一**看得見的地方 —— 收掉它就該連手一起放，
      // 否則留下一個看不見的持有：下一個字打下去會變成「把它改名」。
      if (query === "") letGo();
      closeMenu();
      return;
    }

    // Enter 只有在「還有字沒定案」時屬於這個欄位。空欄位上的 Enter 是呼叫端的（對白的人物欄
    // 按 Enter 是進台詞、空對白則是變回動作）—— 攔下來會變成「按了沒反應」。
    if (event.key === "Enter" && query) {
      event.preventDefault();
      event.stopPropagation();
      void commitText();
      return;
    }

    if (event.key === "Backspace" && text === "") {
      // 手上還握著一筆（清空了但還沒放手）—— 這一下是**放掉它**，不是去拿前一個。
      // 少了這一段，`a b c` 裡清空 c 的那一下會直接跳進 b 的編輯狀態，而 c 是什麼時候
      // 沒的沒有人看見。
      if (editing.current) {
        event.preventDefault();
        letGo();
        return;
      }
      // Backspace 在空欄位上 ＝ 把**游標左邊**那一個 chip 還原成可編輯文字（不是直接刪掉）。
      const left = refs[(caret.current ?? refs.length) - 1];
      if (left) {
        event.preventDefault();
        editRef(left);
        return;
      }
    }

    // ← 從字首退進 chip（空欄位才算）—— 沒退成才輪到 chip row 的格線導航。
    if (chipCaret.inputKeyDown(event)) return;

    onKeyDown?.(event);
  };

  const onChange = (value: string) => {
    setText(value);
    setDismissed(false);
    setActive(0);
    // 又動了那串字 ＝ 他正在改它，不是在回答面板的問題。
    if (pending !== null) setPending(null);
    if (composing.current) return; // 組字中不切 chip
    // 多值輸入規則的適用範圍就是 §4.7 標題那一行：**地點欄與登場人物欄**。對白人物欄是單值，
    // 標點在那裡就是名字裡的普通字元 —— 在那裡切開會建出第二筆實體卻只留下最後一筆，
    // 憑空多一個孤兒。
    if (!multiple) return;

    const { names, rest } = splitNamesLive(value);
    if (names.length === 0) return;
    setText(rest);
    void resolveAll(names);
  };

  const held = editing.current;
  /**
   * 輸入框現在**夾在 chip 中間**嗎 —— 決定它吃不吃那條彈性寬度（見 CSS 的 `--inline`）。
   *
   * 正在改一筆時是（輸入框停在那一筆原本那一格），只是把游標插進去也是。
   */
  const inline = held != null || inputAt < refs.length;
  /** 空的輸入框插在 chip 中間 —— 它這一刻只是一個游標。 */
  const caretOnly = !held && inputAt < refs.length && text === "";

  /** 一顆已經定案的引用。手上握著一筆時整排 chip 都是動不得的（見 `editRef`）。 */
  const chipNode = (ref: EntityRef, i: number): ReactNode => {
    const entity =
      options.find((o) => o.id === ref.id) ??
      sceneExtras.find((e) => e.id === ref.id) ??
      null;
    const born = ref.id != null && bornHere.includes(ref.id);
    // 群演的 chip 用自己的記號 —— 讀 chip 的人要看得出這一筆沒有跨場次身分。
    const extra = isExtraId(ref.id);
    const mark = extra ? EXTRA_MARK : born ? NEW_MARK : HIT_MARK[kind];
    return (
      <span
        key={`${ref.id}:${ref.displayName}`}
        {...chipCaret.chipProps(i)}
        className={[
          "entity-chip",
          extra
            ? "entity-chip--extra"
            : born
              ? "entity-chip--new"
              : entity
                ? "entity-chip--hit"
                : "entity-chip--dangling",
          held && "entity-chip--locked",
        ]
          .filter(Boolean)
          .join(" ")}
        // 懸空引用（實體被 ⌘Z 掉）不跳警告、不少印 —— 只是少一條可聚合的連結。
        title={
          entity && entity.name !== ref.displayName ? entity.name : undefined
        }
        // 點 chip ＝ 改它。`mousedown` 而非 `click`：`click` 要等 `mouseup`，中間
        // 輸入框已經先 blur 過一輪，打到一半的字會被 blur 的定案吃掉。
        //
        // ⚠️ 手上握著一筆時**只擋住、不放行**（`editRef` 自己也會擋）—— 但 `preventDefault`
        // 一定要照做：少了它，這一下會讓輸入框 blur，而 blur 會把手上那一筆定案，擋住就
        // 變成了接力（正是這一輪要推翻的東西）。
        onMouseDown={(e) => {
          e.preventDefault();
          editRef(ref);
        }}
      >
        {entity || born ? (
          <span className="entity-chip__mark" aria-hidden="true">
            {mark}
          </span>
        ) : null}
        {ref.displayName}
        <button
          type="button"
          className="entity-chip__remove"
          tabIndex={-1}
          aria-label={`移除${ref.displayName}`}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation(); // × 是刪除，不是編輯 —— 別讓它冒泡成點了 chip
            if (held) return; // 動不得的時候連 × 也動不得（游標也是一般的，見 CSS）
            onCommit(refs.filter((r) => r !== ref));
            input.current?.focus();
          }}
        >
          ×
        </button>
      </span>
    );
  };

  /**
   * 編輯中的那一筆**看起來還是一顆 chip**（2026-09-11 驗收回饋）—— 記號、邊框、× 都留著，
   * 只有裡面那段字換成可以打的。少了這一層，點下去的那一刻 chip 整個變成裸字，整排跟著
   * 位移，畫面跳得比實際發生的事還大。沒在編輯時這層 span 是透明的（`display: contents`），
   * 輸入框照樣是 `.entity-field` 的 flex 項。
   */
  const inputNode = (
    <span
      key="input"
      className={held ? "entity-field__input-chip" : "entity-field__input-wrap"}
    >
      {held && (
        <span className="entity-chip__mark" aria-hidden="true">
          {isExtraId(held.id)
            ? EXTRA_MARK
            : held.id != null && bornHere.includes(held.id)
              ? NEW_MARK
              : HIT_MARK[kind]}
        </span>
      )}
      <input
        ref={takeInput}
        // 夾在 chip 中間時**寬度依內容而定** —— 平常那條 `flex` 會吃掉整行剩下的空間（欄位
        // 尾端該有的可點區），夾在中間那就成了一道把後半排推開的空白（2026-09-11 驗收回饋）。
        // 正在改一筆是這樣，只是把游標插進去也是 —— 空的輸入框不該自己長出一塊空間。
        className={[
          inputClassName,
          inline && "entity-field__input--inline",
          // 只是一個游標插在中間時**寬度固定** —— 靠內容寬度的話，空輸入框在不同瀏覽器
          // 下有零點幾像素的差，整排會跟著微微晃動（2026-09-11 驗收回饋）。
          caretOnly && "entity-field__input--caret",
        ]
          .filter(Boolean)
          .join(" ")}
        // `field-sizing: content` 沒生效時的退路（見 `columns`）。
        size={inline ? columns(text) : undefined}
        // 已經有 chip 就不必再留提示字 —— chip 自己就說明了這一欄是什麼。
        placeholder={refs.length > 0 ? "" : placeholder}
        aria-label={placeholder}
        aria-describedby={describedBy}
        aria-keyshortcuts={describedBy ? HELP_KEY_HINT : undefined}
        aria-expanded={rows.length > 0 || heldNote != null}
        aria-haspopup="listbox"
        role="combobox"
        value={text}
        onCompositionStart={() => {
          composing.current = true;
          setComposingNow(true);
        }}
        onCompositionEnd={(event) => {
          composing.current = false;
          setComposingNow(false);
          // 組字結束才輪到我們：這一刻起選單與分隔符才開始作用。
          onChange(event.currentTarget.value);
        }}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // 離開欄位時把還沒 chip 化的字定案（與 CjkField 的 blur 回寫同一個理由：
          // 打完就走是常態，不該把字吃掉）。
          // 待確認的字**不在 blur 時定案** —— 它正等著編劇回答，離開欄位不是答案。
          if (!composing.current && !needsConfirm) void commitText();
          // 空著離開 ＝ 放手。`commitText` 沒字時直接 return，不清任何東西 —— 少了這一句，
          // 抬頭會跟著欄位一路掛在畫面上（2026-09-11 驗收回饋）。
          if (query === "") letGo();
          setStage({ name: "suggest" });
          setShowNamingHint(false); // 他移開就是決定了（見 `showNamingHint`）
        }}
      />
      {held && (
        // 編輯中那顆的 × 與唯讀 chip 的 × **同一個意思**：移除這一場對它的引用。位置與外觀
        // 都不動，點下去的那一刻整排才不會因為少了一顆按鈕而位移（2026-09-11 驗收回饋）。
        // 它就是三段 Backspace 最後那一段的滑鼠版（見 `letGo`）。
        <button
          type="button"
          className="entity-chip__remove"
          tabIndex={-1}
          aria-label={`移除${held.displayName}`}
          onMouseDown={(e) => {
            e.preventDefault();
            setText("");
            letGo();
            input.current?.focus();
          }}
        >
          ×
        </button>
      )}
    </span>
  );

  const row = chipRow({
    chips: refs.map((ref, i) => chipNode(ref, i)),
    input: inputNode,
    inputAt,
    // 空的輸入框插在中間 ＝ 它只是一個游標，不該佔位。
    bare: caretOnly,
    locked: held != null,
    moveCaret: (at) => {
      caret.current = at;
      redraw();
    },
    focusInput: () => input.current?.focus(),
  });

  return (
    <div
      className={`entity-field${className ? ` ${className}` : ""}`}
      ref={field}
    >
      {row}

      {preview.length > 0 && (
        // aria-hidden ＋ CSS 的 pointer-events: none —— 它是一瞥，不是一個選單：不進無障礙
        // 樹（輸入框的 aria-expanded 這一刻仍然是 false，那是實話），也接不到滑鼠。
        <ul
          className="entity-field__menu entity-field__menu--preview"
          aria-hidden="true"
        >
          {preview.map((option) => (
            <li key={option.id}>
              {HIT_MARK[kind]} {option.name}
            </li>
          ))}
        </ul>
      )}

      {rows.length > 0 && pending && (
        <div className="entity-field__confirm">
          <p className="entity-field__note">
            這一場已經有{placeholder}「{refs[0]?.displayName}」。一個場次一個
            {placeholder} —— 要留哪一個？
          </p>
          <ul
            className="entity-field__menu entity-field__menu--nested"
            role="listbox"
            aria-label={`${placeholder}要留哪一個`}
          >
            {rows.map((row, i) => (
              <li
                key={row.key}
                role="option"
                aria-selected={i === active}
                className={i === active ? "is-active" : ""}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  row.run();
                }}
              >
                {row.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {showNamingHint && (
        // 建議不是規則 —— 不擋寫入、沒有 ✕、失焦就收。`role="note"` 讓螢幕閱讀器讀得出它是
        // 一句附註而不是一個錯誤。
        <p
          className="entity-field__note entity-field__note--naming"
          role="note"
        >
          人物名稱是劇組用來識別演員的 —— 給他一個有辨識度的名字。點 chip
          可以改。
        </p>
      )}

      {(rows.length > 0 || heldNote) && !pending && (
        <ul
          className="entity-field__menu"
          role="listbox"
          aria-label={`${placeholder}建議`}
        >
          {heldNote && (
            <li role="presentation" className="entity-field__menu-hint">
              {heldNote}
            </li>
          )}
          {rows.map((row, i) => (
            <li
              key={row.key}
              role="option"
              aria-selected={i === active}
              className={i === active ? "is-active" : ""}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                row.run();
              }}
            >
              {row.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
