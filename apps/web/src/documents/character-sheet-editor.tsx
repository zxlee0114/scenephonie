/**
 * 角色設定表的編輯器（畫面上叫「人物介紹」）（票券 21 第 ② 片，§6.2）。
 *
 * **表與內文住在兩個地方**：表（收錄誰、什麼順序）是這份文件的 PM doc，每一筆是一個 atom 節點
 * `{ characterId }`；名字與介紹內文是**人物實體**的欄位（CONTEXT「角色設定表」）。所以：
 *
 * - 加入、移除、排序是 doc 的事 —— 自動存檔、⌘Z、拖曳全部是 ProseMirror 本來就會的。
 * - 介紹內文與名字是人物的事 —— 各自走 server action 存回人物，**⌘Z 管不到**（同劇本裡的實體改名，
 *   票券 37 那個接縫）。內文框裡的 ⌘Z 是瀏覽器原生那一份，只管那一格的字。
 *
 * 整頁的樣子就是 PDF 人物介紹頁的樣子：名字當標題、內文寫在底下（使用者裁決 2026-10-26）。
 *
 * **新增人物是一列一列寫的**（驗收回饋 2026-10-26）：按「＋ 新增人物」長出一列空的名字欄，名字按 Enter
 * 收錄進表、游標進到那一位的介紹內文；寫完再按一次「＋ 新增人物」。那一列在名字定案之前**不在表上** ——
 * 表上每一筆都是人物引用，沒有名字就沒有人物可指（不變式 ⑧）。
 *
 * **新增時回頭補表命中既有實體**：那一列的名字欄是劇本用的同一個 `EntityField`，存在＝被引用要跨文件算
 * （ADR-0005）—— 劇本裡用到的人物印出場數、命中就是那一位，不會冒出第二個小明；已經在表上的不再列出。
 */
"use client";

import { Node as TiptapNode, type Editor } from "@tiptap/core";
import { Dropcursor, UndoRedo } from "@tiptap/extensions";
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { createContext, useContext, useEffect, useRef, useState } from "react";

import { addCharacterEntry, characterSheetIds, documentFromJSON, entityDirectory } from "@scenephonie/schema";

import { documentLabel } from "@/documents/labels";
import { EntityField, type EntityOption } from "@/editor/entity-field";
import { DragHandle } from "@/editor/nodes/drag-handle";
import type { SaveDoc } from "@/editor/save-capability";
import { SaveStatusLine } from "@/editor/save-status";
import { useAutosave } from "@/editor/use-autosave";
import type { SaveToken } from "@/persistence";

// 「＋ 加入人物」與拖曳把手是劇本那一套元件，樣式也跟著它們住在 editor.css。
import "../styles/editor.css";
import "../styles/documents.css";

/** 一位人物在這一頁需要的全部：名字與介紹內文（`null` ＝ 還沒寫）。 */
export type SheetCharacter = { id: string; name: string; description: string | null };

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
  characters: readonly SheetCharacter[];
  /** 劇本裡每位人物用在幾場（另一個引用來源；進站時伺服器端算好）。 */
  scenes: Readonly<Record<string, number>>;
  /** 建立一筆人物。**先落地，再寫進表**（不變式 ⑧）。 */
  createCharacter: (name: string) => Promise<EntityOption | null>;
  saveDescription: (id: string, description: string) => Promise<boolean>;
  rename: RenameCharacter;
};

/** node view 拿得到的東西 —— node view 由編輯器掛載，中間沒有傳 prop 的路（同 `EntityCatalogProvider`）。 */
type SheetContextValue = {
  character: (id: string) => SheetCharacter | undefined;
  saveDescription: (id: string, description: string) => Promise<boolean>;
  rename: (id: string, from: string, to: string) => Promise<RenameOutcome>;
  pendingRename: (id: string) => PendingRename | null;
  /** 編劇對那一問的裁決：`true` 連劇本一起改、`false` 只改人物、`null` 不改了。 */
  resolveRename: (id: string, retitle: boolean | null) => void;
  /** 把游標放進這一位的介紹內文（名字按 Enter 之後）。剛收錄、內文框還沒掛上時，掛上那一刻才放。 */
  focusDescription: (id: string) => void;
  /** 內文框掛上（`null` ＝ 卸下）時回報，`focusDescription` 才找得到它。 */
  registerDescription: (id: string, field: HTMLTextAreaElement | null) => void;
};

