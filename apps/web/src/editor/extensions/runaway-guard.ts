/**
 * 失控重繪的斷路器 —— **只在開發環境掛**（驗收 2026-10-21，票券 12）。
 *
 * 症狀：開著 Chrome DevTools 時偶發 CPU 100%、分頁 `RESULT_CODE_HUNG`，觸發時機抓不到。前一次
 * 同樣症狀的根因是 `@tiptap/react` 在 ProseMirror 更新途中掛新的 React node view 時無條件
 * `flushSync`，DevTools 打亂 MutationObserver 的遞送時機 → React 寫 DOM ↔ ProseMirror 讀回重繪
 * 互咬不收斂。動作／插入畫面已改原生 node view，但場次（含群組成員）與對白仍是 React。
 *
 * 這支不修它，是**抓現行犯**：
 *
 * - ProseMirror 每一次 `updateState` 都會呼叫 plugin view 的 `update`。其中 `view.state` 與
 *   `prevState` 是同一個的，是**沒有 transaction 的重繪** —— DOMObserver 讀回 DOM 變動之後的
 *   強制重繪就走這條路，正常使用時幾乎是 0。第一次跳閘的紀錄（2026-10-21「移出對剪」）證實
 *   迴圈就是它：最後一筆 transaction 之後一秒重繪 301 次。
 * - 一秒內這種重繪超過 `REDRAW_LIMIT` 次（或任何重繪超過 `LIMIT` 次），且最近沒有輸入 → 跳閘：
 *   把觸發前的輸入、transaction 摘要、**最近的 DOM 變動**、游標所在的節點路徑、React node view
 *   數量寫進 `localStorage`（分頁被砍掉、重新整理之後還讀得到），`console.error` 一次，再把
 *   編輯器設成唯讀，試著讓迴圈斷掉。DOM 變動那一份就是要找的元兇：誰在改 DOM、改了什麼。
 *
 * 讀紀錄：Console 跑 `JSON.parse(localStorage.getItem("scenephonie:runaway"))`。
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

export const RUNAWAY_STORAGE_KEY = "scenephonie:runaway";

/** 一秒內最多幾次重繪才算正常 —— 按住鍵連打約每秒 30 次、每次一兩次重繪，留足十倍餘裕。 */
const LIMIT = 300;
/** 一秒內最多幾次「沒有 transaction 的重繪」。解散對剪那種一輪很重的迴圈湊不到 `LIMIT`，靠這條抓。 */
const REDRAW_LIMIT = 30;
const WINDOW_MS = 1000;
/** 最後一次輸入之後多久還在重繪，才算「沒有人在動」。 */
const QUIET_MS = 300;
const KEEP = 20;
const KEEP_MUTATIONS = 40;

interface InputCrumb {
  t: number;
  type: string;
  key?: string;
  mods?: string;
}

interface TrCrumb {
  t: number;
  steps: string[];
  meta: string[];
  docChanged: boolean;
}

/** 一筆 DOM 變動：`div.scene.scene--member[data-type=…]` 這種形狀的描述，不存節點本身。 */
export interface MutationCrumb {
  t: number;
  type: string;
  target: string;
  attr?: string;
  added?: string[];
  removed?: string[];
}

export interface RunawayRecord {
  at: string;
  updatesInWindow: number;
  /** 其中沒有 transaction 的重繪（DOM 讀回後的強制重繪）。 */
  redrawsInWindow: number;
  msSinceLastInput: number | null;
  /** 游標所在位置由外往內的節點型別（`doc > sceneGroup > groupFragment > dialogue`）。 */
  selectionPath: string;
  reactNodeViews: number;
  domElements: number;
  inputs: InputCrumb[];
  transactions: TrCrumb[];
  mutations: MutationCrumb[];
}

const push = <T>(list: T[], item: T, keep = KEEP) => {
  list.push(item);
  if (list.length > keep) list.shift();
};

/** 節點的簡短描述：標籤、前兩個 class、`data-type`；文字節點印前幾個字。 */
function describe(node: Node | null): string {
  if (!node) return "null";
  if (node.nodeType === Node.TEXT_NODE)
    return `#text(${(node.textContent ?? "").slice(0, 8)})`;
  if (!(node instanceof Element)) return node.nodeName;
  const classes = [...node.classList]
    .slice(0, 2)
    .map((c) => `.${c}`)
    .join("");
  const type = node.getAttribute("data-type");
  return `${node.tagName.toLowerCase()}${classes}${type ? `[${type}]` : ""}`;
}

function summarizeMutation(m: MutationRecord, t: number): MutationCrumb {
  return {
    t: Math.round(t),
    type: m.type,
    target:
      describe(
        m.target.nodeType === Node.TEXT_NODE ? m.target.parentNode : m.target,
      ) + (m.target.nodeType === Node.TEXT_NODE ? " > #text" : ""),
    attr: m.attributeName ?? undefined,
    added: m.addedNodes.length
      ? [...m.addedNodes].slice(0, 3).map(describe)
      : undefined,
    removed: m.removedNodes.length
      ? [...m.removedNodes].slice(0, 3).map(describe)
      : undefined,
  };
}

/** transaction 的 meta 不能公開列舉 —— 只看我們與 ProseMirror 常用的那幾個鍵。 */
const META_KEYS = [
  "addToHistory",
  "uiEvent",
  "paste",
  "composition",
  "pointer",
  "preventUpdate",
];

