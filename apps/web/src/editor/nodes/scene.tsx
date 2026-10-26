/**
 * 場次 node view —— §7.9（不變式 G）／§7.10／§7.11。
 *
 * 場次是有起點的內容容器，但**不畫邊框**：邊界靠場次標記、gutter 與間距（見 editor.css）。
 * 場次號是 decoration（`../extensions/scene-numbers`）—— 住 gutter、不進 content flow、不可 select、
 * 不進 tab 序；typography role 只是第三支撐。內嵌簡表（chip row）**常駐、不可被預設 UI 收合**。
 *
 * 自訂重繪條件（見檔尾 `update`）：只在 metadata（node attr）或「場次號／整場選取」簽章變了才
 * 重繪 —— 內文改動交給 `NodeViewContent`，不驚動 React；簽章比的是自己那一份、不是整個 decoration
 * 陣列（否則每按一鍵全部場次重繪）。§7.7。
 */
"use client";

import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import type { Decoration } from "@tiptap/pm/view";
import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import {
  INT_EXT_VALUES,
  MONTAGE,
  deleteScene,
  dissolveGroup,
  sceneAppearingCharacters,
  sceneExtras,
  sceneLocations,
  setAppearingCharacters,
  setManualDraft,
  setSceneExtras,
  setSceneIntExt,
  setSceneLocations,
  subsceneTimeOptions,
  ungroupMember,
  type CommandResult,
  type ExtraRef,
  type SceneIntExt,
  type SceneTime,
  type SubsceneKind,
} from "@scenephonie/schema";

import type { Node as PMNode } from "@tiptap/pm/model";

import { ChipSelect } from "../chip-select";
import { chipNavHandler, type ChipNav } from "../chip-nav";
import { firstFragmentText } from "../address";
import { runKernelCommand } from "../command-bridge";
import { forwardHistoryKey } from "../history-keys";
import { useEntityCatalog, type EntityCatalog } from "../entity-catalog";
import { EntityField, type EntityKind, type EntityRef } from "../entity-field";
import { extraDescriptions } from "../extras-catalog";
import { ExtrasField } from "../extras-field";
import { FieldInfo } from "../field-info";
import { entityUsage } from "../entity-usage";
import { retitleOthersIn } from "../retitle-others";
import { claimFocus, handOffFocus, subscribeFocusRequest } from "../focus";
import { consumeSceneBirth, subscribeSceneBirth } from "../scene-birth";
import { scrollToWritingPosition } from "../typewriter-scroll";
import { requestNextScene } from "../extensions/next-scene";
import { DRAFT_MARK, sceneNumberOf, type SceneNumberSpec } from "../extensions/scene-numbers";
import { closePointMenu, isMenuAnchor, pointMenus } from "../point-menu";
import { deleteSceneLabel, type MenuRow } from "../scene-menu";
import { GroupMember, Scene, Subscene } from "../schema";
import { ignoreReactChromeMutation } from "./react-mutations";

/**
 * 兩個封閉列舉的**劇本術語** —— 也是速記鍵的來源（使用者回饋 2026-09-10 第四輪）。
 *
 * 不是為了速記鍵發明的縮寫：`INT.`／`EXT.`／`DAY`／`NIGHT` 就是場次標題行本來的寫法，
 * 所以「按 i 就是內景」對寫過劇本的人不必學。撞在一起的那幾個（DAY／DAWN／DUSK 都是 D）
 * 靠重複按同一顆鍵循環，見 `../chip-select` 的 `typeAhead`。
 *
 * 住在這裡而不是 kernel：它是**這一格的操作提示**，不是 canonical doc 的一部分。
 * 匯出格式要用到同一批術語時再往下搬（那時它才變成資料）。
 */
const INT_EXT_TERMS: Readonly<Record<string, string>> = {
  內景: "INT.",
  外景: "EXT.",
  內外景: "INT./EXT.",
  雜景: "MONTAGE",
};

const TIME_TERMS: Readonly<Record<string, string>> = {
  日: "DAY",
  夜: "NIGHT",
  晨: "DAWN",
  昏: "DUSK",
};

/**
 * 子場次的種類在 chip row 前面怎麼稱呼 —— 用詞取自 `/` 選單（「插入戲」／「接續到…」，去掉
 * 那個指向下一步的「到…」；ADR-0006：名字說概念不說結構），編劇在第二個場合重複同一課。
 */
