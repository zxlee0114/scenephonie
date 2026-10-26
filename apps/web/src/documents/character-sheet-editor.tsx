/**
 * 角色設定表的編輯器（畫面上叫「人物介紹」）（票券 21 第 ② 片，§6.2）。
 *
 * **一份散文文件，只是按人物分段**：每一位是一個節點 `{ characterId }`，名字當標題、介紹內文寫在底下（使用者
 * 裁決 2026-10-26）。內文跟其他文件同一套格式與格式選單，只少了第二層標題 —— 那一層是人物的名字。所以：
 *
 * - 收錄誰、什麼順序、介紹寫了什麼，全是這份 doc 的事 —— 自動存檔、⌘Z、拖曳、點把手選起一位再按 ⌫ 刪掉，
 *   都是 ProseMirror 本來就會的。
 * - **名字是人物的**，不在 doc 裡：改名走 server action 改那一位（劇本裡也是他），⌘Z 管不到（同劇本裡的實體
 *   改名，票券 37 那個接縫）。
 *
 * **新增人物是一列一列寫的**（驗收回饋 2026-10-26）：按「＋ 新增人物」（或 ⌘↵）長出一列名字欄，名字按 Enter
 * 收錄進表、游標進到那一位的介紹內文。那一列在名字定案之前**不在表上** —— 表上每一筆都是人物引用，沒有名字
 * 就沒有人物可指（不變式 ⑧）。
 *
 * **新增時回頭補表命中既有實體**：那一列的名字欄是劇本用的同一個 `EntityField`，存在＝被引用要跨文件算
 * （ADR-0005）—— 劇本裡用到的人物印出場數、命中就是那一位，不會冒出第二個小明；已經在表上的不再列出。
 */
"use client";

import { Node as TiptapNode, type Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { Placeholder } from "@tiptap/extensions";
import {
  EditorContent,
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { createContext, useContext, useEffect, useRef, useState } from "react";

import { addCharacterEntry, characterSheetIds, documentFromJSON, entityDirectory } from "@scenephonie/schema";

import { FormatMenu } from "@/documents/format-menu";
import { documentLabel } from "@/documents/labels";
import { proseHeading, proseKit } from "@/documents/prose-kit";
import { EntityField, type EntityOption } from "@/editor/entity-field";
import { DragHandle } from "@/editor/nodes/drag-handle";
import type { SaveDoc } from "@/editor/save-capability";
import { SaveStatusLine } from "@/editor/save-status";
import { useAutosave } from "@/editor/use-autosave";
import type { SaveToken } from "@/persistence";

// 名字欄（`EntityField`）與拖曳把手是劇本那一套元件，樣式也跟著它們住在 editor.css。
import "../styles/editor.css";
import "../styles/documents.css";

/**
 * 在角色設定表上改名（使用者裁決 2026-10-26：可以改，也問劇本要不要跟）。
 *
 * `count` 數劇本裡**還印著舊名**的場次（取了別名的那幾場不算，票券 39 的同一條分界）；數到 0 就直接改。
 * `run` 改人物的名字，`retitle` 時連那幾場的顯示名一起改 —— 那是伺服器端改劇本，開著的劇本分頁
 * 下次存檔會被告知別處改過了。
 */
export type RenameCharacter = {
  count: (id: string, name: string) => Promise<number>;
  run: (id: string, from: string, to: string, retitle: boolean) => Promise<boolean>;
};

type Props = {
  initialBody: object;
  initialToken: SaveToken;
  save: SaveDoc;
  /** 這個專案的人物目錄（含孤兒 —— 存不存在由下面兩個引用來源判斷）。 */
  characters: readonly EntityOption[];
  /** 劇本裡每位人物用在幾場（另一個引用來源；進站時伺服器端算好）。 */
  scenes: Readonly<Record<string, number>>;
  /** 劇本裡叫過每位人物的其他名字（別名），印在名字底下。 */
  aliases?: Readonly<Record<string, readonly string[]>>;
  /** 建立一筆人物。**先落地，再寫進表**（不變式 ⑧）。 */
  createCharacter: (name: string) => Promise<EntityOption | null>;
  rename: RenameCharacter;
};

/** node view 拿得到的東西 —— node view 由編輯器掛載，中間沒有傳 prop 的路（同 `EntityCatalogProvider`）。 */
type SheetContextValue = {
  name: (id: string) => string;
  aliases: (id: string) => readonly string[];
  rename: (id: string, from: string, to: string) => Promise<RenameOutcome>;
};

/** `taken` ＝ 新名字是另一位存在人物的名字，沒有改。 */
type RenameOutcome = "renamed" | "unchanged" | "taken";

/**
 * 改名途中一定要編劇回答的那一問（使用者裁決 2026-10-26：對話框，不能略過）。
 *
 * - `retitle`：劇本裡還有場次印著舊名，要不要一起改。
 * - `taken`：新名字是另一位人物的名字，只能知道了。
 */
type Question =
  | { kind: "retitle"; from: string; to: string; answer: (retitle: boolean) => void }
  | { kind: "taken"; name: string; outcome: string; answer: () => void };

const SheetContext = createContext<SheetContextValue | null>(null);

/** 表上的一位：一個人物引用，裡面是他的介紹內文。 */
const CharacterEntry = TiptapNode.create({
  name: "characterEntry",
  content: "block+",
  // 跟 kernel 那一份一樣：Backspace 不會把下一位的內文併進上一位。
  isolating: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return { characterId: { default: null } };
  },
  parseHTML() {
    return [{ tag: "section[data-character-id]", getAttrs: (el) => ({ characterId: el.getAttribute("data-character-id") }) }];
  },
  renderHTML({ node }) {
    return ["section", { "data-character-id": node.attrs.characterId as string }, 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(EntryView);
  },
});

/** `doc` 跟 kernel 那一份同一條內容規則：零筆也合法（`@scenephonie/schema` 的 `documents.ts`）。 */
const SheetDocument = TiptapNode.create({ name: "doc", topNode: true, content: "characterEntry*" });

/** 每一位底下還沒寫的內文裡淡淡的一行。 */
const DESCRIPTION_HINT = Placeholder.configure({
  placeholder: "這個人是誰…",
  includeChildren: true,
  showOnlyCurrent: false,
});

/** 把游標放進 `pos` 那一位的介紹內文開頭。 */
function caretIntoEntry(editor: Editor, pos: number) {
  const { state, view } = editor;
  view.dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(pos + 1))).scrollIntoView());
  view.focus();
}