/** `taken` ＝ 新名字是另一位存在人物的名字，沒有改。 */
type RenameOutcome = "renamed" | "unchanged" | "taken";

/** 改名等編劇裁決時的那一筆：劇本裡還有 `others` 場印著 `from`。`decide` 收下裁決、把改名做完。 */
type PendingRename = { from: string; to: string; others: number; decide: (retitle: boolean | null) => void };

const SheetContext = createContext<SheetContextValue | null>(null);

/** 表上的一筆：一個人物引用。atom —— 裡面沒有可以打字的內容，名字與內文是人物的欄位。 */
const CharacterEntry = TiptapNode.create({
  name: "characterEntry",
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return { characterId: { default: null } };
  },
  parseHTML() {
    return [{ tag: "section[data-character-id]", getAttrs: (el) => ({ characterId: el.getAttribute("data-character-id") }) }];
  },
  renderHTML({ node }) {
    return ["section", { "data-character-id": node.attrs.characterId as string }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(EntryView);
  },
});

/** `doc` 跟 kernel 那一份同一條內容規則：零筆也合法（`@scenephonie/schema` 的 `documents.ts`）。 */
const SheetDocument = TiptapNode.create({ name: "doc", topNode: true, content: "characterEntry*" });

/** ProseMirror 的 schema 一定要有 `text`；表上沒有任何一處放得進字。 */
const Text = TiptapNode.create({ name: "text", group: "inline" });

