/**
 * §11 不變式總表的**可單元測試的家**（規格 §6.3：不變式的家是 command 層 ——
 * 在瀏覽器外可單元測試的地方）。
 *
 * 每條不變式一個 `describe`，用總表的編號（`①`…`⑧`、`D`…`I`）。這樣新不變式進來時
 * 有**明確落點**：找到編號、把 `it.todo` 換成實測。
 *
 * 本票券（03）範圍內只有 **⑥**（id 去重）與 **⑦**（五個鑄造時刻）有實作，逐一實測；
 * 其餘標 `it.todo` 並指名落地票券。深入的行為測試在各自的 `commands/*.test.ts`，
 * 這裡只放「這條不變式確實有人守」的骨架斷言。
 */
import { EditorState } from "prosemirror-state";
import { describe, expect, it } from "vitest";

import {
  createNextScene,
  dedupeIdsPlugin,
  dedupeSceneIds,
  duplicateSceneIds,
  MINT_MOMENTS,
  moveScene,
  sceneIdNodes,
  setBlockType,
} from "./commands";
import { schema } from "./schema";
import { block, makeDoc, makeScene, sceneWith } from "./testing";

const sceneCopy = (sceneId: string) =>
  schema.node("scene", { sceneId }, schema.node("action", null, [schema.text("副本")]));
const idsOf = (doc: ReturnType<typeof makeDoc>) =>
  sceneIdNodes(doc).map((e) => e.node.attrs.sceneId as string);

// ── schema 保證的（本票券範圍外，落點在票券 11／12）─────────────────────
describe("不變式 ①：主場次的內容必須以主場次自己的內容開始（子場次不能是第一個孩子）", () => {
  it.todo("command：空場次裡 /insert、/continue-to 不可用 —— 票券 11（子場次）");
});

describe("不變式 ②：子場次的 metadata 不得與主場次完全相同", () => {
  it.todo("command → 視為不完整 → 自動草稿 → 匯出前被攔 —— 票券 11 + 14");
});

describe("不變式 ③：同一群組的成員之間，metadata 不得完全相同", () => {
  it.todo("同 ② 的機制 —— 票券 12（場次群組）");
});

describe("不變式 ④：群組不能巢狀，一個場次不能同時屬於兩個群組", () => {
  it.todo("由 schema 保證（§5.1）：groupFragment 內容規則不含 sceneGroup —— 票券 12");
});

describe("不變式 ⑤：深度固定兩層", () => {
  it.todo("由 schema 保證：subscene 內容規則不含 subscene —— 票券 11");
});

// ── 本票券實作 ────────────────────────────────────────────────────────
describe("不變式 ⑥：同一份 doc 內 id 不得重複（appendTransaction，addToHistory: false）", () => {
  it("純函式 dedupeSceneIds 消掉重複、且不改動輸入 doc", () => {
    const a = makeScene();
    const doc = makeDoc(a, sceneCopy(a.attrs.sceneId as string));
    const snapshot = doc.toJSON();

    const r = dedupeSceneIds(doc);
    expect(r.changed).toBe(true);
    expect(duplicateSceneIds(r.doc)).toEqual([]);
    expect(doc.toJSON()).toEqual(snapshot); // 純函式
  });

  it("appendTransaction：撞號時補一筆修復 transaction，標 addToHistory: false", () => {
    const a = makeScene();
    const state = EditorState.create({
      schema,
      doc: makeDoc(a, makeScene()),
      plugins: [dedupeIdsPlugin()],
    });
    const tr = state.tr.insert(state.doc.content.size, sceneCopy(a.attrs.sceneId as string));
    const { state: next, transactions } = state.applyTransaction(tr);

    expect(duplicateSceneIds(next.doc)).toEqual([]);
    expect(transactions).toHaveLength(2);
    expect(transactions[1]!.getMeta("addToHistory")).toBe(false);
  });

  it("碰撞本身是唯一判別器：剪下貼上不撞號 → id 天然保住", () => {
    const a = makeScene();
    const state = EditorState.create({
      schema,
      doc: makeDoc(a, makeScene()),
      plugins: [dedupeIdsPlugin()],
    });
    const tr = state.tr;
    tr.delete(0, a.nodeSize);
    tr.insert(tr.doc.content.size, sceneCopy(a.attrs.sceneId as string));
    const { state: next, transactions } = state.applyTransaction(tr);

    expect(idsOf(next.doc)).toContain(a.attrs.sceneId);
    expect(transactions).toHaveLength(1);
  });
});

describe("不變式 ⑦：場次身分只在五個時刻被鑄造，其餘一切保住身分", () => {
  it("MINT_MOMENTS 就是 §4.3 的五個時刻", () => {
    expect(Object.keys(MINT_MOMENTS)).toEqual([
      "createScene",
      "createSubscene",
      "createGroupMember",
      "cloneForCollision",
      "pasteAcrossScreenplays",
    ]);
  });

  it("createNextScene 鑄造一個新身分（鑄造時刻 createScene）", () => {
    const a = makeScene();
    const r = createNextScene(makeDoc(a));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ids = idsOf(r.value);
    expect(ids[0]).toBe(a.attrs.sceneId);
    expect(ids[1]).not.toBe(a.attrs.sceneId);
  });

  it("moveScene 保住所有場次身分（搬移不是鑄造時刻）", () => {
    const s = [makeScene(), makeScene(), makeScene()];
    const before = s.map((n) => n.attrs.sceneId as string);
    const r = moveScene(makeDoc(...s), { sceneId: before[0]!, target: { position: "end" } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([...idsOf(r.value)].sort()).toEqual([...before].sort());
  });

  it("setBlockType 保住所在場次身分", () => {
    const s = sceneWith([block.action("x")]);
    const r = setBlockType(makeDoc(s), {
      sceneId: s.attrs.sceneId as string,
      blockIndex: 0,
      type: "dialogue",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(idsOf(r.value)).toEqual([s.attrs.sceneId]);
  });
});

// ── schema／資料層／application 保證的（本票券範圍外）────────────────────
describe("不變式 ⑧：command 拒絕建立對不存在實體的引用；doc 必須允許懸空引用", () => {
  it.todo("command（寫）／projection（讀）—— 票券 08（人物與地點實體）");
});

describe("不變式 D：交付的判準是承諾而非通道", () => {
  it.todo("application —— 票券 17（delivery infrastructure）");
});

describe("不變式 E：semantic freeze / visual drift", () => {
  it.todo("渲染管線：不重算已承諾的語意推導值 —— 票券 18（PDF renderer）");
});

describe("不變式 F：documents.kind 固定其合法層級", () => {
  it.todo("資料層 + command —— 票券 21（交件文件與分場大綱）");
});

describe("不變式 G：編輯器不為模擬輸出格式引入非必要的版面約束或視覺結構", () => {
  it.todo("前端，可否證清單（§7.9、ADR-0010）—— 票券 04（最小編輯器）");
});

describe("不變式 H：Authentication identity 不直接授予 domain authority", () => {
  it.todo("application：command 只接受已授權的 project context —— 票券 06（認證 + 授權 gate）");
});

describe("不變式 I：infra／auth／db 的 access-control 不作為 domain/application authority 來源", () => {
  it.todo("application（ADR-0012）—— 票券 06");
});