export function CharacterSheetEditor({
  initialBody,
  initialToken,
  save,
  characters: initialCharacters,
  scenes,
  aliases: initialAliases = {},
  createCharacter,
  rename,
}: Props) {
  const label = documentLabel("角色設定表");
  const [characters, setCharacters] = useState<readonly EntityOption[]>(initialCharacters);
  /**
   * 目錄的權威來源，而且是同步的 —— 「先建立實體、再寫入 doc」在這裡隔著一次 render：欄位建好人物之後
   * 同一個 tick 就呼叫 `onCommit`，只看 state 的話 command 會說這個人不存在（同 `EntityCatalogProvider`）。
   */
  const known = useRef<readonly EntityOption[]>(initialCharacters);
  const [aliases, setAliases] = useState(initialAliases);
  const [question, setQuestion] = useState<Question | null>(null);
  /** 「＋ 新增人物」長出來的那一列開著沒。 */
  const [drafting, setDrafting] = useState(false);
  const draftInput = useRef<HTMLInputElement | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);
  const bottomInView = useInView(bottom);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      SheetDocument,
      CharacterEntry,
      proseKit({ document: false, dropcursor: true }),
      proseHeading([3]),
      DESCRIPTION_HINT,
    ],
    content: initialBody,
    editorProps: { attributes: { class: "document-page__body character-sheet__entries", "aria-label": label } },
  });
  const autosave = useAutosave({ editor, initialToken, save });
  const listed = useListedIds(editor);

  const put = (character: EntityOption) => {
    const list = known.current;
    known.current = list.some((c) => c.id === character.id)
      ? list.map((c) => (c.id === character.id ? character : c))
      : [...list, character];
    setCharacters(known.current);
  };

  /** 收錄一位人物：先過 kernel command（人物在不在、是不是已經在表上），再接到表尾、游標進他的介紹。 */
  const add = (characterId: string) => {
    if (!editor) return;
    const directory = entityDirectory({ characterIds: known.current.map((c) => c.id) });
    const result = addCharacterEntry(documentFromJSON("角色設定表", editor.getJSON()), { characterId, directory });
    if (!result.ok) {
      console.warn(`[character-sheet] ${result.reason}`);
      return;
    }
    const entry = editor.schema.nodeFromJSON(result.value.lastChild!.toJSON());
    const at = editor.state.doc.content.size;
    editor.view.dispatch(editor.state.tr.insert(at, entry));
    caretIntoEntry(editor, at);
  };

  /** 打開新增那一列（按鈕、⌘↵、捲到底的那顆）：捲到看得見，游標進名字欄。 */
  const openDraft = () => {
    setDrafting(true);
    draftInput.current?.focus();
    bottom.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  };

  // ⌘↵ ＝ 新增人物，游標在這一頁的哪裡都算（人物介紹長過一個視窗時，按鈕在最底下）。
  const openDraftRef = useRef(openDraft);
  openDraftRef.current = openDraft;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey) || event.isComposing) return;
      event.preventDefault();
      openDraftRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 那一列一長出來游標就在名字欄裡 —— 按下按鈕就是要開始打字。
  useEffect(() => {
    if (drafting) draftInput.current?.focus();
  }, [drafting]);

  /** 存在的人物：表上收錄的，加上劇本裡用到的（存在＝被引用，ADR-0005）。 */
  const exists = () => known.current.filter((c) => listed.includes(c.id) || (scenes[c.id] ?? 0) > 0);
  /** 另一位**存在**的人物已經叫這個名字 —— 再取一次就是第二個小美。孤兒不算，它不存在。 */
  const taken = (name: string, except?: string) => exists().some((c) => c.id !== except && c.name === name);

  const context: SheetContextValue = {
    name: (id) => characters.find((c) => c.id === id)?.name ?? "",
    aliases: (id) => aliases[id] ?? [],
    rename: async (id, from, to) => {
      // 改成另一位的名字：改下去目錄裡就有兩個小美（同劇本實體欄位的改名列，票券 39）。
      if (taken(to, id)) {
        await new Promise<void>((answer) => setQuestion({ kind: "taken", name: to, outcome: "名字沒有改", answer }));
        setQuestion(null);
        return "taken";
      }
      const others = await rename.count(id, from);
      // 劇本裡沒有一場印著舊名：沒什麼好問的。
      const retitle =
        others > 0 && (await new Promise<boolean>((answer) => setQuestion({ kind: "retitle", from, to, answer })));
      setQuestion(null);
      if (!(await rename.run(id, from, to, retitle))) return "unchanged";
      put({ id, name: to });
      // 劇本那幾場沒跟著改：舊名從此是那幾場的叫法，也就是別名。新名字本身不再是別名。
      setAliases((all) => {
        const kept = (all[id] ?? []).filter((alias) => alias !== to);
        return { ...all, [id]: others > 0 && !retitle ? [...kept, from] : kept };
      });
      return "renamed";
    },
  };

  // 存在＝被引用（ADR-0005）：劇本裡用到的才是候選，已經在表上的不再列 —— 同一個人不收兩次。
  const options = characters.filter((c) => !listed.includes(c.id));
  const usage = () => new Map(Object.entries(scenes).filter(([, count]) => count > 0));

  return (
    <SheetContext.Provider value={context}>
      <div className="document-page character-sheet">
        <div className="document-page__head">
          <h1 className="document-page__title">{label}</h1>
          <SaveStatusLine {...autosave} noun={label} />
        </div>
        {editor && <FormatMenu editor={editor} unavailable={{ heading2: "人物介紹裡第二層標題是人物的名字" }} />}
        {/* 一位都沒有時整塊收起來：留著的話是一行點得進去、卻打不了字的空白（驗收回饋 2026-10-26）。 */}
        <div className="character-sheet__list" hidden={listed.length === 0}>
          <EditorContent editor={editor} />
        </div>
        <div ref={bottom}>
          {editor &&
            (drafting ? (
              <div
                className="character-sheet__draft"
                // Esc 在空的名字欄上 ＝ 不新增了。欄位自己會吃掉 Esc（關選單），所以要在它之前聽。
                onKeyDownCapture={(event) => {
                  if (event.key === "Escape" && !draftInput.current?.value) setDrafting(false);
                }}
                // 名字還空著就點走：那一列收掉，不留一列空白在頁面上。
                onBlur={(event) => {
                  if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                  if (!draftInput.current?.value) setDrafting(false);
                }}
              >
                <EntityField
                  kind="character"
                  placeholder="人物名字"
                  refs={[]}
                  options={options}
                  usage={usage}
                  inputRef={draftInput}
                  onCommit={(refs) => {
                    setDrafting(false);
                    for (const ref of refs) if (ref.id) add(ref.id);
                  }}
                  onCreate={async (name) => {
                    // 表上已經有這個名字的人（表上的人不在候選裡，所以欄位會走到「建立新實體」）：
                    // 說一聲、不另建一位，知道了之後回到名字欄換一個。
                    if (taken(name)) {
                      setQuestion({
                        kind: "taken",
                        name,
                        outcome: "沒有另外新增",
                        answer: () => {
                          setQuestion(null);
                          // 對話框拿走焦點時，名字欄可能已經清空、那一列跟著收起來了 —— 重開一次。
                          openDraft();
                        },
                      });
                      return null;
                    }
                    const created = await createCharacter(name);
                    if (created) put(created);
                    return created;
                  }}
                />
              </div>
            ) : (
              <button
                type="button"
                className="character-sheet__add"
                aria-label="＋ 新增人物"
                aria-keyshortcuts="Meta+Enter"
                onClick={openDraft}
              >
                ＋ 新增人物<kbd>⌘↵</kbd>
              </button>
            ))}
        </div>
        {/* 人物介紹長過一個視窗、新增的按鈕捲出畫面時：同一顆按鈕浮在畫面下緣正中，按了捲到底、直接開始寫下一位。 */}
        {editor && !bottomInView && (
          <button type="button" className="character-sheet__add character-sheet__add--floating" onClick={openDraft}>
            ＋ 新增人物<kbd>⌘↵</kbd>
          </button>
        )}
      </div>
      {question && <QuestionDialog question={question} />}
    </SheetContext.Provider>
  );
}