export function CharacterSheetEditor({
  initialBody,
  initialToken,
  save,
  characters: initialCharacters,
  scenes,
  createCharacter,
  saveDescription,
  rename,
}: Props) {
  const label = documentLabel("角色設定表");
  const [characters, setCharacters] = useState<readonly SheetCharacter[]>(initialCharacters);
  /**
   * 目錄的權威來源，而且是同步的 —— 「先建立實體、再寫入 doc」在這裡隔著一次 render：欄位建好人物之後
   * 同一個 tick 就呼叫 `onCommit`，只看 state 的話 command 會說這個人不存在（同 `EntityCatalogProvider`）。
   */
  const known = useRef<readonly SheetCharacter[]>(initialCharacters);
  const [pending, setPending] = useState<Record<string, PendingRename>>({});
  /** 「＋ 新增人物」長出來的那一列開著沒。 */
  const [drafting, setDrafting] = useState(false);
  const draftInput = useRef<HTMLInputElement | null>(null);
  const descriptionFields = useRef(new Map<string, HTMLTextAreaElement>());
  /** 要拿到游標、但內文框還沒掛上的那一位（node view 是非同步掛載的）。 */
  const focusWhenMounted = useRef<string | null>(null);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [SheetDocument, Text, CharacterEntry, UndoRedo, Dropcursor],
    content: initialBody,
    editorProps: { attributes: { class: "character-sheet__entries", "aria-label": label } },
  });
  const autosave = useAutosave({ editor, initialToken, save });
  const listed = useListedIds(editor);

  const put = (character: SheetCharacter) => {
    const list = known.current;
    known.current = list.some((c) => c.id === character.id)
      ? list.map((c) => (c.id === character.id ? character : c))
      : [...list, character];
    setCharacters(known.current);
  };
  /** 改人物的一個欄位（名字或內文）。 */
  const patch = (id: string, fields: Partial<SheetCharacter>) => {
    const current = known.current.find((c) => c.id === id);
    if (current) put({ ...current, ...fields });
  };

  /** 收錄一位人物：先過 kernel command（人物在不在、是不是已經在表上），再把結果寫回編輯器。 */
  const add = (characterId: string) => {
    if (!editor) return;
    const directory = entityDirectory({ characterIds: known.current.map((c) => c.id) });
    const result = addCharacterEntry(documentFromJSON("角色設定表", editor.getJSON()), { characterId, directory });
    if (!result.ok) {
      console.warn(`[character-sheet] ${result.reason}`);
      return;
    }
    const next = editor.schema.nodeFromJSON(result.value.toJSON());
    editor.view.dispatch(editor.state.tr.replaceWith(0, editor.state.doc.content.size, next.content));
  };

  /** 存在的人物：表上收錄的，加上劇本裡用到的（存在＝被引用，ADR-0005）。 */
  const exists = () => known.current.filter((c) => listed.includes(c.id) || (scenes[c.id] ?? 0) > 0);

  const context: SheetContextValue = {
    character: (id) => characters.find((c) => c.id === id),
    saveDescription: async (id, description) => {
      const ok = await saveDescription(id, description);
      if (ok) patch(id, { description });
      return ok;
    },
    rename: async (id, from, to) => {
      // 另一位**存在**的人物已經叫這個名字：改下去目錄裡就有兩個小美（同劇本實體欄位的改名列，
      // 票券 39）。孤兒不算 —— 它不存在。
      if (exists().some((c) => c.id !== id && c.name === to)) return "taken";
      const apply = async (retitle: boolean): Promise<RenameOutcome> => {
        if (!(await rename.run(id, from, to, retitle))) return "unchanged";
        patch(id, { name: to });
        return "renamed";
      };
      const others = await rename.count(id, from);
      // 劇本裡沒有一場印著舊名：沒什麼好問的。
      if (others === 0) return apply(false);
      return new Promise<RenameOutcome>((settle) => {
        const decide = (retitle: boolean | null) => {
          setPending((all) => Object.fromEntries(Object.entries(all).filter(([key]) => key !== id)));
          if (retitle === null) settle("unchanged");
          else void apply(retitle).then(settle);
        };
        setPending((all) => ({ ...all, [id]: { from, to, others, decide } }));
      });
    },
    pendingRename: (id) => pending[id] ?? null,
    resolveRename: (id, retitle) => pending[id]?.decide(retitle),
    focusDescription: (id) => {
      const field = descriptionFields.current.get(id);
      if (field) field.focus();
      else focusWhenMounted.current = id;
    },
    registerDescription: (id, field) => {
      if (!field) {
        descriptionFields.current.delete(id);
        return;
      }
      descriptionFields.current.set(id, field);
      if (focusWhenMounted.current === id) {
        focusWhenMounted.current = null;
        field.focus();
      }
    },
  };

  // 那一列一長出來游標就在名字欄裡 —— 按下按鈕就是要開始打字。
  useEffect(() => {
    if (drafting) draftInput.current?.focus();
  }, [drafting]);

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
        <EditorContent editor={editor} />
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
                  const ids = refs.flatMap((ref) => (ref.id ? [ref.id] : []));
                  for (const id of ids) add(id);
                  setDrafting(false);
                  const last = ids.at(-1);
                  if (last) context.focusDescription(last);
                }}
                onCreate={async (name) => {
                  const created = await createCharacter(name);
                  if (!created) return null;
                  put({ ...created, description: null });
                  return created;
                }}
              />
            </div>
          ) : (
            <button type="button" className="character-sheet__add" onClick={() => setDrafting(true)}>
              ＋ 新增人物
            </button>
          ))}
      </div>
    </SheetContext.Provider>
  );
}

/** 表上現在收錄了誰（依順序）。每一次 doc 變動後重讀 —— 加入人物的候選要扣掉這些。 */
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

/** 表上的一筆：拖曳把手、名字（改名）、移除、介紹內文。 */
function EntryView({ node, editor, getPos }: ReactNodeViewProps) {
  const sheet = useContext(SheetContext);
  const id = node.attrs.characterId as string;
  const character = sheet?.character(id);
  const name = character?.name ?? "";

  const remove = () => {
    const pos = getPos();
    if (typeof pos !== "number") return;
    editor.chain().deleteRange({ from: pos, to: pos + node.nodeSize }).focus().run();
  };

  return (
    <NodeViewWrapper as="section" className="character-entry">
      <div className="character-entry__head" contentEditable={false}>
        <DragHandle />
        <NameField id={id} name={name} />
        <button type="button" className="character-entry__remove" aria-label={`從人物介紹移除「${name}」`} onClick={remove}>
          ×
        </button>
      </div>
      <DescriptionField id={id} initial={character?.description ?? ""} />
    </NodeViewWrapper>
  );
}