function summarize(tr: Transaction): TrCrumb {
  return {
    t: Math.round(performance.now()),
    steps: tr.steps.map((s) => s.constructor.name),
    meta: META_KEYS.filter((k) => tr.getMeta(k) !== undefined).map(
      (k) => `${k}=${String(tr.getMeta(k))}`,
    ),
    docChanged: tr.docChanged,
  };
}

function selectionPath(view: EditorView): string {
  const { $from } = view.state.selection;
  const names: string[] = [];
  for (let d = 0; d <= $from.depth; d++) names.push($from.node(d).type.name);
  return names.join(" > ");
}

/** 純邏輯：計數、判斷、組紀錄。plugin 只負責餵它事件 —— 測試直接打這一層。 */
export function createRunawayMonitor(
  now: () => number = () => performance.now(),
) {
  const inputs: InputCrumb[] = [];
  const transactions: TrCrumb[] = [];
  const mutations: MutationCrumb[] = [];
  let stamps: number[] = [];
  let redraws: number[] = [];
  let lastInput: number | null = null;
  let tripped = false;

  return {
    get tripped() {
      return tripped;
    },
    input(type: string, event?: KeyboardEvent) {
      lastInput = now();
      const mods = event
        ? [
            event.metaKey && "Meta",
            event.ctrlKey && "Ctrl",
            event.altKey && "Alt",
            event.shiftKey && "Shift",
          ]
            .filter(Boolean)
            .join("+")
        : undefined;
      push(inputs, {
        t: Math.round(lastInput),
        type,
        key: event?.key,
        mods: mods || undefined,
      });
    },
    transaction(tr: Transaction) {
      push(transactions, summarize(tr));
    },
    mutations(records: readonly MutationRecord[]) {
      if (tripped) return;
      const t = now();
      for (const m of records)
        push(mutations, summarizeMutation(m, t), KEEP_MUTATIONS);
    },
    /**
     * 一次重繪；`redrawOnly` ＝ 沒有 transaction（`view.state === prevState`）。跳閘的那一刻回
     * 紀錄，其餘時候回 `null`。
     */
    update(view: EditorView, redrawOnly = false): RunawayRecord | null {
      if (tripped) return null;
      const t = now();
      stamps.push(t);
      stamps = stamps.filter((s) => t - s <= WINDOW_MS);
      if (redrawOnly) redraws.push(t);
      redraws = redraws.filter((s) => t - s <= WINDOW_MS);
      if (stamps.length <= LIMIT && redraws.length <= REDRAW_LIMIT) return null;
      if (lastInput != null && t - lastInput < QUIET_MS) return null;
      tripped = true;
      return {
        at: new Date().toISOString(),
        updatesInWindow: stamps.length,
        redrawsInWindow: redraws.length,
        msSinceLastInput: lastInput == null ? null : Math.round(t - lastInput),
        selectionPath: selectionPath(view),
        reactNodeViews: view.dom.querySelectorAll(".react-renderer").length,
        domElements: view.dom.getElementsByTagName("*").length,
        inputs: [...inputs],
        transactions: [...transactions],
        mutations: [...mutations],
      };
    },
  };
}

function report(record: RunawayRecord) {
  try {
    localStorage.setItem(RUNAWAY_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // 私密視窗或存取被擋：至少 console 還看得到。
  }
  console.error(
    `[runaway-guard] 編輯器在沒有輸入的情況下一秒重繪 ${record.updatesInWindow} 次` +
      `（其中 ${record.redrawsInWindow} 次沒有 transaction），已設為唯讀。` +
      `紀錄在 localStorage「${RUNAWAY_STORAGE_KEY}」。`,
    record,
  );
}

export const RunawayGuard = Extension.create<object, { tripped: boolean }>({
  name: "runawayGuard",
  // 跳閘之後要一直保持唯讀 —— `syncEditable`（零場次的唯讀）每次更新都會重算，讀這一格才不會
  // 把它改回可編輯。
  addStorage() {
    return { tripped: false };
  },
  addProseMirrorPlugins() {
    const storage = this.storage;
    const editor = this.editor;
    const monitor = createRunawayMonitor();
    const note = (type: string) => (_view: EditorView, event: Event) => {
      monitor.input(type, event instanceof KeyboardEvent ? event : undefined);
      return false;
    };
    return [
      new Plugin({
        key: new PluginKey("runawayGuard"),
        props: {
          handleDOMEvents: {
            keydown: note("keydown"),
            mousedown: note("mousedown"),
            beforeinput: note("beforeinput"),
            compositionstart: note("compositionstart"),
            compositionend: note("compositionend"),
            paste: note("paste"),
            drop: note("drop"),
          },
        },
        filterTransaction(tr) {
          monitor.transaction(tr);
          return true;
        },
        view: (view) => {
          // 自己的 MutationObserver：只記錄，不影響 ProseMirror 的那一個。
          const observer =
            typeof MutationObserver === "undefined"
              ? null
              : new MutationObserver((records) => monitor.mutations(records));
          observer?.observe(view.dom, {
            subtree: true,
            childList: true,
            attributes: true,
            characterData: true,
          });
          return {
            destroy: () => observer?.disconnect(),
            update(view, prevState) {
              const record = monitor.update(view, view.state === prevState);
              if (!record) return;
              report(record);
              // 斷迴圈：不可編輯之後 ProseMirror 不再把 DOM 變動讀回成文件變動。
              storage.tripped = true;
              queueMicrotask(() => editor.setEditable(false, false));
            },
          };
        },
      }),
    ];
  },
});
