/**
 * 專案的名字目錄在 client 這一側的家（票券 08）。
 *
 * 為什麼是 context 而不是 prop 串下去：使用實體欄位的三個地方（場次的地點欄、登場人物欄、
 * 對白的人物欄）都是 **Tiptap node view**，它們由編輯器掛載，中間沒有我們能傳 prop 的路。
 * node view 由 `EditorContent` 以 portal 渲染，所以 React context 到得了。
 *
 * ── 這份目錄與「存在」的關係 ────────────────────────────────────────────
 * 目錄是 append-only 的**名字清單**，不是「存在的實體清單」：裡面可能有孤兒（⌘Z 掉的那些）。
 * 存在＝被引用（ADR-0005）。所以這裡沒有刪除，也沒有清理 —— 孤兒留在目錄裡的代價是自動補全
 * 偶爾多一列，而清掉它的代價是在編劇的 ⌘Z 底下抽資料。
 *
 * ── 沒有伺服器能力時（測試、票券 04 的獨立編輯器）──────────────────────
 * `create` 退回**本地鑄造**：id 照樣是 `ch_`／`lo_`，只是沒有落地。這讓編輯器在沒有專案脈絡
 * 時仍是可用的，而且引用完整性在本地仍然成立（目錄先多一筆，command 才放行）——
 * 少的是持久化，不是不變式。
 */
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { mintCharacterId, mintLocationId, type EntityDirectory } from "@scenephonie/schema";

import type {
  CreateEntity,
  EntityCatalogSnapshot,
  RenameEntity,
} from "./entity-capability";
import type { EntityKind, EntityOption } from "./entity-field";

export type EntityCatalog = {
  characters: readonly EntityOption[];
  locations: readonly EntityOption[];
  /** command 問「這筆實體在嗎」用的目錄（不變式 ⑧ 的檢查對象）。 */
  directory: EntityDirectory;
  /** 建立一筆實體。**先落地，再讓呼叫端寫 doc**。失敗回 `null`。 */
  create: (kind: EntityKind, name: string) => Promise<EntityOption | null>;
  /**
   * 把實體改名。**只改目錄那一筆** —— 各引用上的顯示名一個字都不動。
   *
   * 別場的舊稱呼要不要跟上是 doc 的事（`retitleEntityRefs`），而且由編劇當場裁 ——
   * 見 `entity-field.tsx` 的 `retitleOthers`（票券 39）。
   */
  rename: (kind: EntityKind, entityId: string, name: string) => void;
};

const EMPTY: EntityCatalog = {
  characters: [],
  locations: [],
  directory: { hasCharacter: () => false, hasLocation: () => false },
  create: async () => null,
  rename: () => {},
};

const CatalogContext = createContext<EntityCatalog>(EMPTY);

export function useEntityCatalog(): EntityCatalog {
  return useContext(CatalogContext);
}

export function EntityCatalogProvider({
  initial,
  projectId,
  createEntity,
  renameEntity,
  children,
}: {
  initial?: EntityCatalogSnapshot;
  /** 有專案脈絡才寫得回伺服器；沒有就是本地目錄（見檔頭）。 */
  projectId?: string;
  createEntity?: CreateEntity;
  renameEntity?: RenameEntity;
  children: ReactNode;
}) {
  const [characters, setCharacters] = useState<readonly EntityOption[]>(initial?.characters ?? []);
  const [locations, setLocations] = useState<readonly EntityOption[]>(initial?.locations ?? []);

  /**
   * 存在性的**權威來源**，而且是同步的。
   *
   * 「先建立實體、再寫入 doc」（不變式 ⑧）在這一層有一個時間差：建立走的是 `setState`，
   * 寫 doc 是同一個 tick 裡的同步呼叫 —— 中間隔著一次 render。只從 state 推導目錄的話，
   * command 拿到的是**上一次 render 的那份**，於是剛建好的實體會被自己的不變式擋下
   * （「實體 lo_… 不存在」）。ref 讓「目錄多一筆」與「建立成功」是同一刻的事。
   *
   * state 仍然存在，因為自動補全要重繪；它與 ref 的分工是**畫面 vs 真相**。
   */
  const ids = useRef<{ character: Set<string>; location: Set<string> }>({
    character: new Set(initial?.characters?.map((c) => c.id) ?? []),
    location: new Set(initial?.locations?.map((l) => l.id) ?? []),
  });

  const put = useCallback((kind: EntityKind, entity: EntityOption) => {
    ids.current[kind].add(entity.id);
    const add = (list: readonly EntityOption[]) =>
      list.some((e) => e.id === entity.id)
        ? list.map((e) => (e.id === entity.id ? entity : e))
        : [...list, entity];
    if (kind === "character") setCharacters(add);
    else setLocations(add);
  }, []);

  /** 身分穩定 —— 它讀的是 ref，內容永遠是最新的，不必隨 state 換一個新物件。 */
  const directory = useRef<EntityDirectory>({
    hasCharacter: (id) => ids.current.character.has(id),
    hasLocation: (id) => ids.current.location.has(id),
  }).current;

  const create = useCallback<EntityCatalog["create"]>(
    async (kind, name) => {
      if (projectId && createEntity) {
        const created = await createEntity({ projectId, kind, name });
        if (!created) return null;
        put(kind, created);
        return created;
      }
      const local = { id: kind === "character" ? mintCharacterId() : mintLocationId(), name };
      put(kind, local);
      return local;
    },
    [projectId, createEntity, put],
  );

  const rename = useCallback<EntityCatalog["rename"]>(
    (kind, entityId, name) => {
      // 樂觀更新：改名只影響目錄與自動補全的顯示，寫失敗最壞的結果是下次進站看到舊名字，
      // 不會動到任何一筆引用（引用上的顯示名本來就不跟著實體名走）。
      put(kind, { id: entityId, name });
      if (projectId && renameEntity) void renameEntity({ projectId, kind, entityId, name });
    },
    [projectId, renameEntity, put],
  );

  const value = useMemo<EntityCatalog>(
    () => ({
      characters,
      locations,
      directory,
      create,
      rename,
    }),
    [characters, locations, directory, create, rename],
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}