/**
 * 名字。按 Enter 或離開欄位才定案；清成空白不算改名、退回原本的名字；撞到另一位存在人物的名字也不改，說出撞到誰。
 * 劇本裡還有幾場印著舊名時，底下長出兩顆按鈕問要不要一起改（Esc ＝ 不改）。
 */
function NameField({ id, name }: { id: string; name: string }) {
  const sheet = useContext(SheetContext);
  const [value, setValue] = useState(name);
  const [taken, setTaken] = useState<string | null>(null);
  const busy = useRef(false);
  /**
   * 目前的名字，同步的那一份：改名成功、游標接著跳進內文的那一下會觸發離開欄位的定案，那時 prop 可能還是
   * 舊名 —— 只比 prop 的話會把同一次改名再送一次。
   */
  const current = useRef(name);
  const choice = sheet?.pendingRename(id) ?? null;

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
    setTaken(null);
    const from = current.current;
    const outcome = await sheet.rename(id, from, next);
    busy.current = false;
    if (outcome === "renamed") current.current = next;
    else setValue(from);
    if (outcome === "taken") setTaken(next);
    return outcome === "renamed";
  };

  return (
    <div className="character-entry__name-box">
      <input
        className="character-entry__name"
        aria-label="人物名字"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setTaken(null);
        }}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter") {
            event.preventDefault();
            // 名字寫好了就接著寫介紹（驗收回饋 2026-10-26）。
            void commit().then((done) => {
              if (done) sheet?.focusDescription(id);
            });
          } else if (event.key === "Escape" && choice) {
            event.preventDefault();
            sheet?.resolveRename(id, null);
          }
        }}
      />
      {taken && <p className="character-entry__note">已經有一位「{taken}」了</p>}
      {choice && (
        // 代價寫在按下去之前（ADR-0006）：兩顆按鈕都把場數說出來。
        <div className="character-entry__retitle" role="group" aria-label="劇本裡的舊名字要不要跟著改">
          <button type="button" onClick={() => sheet?.resolveRename(id, false)}>
            只改人物介紹 —— 劇本那 {choice.others} 場繼續印「{choice.from}」
          </button>
          <button type="button" onClick={() => sheet?.resolveRename(id, true)}>
            連劇本那 {choice.others} 場一起改成「{choice.to}」
          </button>
        </div>
      )}
    </div>
  );
}

/** 介紹內文打字停多久就存（不必離開欄位 —— 直接關分頁也不會掉）。 */
const DESCRIPTION_PAUSE_MS = 1_000;

/**
 * 介紹內文 —— 人物的描述欄（PDF 人物介紹頁的內文）。打字停一下就存回人物，離開欄位時立刻存；沒改就不送。
 * 一個自由文字框，不欄位化（票券 20：年齡、職業不是編劇本來就會產生的東西）。
 */
function DescriptionField({ id, initial }: { id: string; initial: string }) {
  const sheet = useContext(SheetContext);
  const [value, setValue] = useState(initial);
  const [failed, setFailed] = useState(false);
  const saved = useRef(initial);
  const latest = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = () => {
    clearTimeout(timer.current);
    const text = latest.current;
    if (!sheet || text === saved.current) return;
    void sheet.saveDescription(id, text).then((ok) => {
      if (ok) saved.current = text;
      setFailed(!ok);
    });
  };
  // 這一筆被移除（× 或拖走時重掛）之前，手上還沒存的字先送出去。
  const flushOnUnmount = useRef(flush);
  flushOnUnmount.current = flush;
  useEffect(() => () => flushOnUnmount.current(), []);

  return (
    <div className="character-entry__body" contentEditable={false}>
      <textarea
        ref={(field) => sheet?.registerDescription(id, field)}
        className="character-entry__description"
        aria-label="人物介紹內文"
        placeholder="這個人是誰…"
        rows={3}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          latest.current = event.target.value;
          clearTimeout(timer.current);
          timer.current = setTimeout(flush, DESCRIPTION_PAUSE_MS);
        }}
        onBlur={flush}
      />
      {failed && <p className="character-entry__failed">介紹內文沒存到 —— 再打一個字或離開欄位時會再試一次</p>}
    </div>
  );
}
