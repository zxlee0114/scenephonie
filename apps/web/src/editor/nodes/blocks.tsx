/**
 * 三種 sceneBlock 的 node view（§4.6）。schema（`../schema`）擁有 node spec，這裡只疊 view。
 *
 * 三種型別**不用顏色區分** —— 它們是內容不是 decoration，上顏色等於重建「格式即內容」的暗示
 * （§7.11）。差別靠縮排、欄寬、spacing 與 rhythm（見 editor.css），加對白的人物欄與插入畫面的
 * 結構標籤。
 *
 * 「動作」「插入畫面」是純結構外殼 —— 用原生 ProseMirror node view（`staticBlockView`），不進
 * React。只有「對白」有互動狀態（人物欄 `CjkField`＋焦點串接）才用 `ReactNodeViewRenderer`。
 * 動機見 `staticBlockView` 註解（票券 04 驗收 #7：React node view mount 期 `flushSync` 卡死）。
 */
"use client";

import type { NodeViewRenderer } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { TextSelection } from "@tiptap/pm/state";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

import {
  addAppearingCharacter,
  dialogueCharacters,
  dismissAppearingPrompt,
  mintExtraId,
  parseExtra,
  sceneExtras,
  addSceneExtras,
  setDialogueCharacters,
  takeOneFromExtra,
  type DialogueCharacterRef,
  type ExtraRef,
} from "@scenephonie/schema";
import type { Node as PMNode } from "@tiptap/pm/model";

import {
  blockAddressOf,
  findContainerNode,
  findSceneNode,
  sameBlock,
  sceneChipsAbove,
  sceneContext,
  type BlockAddress,
} from "../address";
import { AppearingPromptMenu } from "../appearing-prompt-menu";
import { isBlankBlock, setBlockTypeAt } from "../block-types";
import { fieldEdge } from "../chip-nav";
import { backspaceFromSpeakerField } from "../extensions/block-join";
import { runKernelCommand } from "../command-bridge";
import { useAfterHistory } from "../after-history";
import { forwardHistoryKey } from "../history-keys";
import {
  appearingPrompt,
  closeAppearingPrompt,
  resumeAfterAppearingPrompt,
  type AppearingPrompt,
} from "../extensions/appearing-prompt";
import { Action, Dialogue, InsertShot } from "../schema";
import { useEntityCatalog } from "../entity-catalog";
import { EntityField, type EntityFieldHandle, type EntityOption, type EntityRef } from "../entity-field";
import { entityUsage } from "../entity-usage";
import { retitleOthersIn } from "../retitle-others";
import { claimFocus, requestFocus, subscribeFocusRequest } from "../focus";
import { DragHandle, dragHandle } from "./drag-handle";
import { ignoreReactChromeMutation } from "./react-mutations";

/** 從 node view 反推它所在場次的 id 與自己在場次裡的序（給 pending-focus 比對用）。 */
function locateBlock(props: NodeViewProps): BlockAddress | null {
  const pos = typeof props.getPos === "function" ? props.getPos() : undefined;
  if (pos == null) return null;
  const ctx = sceneContext(props.editor.state.doc.resolve(pos));
  return ctx && blockAddressOf(ctx);
}

/**
 * 純結構 node view（無 React）——「動作」「插入畫面」只是固定外殼＋一個內容洞，沒有 React
 * 狀態。用原生 ProseMirror node view 就夠，藉此避開 `@tiptap/react` `ReactRenderer` 建構子在
 * mount 當下同步 `flushSync(render)`（dist/index.js:613，無 opt-out）與 ProseMirror `DOMObserver`
 * 互咬的重繪失控：按 Enter 會 `splitBlock` 出新區塊、掛新 node view，開著 Chrome DevTools 時
 * DOMObserver 遞送時機被打亂即卡死整個 renderer（票券 04 驗收 #7）。§7.7。
 *
 * `chrome`（如插入畫面的結構標籤）是 `contentEditable=false` 的裝飾，其 DOM 變動不是內容編輯，
 * `ignoreMutation` 只認 contentDOM 內的。
 */