const KIND_LABELS: Readonly<Record<SubsceneKind, string>> = {
  插入: "插入戲",
  接續: "接續",
};

/** 欄位裡的 Tab 不能冒泡到 BlockCycle —— 否則會把游標所在區塊轉成別的型別，欄位當場消失。 */
const swallowTab = (e: ReactKeyboardEvent) => {
  if (e.key === "Tab") e.stopPropagation();
};

/**
 * doc 裡的引用 → 實體欄位的中性形狀。
 *
 * ⚠️ **id 為 null 的引用是票券 04／07 的過渡形狀**（實體還不存在時的佔位）。讀取容忍它 ——
 * 顯示名照印，chip 照樣看得到（§6.6）；但**寫不回去**：不變式 ⑧ 的檢查對象是實體表，
 * 一筆從來沒有 id 的引用沒有實體可指。編劇在這一欄動手時，它會被他自己打的那一筆取代。
 */
const toFieldRef = (id: unknown, displayName: string): EntityRef => ({
  id: typeof id === "string" ? id : null,
  displayName,
});

/** 真的指得到實體的那些引用 —— 只有它們進得了 command。 */
type PlacedRef = EntityRef & { id: string };
const placed = (refs: readonly EntityRef[]): PlacedRef[] =>
  refs.filter((r): r is PlacedRef => r.id !== null);

/**
 * chip row 上的一格實體欄位。
 *
 * 地點與登場人物只差在**寫回 doc 的是哪一支 command** —— 其餘（目錄、建立、改名、
 * keepFocus、空欄位的虛線樣式）逐字相同，所以只寫一次。
 */
function SceneEntityChip({
  editor,
  catalog,
  kind,
  placeholder,
  refs,
  usage,
  multiple,
  confirmReplace,
  inputRef,
  write,
  nav,
}: {
  editor: NodeViewProps["editor"];
  catalog: EntityCatalog;
  kind: EntityKind;
  placeholder: string;
  refs: EntityRef[];
  usage: () => ReadonlyMap<string, number>;
  /** 這一欄現在收不收得下第二個值。登場人物永遠可以；地點只有雜景可以（§4.3）。 */
  multiple: boolean;
  /** 收不下時，第二個值要不要先問過編劇（見 `EntityField`）。 */
  confirmReplace?: ComponentProps<typeof EntityField>["confirmReplace"];
  inputRef?: React.Ref<HTMLInputElement>;
  /** 這一欄怎麼寫回 doc。吃已經濾掉過渡引用的清單，吐一支 kernel command。 */
  write: (refs: PlacedRef[]) => (doc: PMNode) => CommandResult;
  /** 這一格在 chip row 版面上的四個鄰居（§7.1 焦點串接、票券 34）。 */
  nav: ChipNav;
}) {
  return (
    <FieldInfo
      info={kind}
      className={`scene__chip scene__chip--${kind}${refs.length > 0 ? "" : " scene__chip--empty"}`}
    >
      {(describedBy) => (
        <EntityField
          inputRef={inputRef}
          kind={kind}
          placeholder={placeholder}
          describedBy={describedBy}
          refs={refs}
          options={kind === "location" ? catalog.locations : catalog.characters}
          usage={usage}
          elsewhere={kind === "character" ? catalog.charactersElsewhere : undefined}
          multiple={multiple}
          confirmReplace={confirmReplace}
          onCommit={(next) =>
            runKernelCommand(editor, write(placed(next)), { keepFocus: true })
          }
          onCreate={(name) => catalog.create(kind, name)}
          onRenameEntity={(id, name) => catalog.rename(kind, id, name)}
          // 改名之後，**還印著舊名的那幾場**要不要跟上，由編劇當場裁（票券 39）。三個實體欄位
          // 共用同一份接線，「什麼算還印著舊名」才只有一個答案。
          retitleOthers={retitleOthersIn(editor)}
          onKeyDown={chipNavHandler(nav)}
        />
      )}
    </FieldInfo>
  );
}