/** 表上現在收錄了誰（依順序）。每一次 doc 變動後重讀 —— 新增人物的候選要扣掉這些。 */
function useListedIds(editor: Editor | null): readonly string[] {
  const [ids, setIds] = useState<readonly string[]>([]);
  useEffect(() => {
    if (!editor) return;
    const read = () => setIds(characterSheetIds(editor.getJSON()));
    read();
    editor.on("update", read);
    return () => {
      editor.off("update", read);
    };
  }, [editor]);
  return ids;
}

/** 這一塊現在在不在視窗裡。量不到（沒有 `IntersectionObserver`）就當在 —— 不多長一顆按鈕。 */
function useInView(target: React.RefObject<HTMLElement | null>): boolean {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = target.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry?.isIntersecting ?? true));
    observer.observe(el);
    return () => observer.disconnect();
  }, [target]);
  return inView;
}

/**
 * 改名途中的對話框：**一定要回答**才關得掉 —— 沒有取消、Esc 與點背景都不算（使用者裁決 2026-10-26）。
 *
 * 長相跟其他對話框一致（`creator__*`）：主要動作在右邊、預設焦點在它；← → 在幾顆按鈕之間換（Tab 照常）。
 */
function QuestionDialog({ question }: { question: Question }) {
  const primary = useRef<HTMLButtonElement>(null);
  useEffect(() => primary.current?.focus(), []);

  const moveFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // 鍵不往外漏：⌘↵ 不該在對話框開著時又開一列新增。
    event.stopPropagation();
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const buttons = [...event.currentTarget.querySelectorAll("button")];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = buttons[(at + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length];
    event.preventDefault();
    next?.focus();
  };

  return (
    <div className="creator__scrim">
      <div
        className="creator dashboard__confirm"
        role="alertdialog"
        aria-modal="true"
        aria-describedby="sheet-dialog-body"
        onKeyDown={moveFocus}
      >
        {question.kind === "retitle" ? (
          <>
            <p id="sheet-dialog-body">
              這名角色（原名：{question.from}）已經用於劇本當中，要一起改成「{question.to}」嗎？
            </p>
            <div className="creator__actions">
              <button type="button" onClick={() => question.answer(false)}>
                否，只改人物介紹
              </button>
              <button ref={primary} type="button" className="creator__primary" onClick={() => question.answer(true)}>
                是
              </button>
            </div>
          </>
        ) : (
          <>
            <p id="sheet-dialog-body">
              已經有一位「{question.name}」了，{question.outcome}。
            </p>
            <div className="creator__actions">
              <button ref={primary} type="button" className="creator__primary" onClick={question.answer}>
                確認
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * 表上的一位：拖曳把手、名字（改名）、移除，底下是他的介紹內文（doc 的內容）。
 *
 * **點把手選起整位**（同劇本的區塊把手）：名字連同介紹一起反白，接著按 ⌫ 或 Delete 就整位拿掉。
 */
function EntryView({ node, editor, getPos, selected }: ReactNodeViewProps) {
  const sheet = useContext(SheetContext);
  const id = node.attrs.characterId as string;
  const name = sheet?.name(id) ?? "";
  const aliases = sheet?.aliases(id) ?? [];

  const select = () => {
    const pos = getPos();
    if (typeof pos === "number") editor.chain().focus().setNodeSelection(pos).run();
  };
  const remove = () => {
    const pos = getPos();
    if (typeof pos !== "number") return;
    editor.chain().deleteRange({ from: pos, to: pos + node.nodeSize }).focus().run();
  };
  const writeDescription = () => {
    const pos = getPos();
    if (typeof pos === "number") caretIntoEntry(editor, pos);
  };

  return (
    <NodeViewWrapper as="section" className={selected ? "character-entry character-entry--selected" : "character-entry"}>
      <div className="character-entry__head" contentEditable={false}>
        <span className="character-entry__grip" onClick={select}>
          <DragHandle />
        </span>
        <NameField id={id} name={name} onDone={writeDescription} />
        <button type="button" className="character-entry__remove" aria-label={`從人物介紹移除「${name}」`} onClick={remove}>
          ×
        </button>
      </div>
      {aliases.length > 0 && (
        <p className="character-entry__aliases" contentEditable={false}>
          別名：{aliases.join("、")}
        </p>
      )}
      <NodeViewContent className="character-entry__body" />
    </NodeViewWrapper>
  );
}

/**
 * 名字。按 Enter 或離開欄位才定案；清成空白不算改名、退回原本的名字。撞名與要不要連劇本一起改，都由對話框問。
 * 按 Enter 定案之後游標進到介紹內文（驗收回饋 2026-10-26）。
 */
function NameField({ id, name, onDone }: { id: string; name: string; onDone: () => void }) {
  const sheet = useContext(SheetContext);
  const [value, setValue] = useState(name);
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  /**
   * 目前的名字，同步的那一份：改名成功、游標接著跳進內文的那一下會觸發離開欄位的定案，那時 prop 可能還是
   * 舊名 —— 只比 prop 的話會把同一次改名再送一次。
   */
  const current = useRef(name);

  useEffect(() => {
    current.current = name;
    setValue(name);
  }, [name]);

  /** 定案。回傳名字現在算不算寫好了（沒改、或改成了）—— Enter 憑這個決定游標要不要往下走。 */
  const commit = async (): Promise<boolean> => {
    const next = value.trim();
    if (!sheet || busy.current) return false;
    if (next === current.current) return true;
    if (!next) {
      setValue(current.current);
      return true;
    }
    busy.current = true;
    const from = current.current;
    const outcome = await sheet.rename(id, from, next);
    busy.current = false;
    if (outcome === "renamed") {
      current.current = next;
      return true;
    }
    setValue(from);
    // 撞名：知道了之後回到名字欄，換一個。
    if (outcome === "taken") input.current?.focus();
    return false;
  };

  return (
    <input
      ref={input}
      className="character-entry__name"
      aria-label="人物名字"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        // ⌘↵ 是新增人物（往上冒到整頁），不是定案名字。
        if (event.key !== "Enter" || event.nativeEvent.isComposing || event.metaKey || event.ctrlKey) return;
        event.preventDefault();
        void commit().then((done) => {
          if (done) onDone();
        });
      }}
    />
  );
}