function staticBlockView(wrapperClass: string, chrome?: () => HTMLElement): NodeViewRenderer {
  return () => {
    const dom = document.createElement("div");
    dom.className = wrapperClass;
    dom.appendChild(dragHandle());
    if (chrome) dom.appendChild(chrome());
    const contentDOM = document.createElement("div");
    contentDOM.className = "block__content";
    dom.appendChild(contentDOM);
    return {
      dom,
      contentDOM,
      ignoreMutation: (m) => m.type !== "selection" && !contentDOM.contains(m.target as Node),
    };
  };
}

function insertShotTag(): HTMLElement {
  const tag = document.createElement("span");
  tag.className = "block__tag";
  tag.setAttribute("contenteditable", "false");
  tag.textContent = "插入畫面";
  return tag;
}

/**
 * 人物欄的引用。**多值** —— 多個具名角色可以同時說一句台詞（齊聲）。
 *
 * id 為 null 的是票券 04／07 的過渡形狀 —— 讀取照印顯示名，但寫不回去（沒有實體可指），
 * 編劇一動這一欄就會被真的引用取代。
 */
const speakersOf = (dialogue: PMNode): EntityRef[] =>
  dialogueCharacters(dialogue.attrs.character).map((r) => ({
    id: typeof (r as { id?: unknown }).id === "string" ? r.id : null,
    displayName: r.displayName,
  }));