function SceneView({ node, editor, updateAttributes, decorations, getPos }: NodeViewProps) {
  // chip row 五格各留一支 ref —— 方向鍵要在它們之間走（票券 34），靠 ref 而不是 class 名
  // 走訪 DOM：同一份 markup 在每一場都畫一次，class 選出來的是全部場次的那一格。
  const firstField = useRef<HTMLButtonElement>(null);
  const timeField = useRef<HTMLButtonElement>(null);
  const locationField = useRef<HTMLInputElement>(null);
  const charactersField = useRef<HTMLInputElement>(null);
  const extrasField = useRef<HTMLInputElement>(null);
  const sceneId = node.attrs.sceneId as string;
  const catalog = useEntityCatalog();
  // 子場次（票券 11）與主場次共用這一支 node view —— 它有自己完整的 metadata，差別只在
  // 號碼（5.1）、種類標籤、時間下拉的排法、沒有腳部按鈕、刪除選單的字。
  const isSubscene = node.type.name === "subscene";
  // 群組成員（票券 12）也共用這一支：完整的 metadata、一個頂層號，但**沒有內容**（內容在片段裡），
  // 所以沒有 `NodeViewContent`、沒有腳部按鈕（「新增下一場」接在整個群組之後，見 `./group`）。
  const isMember = node.type.name === "groupMember";
  const kind = isSubscene ? ((node.attrs.kind as SubsceneKind | null) ?? null) : null;
  /** SceneMenu 的列 —— 點下去那一刻依這一場的狀態組出來（選單開著時不會變）。 */
  const menuRows = (): MenuRow[] => [
    // 群組成員：先給「離開對剪」的兩條路（內容保住），刪除排最後（驗收 2026-10-21）。
    ...(isMember
      ? [
          {
            key: "ungroup",
            label: "移出對剪（接在群組後面）",
            run: () => runKernelCommand(editor, (doc) => ungroupMember(doc, { sceneId })),
          },
          {
            key: "dissolve",
            label: "解散對剪（全部變回普通場次）",
            run: () => {
              const groupId = enclosingGroupId();
              if (groupId) runKernelCommand(editor, (doc) => dissolveGroup(doc, { groupId }));
            },
          },
        ]
      : []),
    // 手動標記（票券 14）：只寫 manualDraft 這個宣告；取消後 metadata 沒填完照樣是草稿。
    // 已經自動是草稿的一場說「標記為草稿」會像沒反應 —— 那一列的作用是填完了也不轉正式。
    {
      key: "draft",
      label: manualDraft ? "取消草稿標記" : spec?.draft ? "固定為草稿" : "標記為草稿",
      // 只動 attr、不動座標：游標留在編劇正在寫的地方（否則整份 replace 把它 map 到 doc 尾，
      // 「離開時才判定」也會把那一下讀成他移到了末場）。
      run: () =>
        runKernelCommand(
          editor,
          (doc) => setManualDraft(doc, { sceneId, manualDraft: !manualDraft }),
          { keepCaret: true },
        ),
    },
    {
      key: "delete",
      label: isMember ? "刪除這一場（連同它的片段）" : deleteSceneLabel(isSubscene, spec?.subscenes ?? 0),
      // 刪主場次一併刪子場次；⌘Z 一步整棵回來（bridge 是一個 transaction）。
      run: () =>
        runKernelCommand(editor, (doc) => deleteScene(doc, { sceneId }), {
          caretNear: typeof getPos === "function" ? getPos() : undefined,
        }),
    },
  ];

  /** 場次號 —— SceneMenu 的錨點（選單長在它外側，`../point-menu`）。 */
  const numberRef = useRef<HTMLDivElement>(null);
  const menuOpen = pointMenus.use()?.anchor === numberRef.current && numberRef.current != null;

  // 「新增下一場」的即時回饋：這一場若剛被建立出來，短暫掛上 .scene--just-added（CSS 自己淡出）。
  // 掛載時領一次（append 情境），並訂閱 markSceneBorn（中間插入時 node view 被沿用、不重新掛載，
  // 靠通知才收得到）。
  //
  // ⚠️ 卸 class 走 animationend，**不用 setTimeout**：StrictMode 會把 effect 跑兩次
  // （run → cleanup → run），cleanup 清掉計時器後第二次已領不到（born 被消費掉），class 就永遠
  // 留著；同一個 node view 之後被沿用給另一場新生場次時，class 已在 → CSS 動畫不會重播。
  // 這就是使用者回饋 2026-09-03（兩輪）的「動畫有時候不會出現」。
  const [justBorn, setJustBorn] = useState(false);
  // 同一次誕生也決定捲動落點（票券 27）。狀態之外再留一支 ref：焦點串接要**同步**讀得到
  // 「這一場是剛生出來的嗎」（見下一個 effect），而 setState 要等下一次 render 才看得到。
  const bornForScroll = useRef(false);
  useEffect(() => {
    const claim = () => {
      if (consumeSceneBirth(sceneId)) {
        setJustBorn(true);
        bornForScroll.current = true;
      }
    };
    claim();
    return subscribeSceneBirth(claim);
  }, [sceneId]);

  /** 成員所在群組的 `groupId`（「解散對剪」用）；不是成員時回 `null`。 */
  const enclosingGroupId = (): string | null => {
    const pos = typeof getPos === "function" ? getPos() : undefined;
    if (!isMember || pos == null) return null;
    return (editor.state.doc.resolve(pos).parent.attrs.groupId as string | undefined) ?? null;
  };

  /**
   * 把游標送進本場第一個區塊的內文開頭（getPos → 場次前；+1 進場次、+1 進首區塊）。
   * 群組成員沒有內文 —— 去它的第一個片段。
   */
  const enterBody = () => {
    const pos = typeof getPos === "function" ? getPos() : undefined;
    if (pos == null) return false;
    if (isMember) {
      const at = firstFragmentText(editor.state.doc, sceneId);
      if (at == null) return false;
      editor.chain().focus().setTextSelection(at).run();
      return true;
    }
    editor.chain().focus().setTextSelection(pos + 2).run();
    return true;
  };

  /**
   * chip row 第一排再往上／往左 —— 去**上一場內文的末端**（票券 34 修訂）。
   *
   * 這一排上面確實還有東西：上一場。反向那一半（上一場內文末端按 ↓／→ 回到這裡）在
   * `../extensions/vertical-nav` —— 兩邊要一起看，不然就是「過得去回不來」。
   * 本場就是第一場時什麼都不做：那顆鍵原封還給瀏覽器。
   */
  const enterPreviousSceneEnd = () => {
    const pos = typeof getPos === "function" ? getPos() : undefined;
    if (pos == null || pos === 0) return false;
    // pos 是本場節點**之前**的位置，pos - 1 落在上一場裡；往回找最近的 textblock 就是它的末端。
    const target = TextSelection.near(editor.state.doc.resolve(pos - 1), -1);
    editor.chain().focus().setTextSelection(target.from).run();
    return true;
  };

  /**
   * `⌘↑`／`⌘↓` —— 不管現在在哪一格，一路走到底（使用者回饋 2026-09-10 第三輪：
   * 「要選定一組直觀的快捷鍵，讓使用者可以直接跳從 metadata 的任意位置，直接跳到內容區塊上」）。
   *
   * 五格共用同一組，所以它就是「離開整排」的意思，不必記哪一格通往哪裡。選 ⌘ ＋ 上下而不是
   * 另造一顆鍵，是為了跟欄位裡的 `⌘←`／`⌘→`（走到這一格的最前／最後）湊成同一個心智模型：
   * **⌘ ＋ 方向 ＝ 這個方向上走到不能再走**。⌘Enter 不能用 —— 那是「新增下一場」（§7.1）。
   */
  const exits: Pick<ChipNav, "exitUp" | "exitDown"> = {
    exitUp: enterPreviousSceneEnd,
    exitDown: enterBody,
  };

  // 焦點串接（§7.7）是一次性的：建場 → requestFocus → 新 node view 消費掉。掛載時試領一次
  // （`/next` 的請求早於掛載），並訂閱後續請求（初次進編輯器時 `onCreate` 的請求晚於掛載）。
  useEffect(() => {
    const tryClaim = () => {
      // 從內文按 ↑ 回來的那條路，落在 chip row 的**最後一格**（票券 34）—— 它是 Tab 順序的
      // 反向，也就是「Tab 進內文之前的那一格」。焦點串接照樣要看得見，所以走 handOffFocus。
      if (claimFocus((p) => p.kind === "sceneChipsEnd" && p.sceneId === sceneId)) {
        handOffFocus(extrasField.current);
        return;
      }
      if (!claimFocus((p) => p.kind === "sceneMeta" && p.sceneId === sceneId)) return;
      // 剛誕生的場次自己決定落點（打字餘裕，票券 27）—— 所以要擋掉 `focus()` 的原生捲動，
      // 否則瀏覽器先把它推到視窗底緣、我們再捲一次，看起來是跳兩下。
      // 不是新生場次（載入時的焦點串接，票券 26／31）就照原生行為捲進可視範圍。
      const born = bornForScroll.current;
      bornForScroll.current = false;
      handOffFocus(firstField.current, { preventScroll: born });
      if (born) scrollToWritingPosition(firstField.current?.closest(".scene"));
    };
    tryClaim();
    return subscribeFocusRequest(tryClaim);
  }, [sceneId]);

  const spec: SceneNumberSpec | undefined = sceneNumberOf(
    decorations as unknown as readonly Decoration[],
  );
  const label = spec?.sceneNo ?? "?";
  const manualDraft = node.attrs.manualDraft === true;

  const intExt = (node.attrs.intExt as string | null) ?? "";
  const time = (node.attrs.time as string | null) ?? "";
  // 時間下拉依種類排序（§7.4）：接續把主場次的值置頂、插入只標注。**不是預填** —— 欄位照樣空著。
  const timeChoices = subsceneTimeOptions(
    kind,
    isSubscene ? ((spec?.parentTime ?? null) as SceneTime | null) : null,
  );

  const locationRefs = sceneLocations(node.attrs.location).map((r) =>
    toFieldRef(r.locationId, r.displayName),
  );
  const characterRefs = sceneAppearingCharacters(node.attrs.appearingCharacters).map((r) =>
    toFieldRef(r.characterId, r.displayName),
  );
  const extras = sceneExtras(node.attrs.extras);
  // 「（12 場）」要走一遍整份 doc —— 傳函式而不是值，只有選單真的要畫時才算（§7.7）。
  const usage = () => entityUsage(editor.state.doc);

  return (
    <NodeViewWrapper
      // 「焦點進了哪一場」從 chip row 往上找這個（離開時才判定，見 extensions/scene-numbers）。
      data-scene-id={sceneId}
      className={[
        "scene",
        isSubscene && "scene--sub",
        isMember && "scene--member",
        justBorn && "scene--just-added",
        // 草稿（票券 14）：推導的，填完 metadata 它自己就卸掉。手動標記的另掛一個 class —— 編劇
        // 要分得出「我說它是草稿」與「它還沒寫完」（使用者回饋 2026-10-21）。
        spec?.draft && "scene--draft",
        spec?.draft && manualDraft && "scene--draft-manual",
        spec?.selected && "is-node-selected",
        // 選單開著：整場亮起來（群組成員不選起來，靠這個看得出選單作用在哪一場）。
        menuOpen && "is-menu-target",
        // 位置旗標走 decoration，不靠 :first-child／:last-child（見 extensions/scene-numbers）。
        spec?.isFirst && "scene--first",
        spec?.isLast && "scene--last",
      ]
        .filter(Boolean)
        .join(" ")}
      // 動畫播完就卸 class，下次再生時才能重播。reduced-motion 下 animation: none、事件不會來，
      // 但那時本來就沒有動畫可播，class 留著不影響外觀。
      onAnimationEnd={() => setJustBorn(false)}
    >
      {/* 場次號 decoration：gutter、不可編輯、不可 select、不進 tab 序。點下去開 SceneMenu
          （§7.1），同時選起整場（同 ⌘A 第三段）。它也是這一場的**拖曳把手**（票券 13）：按住拖 ＝ 搬移，拖到哪裡決定升級、降級還是
          平移（`../extensions/drag-reorder`）。群組成員不是把手 —— 成員不單獨進出群組，整組由群組的
          ⠿ 拖。 */}
      <div
        ref={numberRef}
        className="scene__number"
        contentEditable={false}
        aria-hidden="true"
        {...(isMember ? {} : { draggable: true, "data-drag-handle": "" })}
        // 把手的 mousedown 由拖曳那邊攔下、不交給 ProseMirror（preventDefault 會讓它拖不起來）。
        onMouseDown={isMember ? (e) => e.preventDefault() : undefined}
        onClick={() => {
          const el = numberRef.current;
          if (!el) return;
          if (isMenuAnchor(el)) return closePointMenu(); // 再點一次 ＝ 收起
          // 選起整場（同 ⌘A 第三段）：選單收起之後它仍選著，⌘C／⌘X／⌫ 對整場作用。這不算「進了
          // 這一場」，離開時才判定的鎖不動（`../extensions/scene-numbers`）。群組成員不選 —— 成員
          // 不單獨搬，單獨剪下會把它從群組裡拆出來。
          const pos = typeof getPos === "function" ? getPos() : undefined;
          if (!isMember && pos != null) {
            editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));
          }
          pointMenus.set({ anchor: el, rows: menuRows(), onClose: () => editor.view.focus() });
        }}
      >
        {/* 標籤自己一個盒：手動草稿的淡底只包住字，不連 gutter 的內距一起塗。 */}
        {/* 草稿印「草稿」不印標籤（票券 16）—— 標籤留給滑過時看是哪一場。 */}
        <span className="scene__label" title={spec?.draft ? label : undefined}>
          {spec?.draft ? DRAFT_MARK : label}
        </span>
      </div>

      {/* 內嵌簡表 —— 常駐。缺漏要看得出來（空 metadata → 自動草稿 → 匯出前被攔）。
          下拉比照 slash 選單外觀（ChipSelect），不用原生 <select>。 */}
      <div
        className="scene__chips"
        contentEditable={false}
        // 焦點在這一排的任何控制項裡時，⌘Z 到不了 ProseMirror —— 見 `history-keys.ts`。
        onKeyDown={(e) => {
          if (forwardHistoryKey(editor, e)) return;
          swallowTab(e);
        }}
      >
        {kind && (
          <span className={`scene__kind scene__kind--${kind === "插入" ? "insert" : "continue"}`}>
            {KIND_LABELS[kind]}
          </span>
        )}
        {/* 成員是第幾個 —— 也就是把片段切給它的那顆鍵（`⌘+1`／`⌘+2`／`⌘+3`）。 */}
        {isMember && spec?.memberOrdinal != null && (
          <span className="scene__kind scene__kind--member" title="把游標所在片段切給這一場">
            ⌘{spec.memberOrdinal}
          </span>
        )}
        <FieldInfo info="intExt" className={`scene__chip${intExt ? "" : " scene__chip--empty"}`}>
          {(describedBy) => (
          <ChipSelect
            ref={firstField}
            className="scene__chip-control"
            placeholder="內外"
            describedBy={describedBy}
            value={intExt}
            options={INT_EXT_VALUES}
            terms={INT_EXT_TERMS}
            // 離開雜景時，多出來的地點沒地方去（§4.3：metadata 一律單值，雜景是唯一的
            // 逃生口）。kernel 會拒絕這次寫入 —— 但拒絕當下畫面上只是「下拉沒有變」，
            // 那是「按了沒反應」（使用者回饋 2026-09-10 第五輪）。把情況說出來，並且
            // 把他送到該動手的那一格去。**不提供「幫你刪掉多餘的地點」** —— 那是他打
            // 進去的字，系統不在他背後刪（同 kernel `setSceneIntExt` 的裁決）。
            confirm={(next) =>
              next !== MONTAGE && locationRefs.length > 1
                ? {
                    note:
                      `這一場有 ${locationRefs.length} 個地點（${locationRefs
                        .map((r) => r.displayName)
                        .join("、")}）。只有雜景的地點欄放得下多個地點 ——` +
                      `要改成${next || "未選"}，得先把多餘的地點拿掉。`,
                    rows: [
                      {
                        key: "goto",
                        label: "→ 先去地點欄拿掉多餘的",
                        run: () => locationField.current?.focus(),
                      },
                      { key: "keep", label: "✕ 維持雜景", run: () => {} },
                    ],
                  }
                : null
            }
            // 這一排的左上角：↑ 與 ← 都出界，去上一場。↓ 歸選單（見 chip-select 檔頭）。
            nav={{
              ...exits,
              left: enterPreviousSceneEnd,
              up: enterPreviousSceneEnd,
              right: () => timeField.current?.focus() ?? true,
            }}
            // 走 command 而不是 updateAttributes —— 「地點欄能有幾個值」是內外的函式
            // （§4.3 雜景逃生口）。被拒絕時下拉維持原值，不在編劇背後丟掉他打的地點。
            onChange={(v) =>
              runKernelCommand(
                editor,
                (doc) =>
                  setSceneIntExt(doc, {
                    sceneId,
                    intExt: (v || null) as SceneIntExt | null,
                  }),
                { keepFocus: true },
              )
            }
          />
          )}
        </FieldInfo>

        <FieldInfo info="time" className={`scene__chip${time ? "" : " scene__chip--empty"}`}>
          {(describedBy) => (
            <ChipSelect
              ref={timeField}
              className="scene__chip-control"
              placeholder="時間"
              describedBy={describedBy}
              value={time}
              options={timeChoices.options}
              notes={timeChoices.origin ? { [timeChoices.origin]: "（原場次）" } : undefined}
              terms={TIME_TERMS}
              nav={{
                ...exits,
                left: () => firstField.current?.focus() ?? true,
                right: () => locationField.current?.focus() ?? true,
                up: enterPreviousSceneEnd,
              }}
              onChange={(v) => updateAttributes({ time: v || null })}
            />
          )}
        </FieldInfo>

        {/* 地點與登場人物是**實體引用**（§4.7）——寫入一律走 domain command，因為引用完整性
            （不變式 ⑧）住在那裡，不住在這個欄位。command 被拒絕時 bridge 會 warn 並 no-op。 */}
        <SceneEntityChip
          editor={editor}
          catalog={catalog}
          kind="location"
          placeholder="地點"
          refs={locationRefs}
          usage={usage}
          // **多值是雜景的性質，不是地點欄的性質**（§4.3）。非雜景場次的頓號因此不是分隔符，
          // 而是名字裡的普通字元 —— 跟對白人物欄同一條規則。這樣編劇打的字不會被 command
          // 事後拒絕：欄位一開始就沒有收下第二個值。為什麼只有雜景例外，說明在 ⓘ 裡。
          multiple={intExt === MONTAGE}
          // 收不下的時候**不覆蓋**：第二個地點多半不是要換掉第一個，而是這一場真的橫跨兩地
          // —— 那是場次形狀的問題，不該由一次靜悄悄的覆蓋替編劇決定（使用者裁決 2026-09-10）。
          // 升級成雜景走 command 而不是 updateAttributes：「地點欄能有幾個值」是內外的函式。
          confirmReplace={{
            escalate: {
              label: "🎬 兩個都留 —— 把這一場改成雜景",
              run: () =>
                runKernelCommand(
                  editor,
                  (doc) => setSceneIntExt(doc, { sceneId, intExt: MONTAGE }),
                  { keepFocus: true },
                ),
            },
          }}
          write={(refs) => (doc) =>
            setSceneLocations(doc, {
              sceneId,
              refs: refs.map((r) => ({ locationId: r.id, displayName: r.displayName })),
              directory: catalog.directory,
            })
          }
          inputRef={locationField}
          // 第一排最右邊：↓ 落到正下方那一排（登場人物），→ 也是它 —— 第一排到此為止。
          nav={{
            ...exits,
            left: () => timeField.current?.focus() ?? true,
            right: () => charactersField.current?.focus() ?? true,
            up: enterPreviousSceneEnd,
            down: () => charactersField.current?.focus() ?? true,
          }}
        />

        {/* 登場人物。**判準是入鏡，不是有沒有台詞** —— 這一欄由編劇填，系統絕不從對白推導
            （推導會讓製片誤排演員通告）。提示是另一件事：離開一句對白時問（`extensions/appearing-prompt`）。 */}
        <SceneEntityChip
          editor={editor}
          catalog={catalog}
          kind="character"
          placeholder="登場人物"
          refs={characterRefs}
          usage={usage}
          multiple
          inputRef={charactersField}
          write={(refs) => (doc) =>
            setAppearingCharacters(doc, {
              sceneId,
              refs: refs.map((r) => ({ characterId: r.id, displayName: r.displayName })),
              directory: catalog.directory,
            })
          }
          nav={{
            ...exits,
            left: () => locationField.current?.focus() ?? true,
            right: () => extrasField.current?.focus() ?? true,
            up: () => locationField.current?.focus() ?? true,
            down: () => extrasField.current?.focus() ?? true,
          }}
        />

        {/* 群演。**場次限定實體** —— 沒有實體表、沒有目錄，`extraId` 只在這一場內有意義，
            所以它不走 `EntityField`（見 extras-field.tsx 檔頭那張對照表）。描述可以跨場次
            補字串，但那**只是字**，不建立「這是同一批人」的連結。 */}
        <FieldInfo
          info="extras"
          className={`scene__chip scene__chip--extras${extras.length > 0 ? "" : " scene__chip--empty"}`}
        >
          {(describedBy) => (
            <ExtrasField
              inputRef={extrasField}
              describedBy={describedBy}
              extras={extras}
              // 別場用過的描述。走一遍整份 doc，所以傳函式（同 usage）。
              suggestions={() => extraDescriptions(editor.state.doc)}
              onCommit={(next: ExtraRef[]) =>
                runKernelCommand(editor, (doc) => setSceneExtras(doc, { sceneId, extras: next }), {
                  keepFocus: true,
                })
              }
              // chip row 最後一格。往下／往右就出界進場次內文開始撰寫（不是跳到腳部按鈕，
              // 那顆已 tabIndex=-1）—— 也是內文按 ↑／← 回來時的落點。反向 Tab：交給瀏覽器原生回到
              // 登場人物欄；BlockCycle 的攔截由外層 swallowTab 擋掉。§7.1 焦點串接、票券 34。
              onKeyDown={chipNavHandler({
                ...exits,
                left: () => charactersField.current?.focus() ?? true,
                right: enterBody,
                up: () => charactersField.current?.focus() ?? true,
                down: enterBody,
              })}
            />
          )}
        </FieldInfo>
      </div>

      {!isMember && <NodeViewContent className="scene__body" />}

      {/* 場次之外沒有可點的空間，「新增下一場」按鈕住在腳部。滑鼠點的入口自己傳 sceneId。
          子場次沒有腳部：場次是序列，子場次不在那條序列上（⌘Enter 照樣接在主場次之後）。 */}
      {!isSubscene && !isMember && (
        <div className="scene__foot" contentEditable={false}>
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(e) => {
              e.preventDefault();
              requestNextScene(editor, sceneId);
            }}
          >
            ＋ 新增下一場
          </button>
        </div>
      )}
    </NodeViewWrapper>
  );
}

/**
 * 重繪判斷：號碼、是不是草稿、整場選取狀態、首尾位置、主場次的時間（子場次）、子場次數（主場次）變了才重繪
 * 這一場（不比整個 decoration 陣列）。
 */
function sigOf(decorations: readonly Decoration[]): string {
  const spec = sceneNumberOf(decorations);
  return `${spec?.sceneNo ?? ""}:${spec?.draft ? 1 : 0}:${spec?.selected ? 1 : 0}:${spec?.isFirst ? 1 : 0}${
    spec?.isLast ? 1 : 0
  }:${spec?.parentTime ?? ""}:${spec?.subscenes ?? ""}:${spec?.memberOrdinal ?? ""}`;
}

function sceneNodeView() {
  return ReactNodeViewRenderer(SceneView, {
    // React 畫的外殼不讀回 —— 見 `./react-mutations`（開著 DevTools 時的失控重繪）。
    ignoreMutation: ignoreReactChromeMutation,
    // SceneView 只畫 metadata（chip row）、場次號與整場選取狀態 —— 內文由 `NodeViewContent`
    // 交給 ProseMirror 直接維護，React 不必參與。所以「內文改了」（`oldNode !== newNode` 但
    // markup 相同）**不重繪**：否則場次裡打每一個字都會整棵 SceneView（兩個 select、兩個實體欄、
    // 腳部按鈕）reconcile 一次，dev 疊上 StrictMode 雙跑會變成每鍵兩次無謂重繪。
    // 只有 attr（intExt／time／location／sceneId）或號碼／選取簽章變了才 `updateProps()`。§7.7。
    update: ({ oldNode, newNode, oldDecorations, newDecorations, updateProps }) => {
      if (oldNode.type !== newNode.type) return false;
      if (
        !oldNode.sameMarkup(newNode) ||
        sigOf(oldDecorations as unknown as readonly Decoration[]) !==
          sigOf(newDecorations as unknown as readonly Decoration[])
      ) {
        updateProps();
      }
      return true;
    },
  });
}

export const SceneNode = Scene.extend({
  addNodeView: sceneNodeView,
});

/** 子場次與主場次共用同一支 node view（票券 11）。 */
export const SubsceneNode = Subscene.extend({
  addNodeView: sceneNodeView,
});

/** 群組成員也是（票券 12）—— 只是沒有內文與腳部。 */
export const GroupMemberNode = GroupMember.extend({
  addNodeView: sceneNodeView,
});