function DialogueView(props: NodeViewProps) {
  const { node, editor } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<EntityFieldHandle>(null);
  const catalog = useEntityCatalog();
  /**
   * 在這一欄剛新建、**還沒寫進 doc** 的群演。
   *
   * 群演的家就是這份 doc，所以「先建立實體、再寫入 doc」在這裡收斂成**一次寫入**：
   * 這一筆群演與指向它的引用是同一個 transaction（見 `onCommit`）。分成兩次的話 ⌘Z 要按
   * 兩次才回得到原狀，而編劇眼中那只是一個動作。
   */
  const pendingExtras = useRef<ExtraRef[]>([]);
  /**
   * 這一輪升格要從哪幾批群演各拉走一個（票券 35）—— 與 `pendingExtras` 同一個理由：那個人物
   * 落地與「那批人少一個」必須是**同一個 transaction**，⌘Z 一次回到升格前。
   *
   * 記 `characterId` 是為了**一位說話者只扣一次**：兩批同名群演（`服務生 x2、服務生 x3`）會給
   * 出兩列升格，而兩列都解析到同一位既有人物時，那仍然只是一個人 —— 扣兩批人是憑空少兩個
   * 群演。它同時也是「那個人真的被寫進去了」的檢查（寫入被拒時手上這幾筆要留著）。
   *
   * ⚠️ **拿掉那個 chip 不會把人加回群演欄**，這是刻意的：那是一次新的編輯，不是 ⌘Z。反過來
   * 做等於系統在編劇背後改他的群演欄 —— 與票券 09「拿掉一筆群演不回頭改對白」同一條線。
   */
  const pendingPromotions = useRef<{ extraId: string; characterId: string }[]>([]);
  const speaker = speakersOf(node);

  // Tab 把區塊轉成對白後，這個 node view 消費掉待決焦點請求。掛載時試領一次（轉型當下這個
  // view 才剛生出來），並**訂閱**後續請求 —— 台詞裡按 ↑ 回人物欄時 view 早就掛好了，只靠掛載
  // 那一次領不到（使用者回饋 2026-09-04）。請求一律在 doc 改完之後才發（見 continue-block），
  // 所以訂閱者比對到的區塊序不會是舊的。
  useEffect(() => {
    const claim = () => {
      const here = locateBlock(props);
      let pickUp = false;
      if (
        here &&
        claimFocus((p) => {
          if (p.kind !== "speaker" || !sameBlock(p, here)) return false;
          pickUp = p.pickUp === true;
          return true;
        })
      ) {
        // 台詞開頭的 Backspace 走進來（票券 62）：拿起最後一顆 —— 它自己會把焦點交給輸入框。
        if (pickUp) fieldRef.current?.pickUpLast();
        else inputRef.current?.focus();
      }
    };
    claim();
    return subscribeFocusRequest(claim);
    // deps 空陣列：`props.getPos`／`props.editor` 由 node view 持有、身分穩定，claim 每次呼叫
    // 都重新定位，不吃過期的座標。
  }, []);

  /** 這一場**當下**在 doc 裡的節點（不是這次 render 拿到的那一份）。群組成員的群演也在它身上。 */
  const sceneNow = (sceneId: string): PMNode | null => {
    return findSceneNode(editor.state.doc, sceneId)?.node ?? null;
  };

  /**
   * 這個對白區塊**當下**在 doc 裡的樣子。
   *
   * ⚠️ 不要用 render 拿到的 `node` 去判斷「這個區塊空不空」：人物欄一寫進 doc，chip 就出現，
   * 但這個 node view 的 props 要到下一次重繪才換新。編劇看到 chip 之後**立刻**按 Enter 時，
   * closure 裡的 `node` 仍然是 `character: null` 的那一份 —— 於是「人名與台詞都空著」成立，
   * 剛填好的人物連同整個對白被當成空區塊取消掉（使用者回報 2026-09-10）。
   * 同一個家族的問題本輪出現第三次：**ref／doc 是真相（同步），props／state 是畫面（重繪）**。
   */
  const blockNow = (here: BlockAddress): PMNode | null => {
    // 區塊住在那段內容裡（片段的話不是成員本身 —— 成員沒有內容）。
    const container = findContainerNode(editor.state.doc, here)?.node;
    if (!container || here.blockIndex >= container.childCount) return null;
    return container.child(here.blockIndex);
  };

  /**
   * 「↓ 移到台詞」之後，**⌘Z 退到哪個樣子就算撤掉了那一下**（票券 82）。
   *
   * 那一下引用沒變，人物欄自己認不出它被撤掉（`Committed.docOnly`）—— 要看得到台詞的這一層看：
   * 一次 history transaction 之後這一句**正好回到搬之前的樣子**，就是撤到了那一步，整串字交還人物欄、
   * 焦點跟著回去。先撤掉的是之後打的台詞時，這一句還沒回到那個樣子，就繼續等。人物欄又寫了一次
   * （`onCommit`）就解除 —— 那之後等的就不是那一步了。
   *
   * 其餘焦點跟著走了的定案（Enter 進台詞、點走）引用有變，人物欄自己比得出來 —— 交給 `afterHistory`。
   */
  const takeBackFrom = useRef<PMNode | null>(null);
  useAfterHistory(editor, () => {
    const here = locateBlock(props);
    const now = here && blockNow(here);
    if (!now) return;
    const before = takeBackFrom.current;
    if (before) {
      if (!now.eq(before)) return;
      takeBackFrom.current = null;
      fieldRef.current?.takeBack();
      return;
    }
    fieldRef.current?.afterHistory(speakersOf(now));
  });

  /**
   * 「↓ 移到台詞」（票券 82）：人物欄裡那串字其實是台詞 —— 插到**台詞開頭**。
   *
   * `focus` ＝ Enter 那一下：游標停在插入那串字的尾端（接著打就接在句子後面），⌘Z 也接得回來。
   * 離開欄位時字照樣搬過去，但游標已經在別處了，不拉回來。
   */
  const moveToBody = (text: string, { focus }: { focus: boolean }) => {
    const pos = typeof props.getPos === "function" ? props.getPos() : undefined;
    if (pos == null || !text) return;
    const here = locateBlock(props);
    const before = here && blockNow(here);
    const at = pos + 1;
    const chain = editor.chain().command(({ tr }) => {
      tr.insertText(text, at);
      return true;
    });
    if (focus) chain.focus().setTextSelection(at + text.length);
    takeBackFrom.current = chain.run() ? before : null;
    if (focus) sealHistory();
  };

  /**
   * 定案那一步自成一個 undo 事件 —— 不讓接著打的台詞在 500ms 內併進來（prosemirror-history 的
   * newGroupDelay）。併進來的話，台詞裡第一下 ⌘Z 會連剛打的句子一起撤掉。
   */
  const sealHistory = () => {
    editor.view.dispatch(closeHistory(editor.state.tr));
  };

  /**
   * 登場人物提示（票券 10）—— 編劇寫完**這一句**按 Enter 時，說話者不在登場人物欄就在這裡問一聲。
   *
   * 時機在 `extensions/appearing-prompt` 的 plugin state，這個 view 只讀「問的是不是我」。
   * 訂閱 transaction 而不是等 props：plugin state 變了，這個 node 本身一個字都沒變。
   */
  const subscribe = useCallback(
    (notify: () => void) => {
      editor.on("transaction", notify);
      return () => {
        editor.off("transaction", notify);
      };
    },
    [editor],
  );
  const prompt = useSyncExternalStore(subscribe, () => appearingPrompt(editor));
  /**
   * 問的是這一句，而且只問**目錄裡找得到**的人 —— 懸空引用（實體被 ⌘Z 掉、跨劇本貼上）沒有
   * 實體可以加進登場人物欄，`addAppearingCharacter` 會拒絕它，那一列就成了按不下去的承諾。
   */
  const isHere = (p: AppearingPrompt | null): p is AppearingPrompt => {
    const here = p && locateBlock(props);
    return !!here && sameBlock(here, p);
  };
  const askable = isHere(prompt)
    ? prompt.speakers.filter((s) => catalog.directory.hasCharacter(s.id))
    : [];
  // 問的全是懸空引用：沒有一列按得下去，就當沒攔過那一顆 Enter。
  const nothingToAsk = isHere(prompt) && askable.length === 0;
  useEffect(() => {
    if (nothingToAsk) resumeAfterAppearingPrompt(editor);
  }, [nothingToAsk, editor]);

  /**
   * 選單的兩個出口都走 kernel command，寫完就接著做那一顆被攔下來的 Enter。**游標留在原地**：
   * 焦點在選單上時 selection 一直停在台詞裡，這兩支只改場次 attr、doc 座標一個都沒動，原封放回去
   * 就是 Enter 要切的那個位置。
   *
   * 場次從 plugin **當下**的 state 讀，不從這次 render 拿到的 `prompt`（ref／doc 是真相）。
   */
  const answerPrompt = (produce: (sceneId: string) => Parameters<typeof runKernelCommand>[1]) => {
    const now = appearingPrompt(editor);
    if (!isHere(now)) return;
    runKernelCommand(editor, produce(now.sceneId), { keepFocus: true, keepCaret: true });
    resumeAfterAppearingPrompt(editor);
  };
  const addAsAppearing = (speaker: DialogueCharacterRef) =>
    answerPrompt((sceneId) => (doc) =>
      addAppearingCharacter(doc, {
        sceneId,
        // 顯示名是這一句台詞上的名字（漸進揭露：「男子」不被換成實體名）。
        ref: { characterId: speaker.id, displayName: speaker.displayName },
        directory: catalog.directory,
      }),
    );
  const dismissAsNotAppearing = (speaker: DialogueCharacterRef) =>
    answerPrompt((sceneId) => (doc) =>
      dismissAppearingPrompt(doc, { sceneId, characterId: speaker.id }),
    );

  /** 這一場**當下**的群演（對白人物欄的另一種合法目標，§5.1）。 */
  const extrasHere = (): ExtraRef[] => {
    const here = locateBlock(props);
    const scene = here && sceneNow(here.sceneId);
    return sceneExtras(scene?.attrs.extras);
  };

  /**
   * 在人物欄直接新建一筆群演（`眾人 x20`）—— 先記在手上，寫 doc 是 `onCommit` 那一次。
   *
   * 分界規則由**編劇**宣告，不由系統推導：一個人說話落人物、一群人齊聲說落群演（§4.7）。
   * 這一列與「建立新實體」並排出現，兩條路都在他眼前。
   */
  const createExtra = (text: string): EntityOption | null => {
    const parsed = parseExtra(text);
    if (!parsed) return null;
    const extra: ExtraRef = { extraId: mintExtraId(), ...parsed };
    pendingExtras.current = [...pendingExtras.current, extra];
    return { id: extra.extraId, name: extra.description };
  };

  /**
   * 把游標從人物欄送進台詞（getPos → 對白節點之前；+1 進內容）。
   * `"end"` ＝ 文字末端：從人物欄按 ↓ 回台詞是「回去接著寫」，不是回頭改開頭。
   */
  const enterDialogueBody = (place: "start" | "end" = "start") => {
    const pos = typeof props.getPos === "function" ? props.getPos() : undefined;
    if (pos == null) return;
    const at = pos + 1 + (place === "end" ? node.content.size : 0);
    editor.chain().focus().setTextSelection(at).run();
  };

  /**
   * 人物欄按 ↑／←：跳到**上一個**可放游標的區塊的文字末端（使用者回饋 2026-09-04；← 是票券 61）。
   * 用 `TextSelection.near(…, -1)` 往回找，所以同場次的前一個區塊、前一段片段、或前一場的最後一個
   * 區塊都自然涵蓋。往回找不到時回 `false`，把這顆鍵還給瀏覽器。
   *
   * 例外是**正上方就是一排 chip row** 的時候（本場第一個區塊、群組第一段片段的第一個區塊）：
   * 再往上是那一排，不是上一場的內文（票券 34）。哪一排由 `sceneChipsAbove` 答 —— 與台詞第一行
   * 按 ↑（`extensions/vertical-nav`）同一支，片段該去最後一個成員那一排、第二段以後該回前一段，
   * 都只有一個答案。
   */
  const focusPreviousBlockEnd = (): boolean => {
    const pos = typeof props.getPos === "function" ? props.getPos() : undefined;
    if (pos == null) return false;
    const $pos = editor.state.doc.resolve(pos);
    const ctx = sceneContext($pos);
    const above = ctx && sceneChipsAbove($pos, ctx);
    if (above != null) return requestFocus({ kind: "sceneChipsEnd", sceneId: above });

    const before = TextSelection.near($pos, -1);
    if (before.from >= pos) return false; // 往回找不到，near 折回自己身上
    editor.chain().focus().setTextSelection(before.from).run();
    return true;
  };

  return (
    <NodeViewWrapper className="block block--dialogue">
      <DragHandle />
      {/* 對白的人物欄**必須是實體引用而非字串**（§4.7）——「哪幾場有這個人的聲音但沒入鏡」
          只能靠這一欄回答。寫入走 domain command，引用完整性住在那裡。 */}
      <EntityField
        inputRef={inputRef}
        handleRef={fieldRef}
        kind="character"
        placeholder="人物"
        className="block__speaker-field"
        inputClassName="block__speaker"
        refs={speaker}
        options={catalog.characters}
        usage={() => entityUsage(editor.state.doc)}
        elsewhere={catalog.charactersElsewhere}
        // 合法目標是「人物」或「**本場次的**群演」（§5.1）—— id 只在該場次內有意義。
        // 給函式不給值：群演住在場次 attr，改了它這個 view 不會重繪（票券 56）。
        sceneExtras={() =>
          extrasHere().map((e) => ({
            id: e.extraId,
            name: e.description,
            // 升格那一列的措辭要在四種樣子上都說得出話 —— 所以這裡給的是**值本身**，不是
            // 一個數字（票券 49／50）。
            count: e.countValue,
          }))
        }
        onCreateExtra={createExtra}
        // 升格（特約）—— 先記在手上，減一與人物引用是 `onCommit` 那一次寫入（票券 35）。
        onPromoteFromExtra={(extraId, characterId) => {
          // 同一位說話者只留最後一次 —— 見 `pendingPromotions`。
          const kept = pendingPromotions.current.filter((p) => p.characterId !== characterId);
          pendingPromotions.current = [...kept, { extraId, characterId }];
        }}
        // 齊聲：多個具名角色說同一句。頓號分隔，同地點欄與登場人物欄那一套規則（Enter 才解析，票券 82）。
        multiple
        // Enter 定案名字之後，游標直接進同一句的台詞（票券 82）—— 選完人還留在人物欄的話，接著打的
        // 台詞會落進人物欄，被當成下一個人名。離開欄位的定案不走這裡（游標已經在別處了）。
        onSettled={() => {
          sealHistory();
          enterDialogueBody();
        }}
        onMoveToBody={moveToBody}
        onCommit={(refs) => {
          const here = locateBlock(props);
          if (!here) return;
          // 又寫了一次 ＝ 「↓ 移到台詞」那一步不再是 ⌘Z 的下一站。
          takeBackFrom.current = null;
          // 過渡引用（沒有 id）寫不回去 —— 它指不到任何實體。
          const placed = refs.filter((r): r is EntityRef & { id: string } => r.id !== null);
          // 剛在這一欄新建、而且真的被留在欄位裡的那幾筆群演（打了又刪掉的不寫進去）。
          const born = pendingExtras.current.filter((e) => placed.some((r) => r.id === e.extraId));
          // 升格出來的人真的被留在欄位裡才拉走那一個（打了又刪掉的不算）。
          const taken = pendingPromotions.current.filter((p) =>
            placed.some((r) => r.id === p.characterId),
          );
          const speakers = placed.map((r) => ({ id: r.id, displayName: r.displayName }));

          const wrote = runKernelCommand(
            editor,
            (doc) => {
              // **群演的變動與指向它的引用是同一個 transaction**：群演的存在性問的是這一場的
              // attr，所以順序是「先動群演、再寫引用」—— 三支 command 串成一次寫入，中間那些
              // doc 不落地（⌘Z 一次回到原狀）。讀現況再改都在 kernel 做（`addSceneExtras`／
              // `takeOneFromExtra`），這裡不去讀 doc：畫面讀到的可能是上一次重繪的那一份。
              let current = doc;
              // ① 升格：那批人各少一個（減到 0 就整筆消失）。
              for (const { extraId } of taken) {
                const step = takeOneFromExtra(current, { sceneId: here.sceneId, extraId });
                // 拉不走就整次放棄 —— 硬寫下去會讓一個人物憑空出現而群演一個都沒少。
                if (!step.ok) return step;
                current = step.value as unknown as PMNode;
              }
              // ② 在這一欄新建的群演。
              if (born.length > 0) {
                const step = addSceneExtras(current, { sceneId: here.sceneId, extras: born });
                if (!step.ok) return step;
                current = step.value as unknown as PMNode;
              }
              // ③ 這一句台詞的說話者。
              return setDialogueCharacters(current, {
                ...here,
                refs: speakers,
                directory: catalog.directory,
              });
            },
            // keepCaret：定案常常發生在**焦點已經離開**的那一刻（blur）—— 例如人物欄 ← 走去上一個區塊
            // （票券 61），文件游標已經放好了。整份 replace 會把它沖到 doc 尾端，游標就這樣被拉進最後
            // 一句台詞（驗收回饋 2026-10-27）。這三支 command 只動 attr，座標不變，原樣放回去就對。
            { keepFocus: true, keepCaret: true },
          );
          // 寫失敗就把手上那幾筆**留著** —— 清掉的話那一筆群演沒進 doc、引用卻還在欄位裡，
          // 下一次寫入會被不變式擋下，編劇的說話者就這樣沒了。
          if (wrote) {
            pendingExtras.current = [];
            pendingPromotions.current = [];
          }
        }}
        // 新建的人物**不**順手掛進登場人物欄（票券 08 的暫時措施，票券 10 拆掉）：判準是入鏡，
        // 不是有沒有台詞。落差由離開這一句時的提示指出來，決定權在編劇手上。
        onCreate={(name) => catalog.create("character", name)}
        onRenameEntity={(id, name) => catalog.rename("character", id, name)}
        // 改名之後，**還印著舊名的那幾場**要不要跟上，由編劇當場裁（票券 39）。三個實體欄位
        // 共用同一份接線，「什麼算還印著舊名」才只有一個答案。
        retitleOthers={retitleOthersIn(editor)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          // ⌘Z 在這個 input 裡到不了 ProseMirror（Tiptap 的 stopEvent）—— 見 `history-keys.ts`。
          if (forwardHistoryKey(editor, e)) return;
          // 空的人物欄（或只剩 chip）上按 Enter：直接進台詞 —— 與正向 Tab 同終點。框裡還有字時這顆鍵
          // 到不了這裡：欄位自己定案，定案完由 `onSettled` 進台詞（票券 82）。
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            // 人名與台詞都還空著 → Enter ＝ 取消這個對白，變回描述。與內文裡按 Enter
            // （`extensions/continue-block`）同一條退路（使用者回饋 2026-09-03，第四輪）。
            const here = locateBlock(props);
            const now = here && blockNow(here);
            if (here && now && isBlankBlock(now)) {
              setBlockTypeAt(editor, here, "action");
              return;
            }
            enterDialogueBody();
            return;
          }
          // 空的人物欄上按 Backspace ＝ 在台詞開頭按（票券 62）：空對白整句拿掉、沒人物有台詞的
          // 併回上一個區塊。欄位裡還有 chip 時（游標在第一顆前面）這裡什麼都不做。
          if (e.key === "Backspace" && e.currentTarget instanceof HTMLInputElement && e.currentTarget.value === "") {
            const pos = typeof props.getPos === "function" ? props.getPos() : undefined;
            if (pos != null) {
              e.preventDefault();
              e.stopPropagation();
              backspaceFromSpeakerField(editor, pos);
            }
            return;
          }
          // 上下方向鍵把人物欄接進文件的垂直動線（使用者回饋 2026-09-04）：
          //   ↓ 回自己的台詞末端；↑ 到上一個區塊的文字末端。
          // 兩顆都要 stopPropagation —— 事件從 input 冒泡到 .ProseMirror 會被 keymap 當成
          // 文件內的游標移動再處理一次。
          if (e.key === "ArrowDown") {
            e.preventDefault();
            e.stopPropagation();
            enterDialogueBody("end");
            return;
          }
          // ← 是 ↑ 的水平對應（票券 61）：游標已經在這一格最前面 —— 空欄位、第一顆 chip 前面那道縫、
          // 第一顆 chip 本身（`chip-caret` 走完了才轉交過來）—— 再往左就是同一個出口。chip row
          // 第一排的 ←／↑ 也是共用一個出口（`nodes/scene`）。打到一半的字照樣走得出去：移開焦點
          // 的 blur 把它定案成 chip，與 → 從字尾進台詞同一條線。
          // 帶修飾鍵的 ← 不是走出去：⌘← 是走到這一格最前面（`chip-caret`）、⇧← 延伸反白、⌥← 逐詞。
          const plainLeft = e.key === "ArrowLeft" && !(e.metaKey || e.ctrlKey || e.altKey || e.shiftKey);
          if (e.key === "ArrowUp" || (plainLeft && fieldEdge(e.currentTarget).atStart)) {
            e.stopPropagation();
            if (focusPreviousBlockEnd()) e.preventDefault();
            return;
          }
          // → 是水平的同一條路：游標貼著人物欄的字尾時，右邊那個東西就是台詞的**開頭**
          // （使用者回饋 2026-09-10 第三輪）。反向那一半早就有了 —— 台詞第一個字之前按 ←
          // 回人物欄（`extensions/vertical-nav`），少了這一顆就是「過得去回不來」（§7.3）。
          // 欄位裡還有 chip 可以走時這顆鍵到不了這裡（`chip-caret` 先接走）。
          if (e.key === "ArrowRight" && fieldEdge(e.currentTarget).atEnd) {
            e.preventDefault();
            e.stopPropagation();
            enterDialogueBody("start");
            return;
          }
          // 欄位裡的 Tab（兩個方向都要）不能冒泡到 BlockCycle 把這個區塊轉掉（§7.1）。
          if (e.key === "Tab") {
            e.stopPropagation();
            if (!e.shiftKey) {
              // 正向 Tab：打完人物名就進台詞。反向 Tab：留在欄位，什麼都不做。
              e.preventDefault();
              enterDialogueBody();
            }
          }
        }}
      />
      <NodeViewContent className="block__content" />
      {askable.length > 0 && (
        <AppearingPromptMenu
          // 問的人換了就是另一份選單：亮起的列不該沿用到別人身上。
          key={askable.map((s) => s.id).join()}
          speakers={askable}
          onAdd={addAsAppearing}
          onDismiss={dismissAsNotAppearing}
          onSkip={() => resumeAfterAppearingPrompt(editor)}
          onClose={() => closeAppearingPrompt(editor)}
        />
      )}
    </NodeViewWrapper>
  );
}

export const ActionNode = Action.extend({
  addNodeView() {
    return staticBlockView("block block--action");
  },
});

export const DialogueNode = Dialogue.extend({
  addNodeView() {
    return ReactNodeViewRenderer(DialogueView, { ignoreMutation: ignoreReactChromeMutation });
  },
});

export const InsertShotNode = InsertShot.extend({
  addNodeView() {
    return staticBlockView("block block--insert-shot", insertShotTag);
  },
  // Enter 的行為（延續當前型別，不多行）統一在 `extensions/continue-block` —— 三種區塊同一套。
});
