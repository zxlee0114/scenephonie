// @vitest-environment jsdom
/**
 * 實體欄位的驗收（票券 08）：多值輸入規則、三列自動補全、注音組字期間不動作、
 * 新建與命中 chip 視覺可辨、第三列的兩步別名流程。
 */
import { fireEvent, render, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EntityField, type EntityOption, type EntityRef } from "./entity-field";

const dolphinApartment = { id: "lo_1", name: "海豚公寓房間" };
const policeStation = { id: "lo_2", name: "派出所" };

function Host({
  initial = [],
  options = [dolphinApartment, policeStation],
  onCreate,
  onRenameEntity,
  retitleOthers,
  multiple = true,
  usage,
}: {
  initial?: EntityRef[];
  options?: EntityOption[];
  onCreate?: (name: string) => Promise<EntityOption | null>;
  onRenameEntity?: (id: string, name: string) => void;
  retitleOthers?: {
    count: (id: string, name: string) => number;
    run: (id: string, from: string, to: string) => boolean;
  };
  multiple?: boolean;
  /**
   * 給要模擬「孤兒不算存在」的測試用；不給就是整份目錄都算存在（見 EntityField）。
   *
   * 收得到**現在還在欄位上的引用** —— 真實環境的 `usage` 走 doc，chip 一拿起來那一場就從
   * 計數裡消失了。要釘住這件事的測試得拿得到那個變化。
   */
  usage?: (refs: readonly EntityRef[]) => ReadonlyMap<string, number>;
}) {
  const [refs, setRefs] = useState<EntityRef[]>(initial);
  const [catalog, setCatalog] = useState<EntityOption[]>(options);
  return (
    <EntityField
      kind="location"
      placeholder="地點"
      refs={refs}
      options={catalog}
      usage={usage && (() => usage(refs))}
      multiple={multiple}
      onCommit={setRefs}
      onCreate={
        onCreate ??
        (async (name) => {
          // 預設的建立能力：**先落地**（目錄多一筆），才回傳給欄位去寫引用。
          const created = { id: `lo_new_${catalog.length}`, name };
          setCatalog((list) => [...list, created]);
          return created;
        })
      }
      onRenameEntity={onRenameEntity}
      retitleOthers={retitleOthers}
    />
  );
}

const chips = (root: HTMLElement) => [...root.querySelectorAll(".entity-chip")];
const chipTexts = (root: HTMLElement) =>
  chips(root).map((c) => c.textContent?.replace(/[×＋📍👤]/gu, "") ?? "");
/** 可以操作的那份選單（預覽與唯讀抬頭都不算 —— 它們按不到）。 */
const rows = (root: HTMLElement) =>
  [
    ...root.querySelectorAll(
      ".entity-field__menu:not(.entity-field__menu--preview) li:not(.entity-field__menu-hint)",
    ),
  ].map((li) => li.textContent ?? "");
/** 選單頂端那一行唯讀抬頭（票券 39 收票）；沒有就是 null。 */
const heldNote = (root: HTMLElement) =>
  root.querySelector(".entity-field__menu-hint")?.textContent ?? null;
/** 組字中浮出來的唯讀預覽。 */
const previewRows = (root: HTMLElement) =>
  [...root.querySelectorAll(".entity-field__menu--preview li")].map((li) => li.textContent ?? "");

afterEach(() => {
  document.body.innerHTML = "";
});

describe("多值欄位：頓號分隔、空白留在名字裡", () => {
  it("打到頓號的那一刻切成 chip，最後一段留在欄位裡", async () => {
    const { container } = render(<Host />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "海豚公寓房間、小" } });

    await waitFor(() => expect(chipTexts(container)).toEqual(["海豚公寓房間"]));
    expect(input.value).toBe("小");
  });

  it("空白不切開名字 —— 它是名字的一部分", async () => {
    const { container } = render(<Host options={[]} />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "海豚 公寓房間、" } });

    await waitFor(() => expect(chipTexts(container)).toEqual(["海豚 公寓房間"]));
  });

  it("貼上一整串走同一份規則", async () => {
    const { container } = render(<Host options={[]} />);
    const input = container.querySelector("input")!;

    // 貼上等於一次把整串塞進欄位 —— 分隔規則只有一份，不另做貼上路徑。
    fireEvent.change(input, { target: { value: "巷口，警局;商圈、" } });

    await waitFor(() => expect(chipTexts(container)).toEqual(["巷口", "警局", "商圈"]));
  });

  it("Backspace 把最後一個 chip 還原成可編輯文字（不是直接刪掉）", async () => {
    const { container } = render(<Host initial={[{ id: dolphinApartment.id, displayName: "未知大樓房間" }]} />);
    const input = container.querySelector("input")!;

    fireEvent.keyDown(input, { key: "Backspace" });

    await waitFor(() => expect(chips(container)).toHaveLength(0));
    expect(input.value).toBe("未知大樓房間");
  });
});

describe("多值規則的適用範圍：只有地點欄與登場人物欄", () => {
  it("單值欄（對白人物欄）不切 chip —— 標點在那裡是名字裡的普通字元", async () => {
    const created: string[] = [];
    const { container } = render(
      <Host
        multiple={false}
        options={[]}
        onCreate={async (name) => {
          created.push(name);
          return { id: `ch_${created.length}`, name };
        }}
      />,
    );
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "小明、小華" } });

    // 在這裡切開會建出兩筆實體卻只留最後一筆 —— 憑空多一個孤兒。
    expect(created).toEqual([]);
    expect(chips(container)).toHaveLength(0);
    expect(input.value).toBe("小明、小華");
  });
});

describe("孤兒不出現在自動補全（ADR-0005）", () => {
  // 目錄是 append-only 的，⌘Z 之後那一筆還在目錄裡 —— 但沒有任何引用指向它，所以它不存在。
  const usage = () => new Map([[policeStation.id, 3]]);

  const orphanHost = () =>
    render(
      <EntityField
        kind="location"
        placeholder="地點"
        refs={[]}
        options={[dolphinApartment, policeStation]}
        usage={usage}
        multiple
        onCommit={() => {}}
        onCreate={async (name) => ({ id: "lo_new", name })}
        onRenameEntity={() => {}}
      />,
    );

  it("沒有任何引用指向的實體不出現在建議列", () => {
    const { container } = orphanHost();
    fireEvent.change(container.querySelector("input")!, { target: { value: "海豚" } });

    expect(rows(container)).toEqual([
      "＋ 建立新實體「海豚」",
      "🔗 作為既有實體的另一個名字…",
    ]);
  });

  it("打出孤兒的全名 → 仍然是「建立新實體」，不是命中", () => {
    const { container } = orphanHost();
    fireEvent.change(container.querySelector("input")!, { target: { value: "海豚公寓房間" } });

    expect(rows(container)[0]).toBe("＋ 建立新實體「海豚公寓房間」");
  });

  it("第三列的清單也只列存在的實體", () => {
    const { container } = orphanHost();
    fireEvent.change(container.querySelector("input")!, { target: { value: "未知大樓房間" } });
    fireEvent.mouseDown(
      [...container.querySelectorAll(".entity-field__menu li")].find((li) =>
        li.textContent?.includes("另一個名字"),
      )!,
    );

    expect(rows(container)).toEqual(["📍 派出所"]);
  });
});

describe("注音組字期間，選單與分隔符完全不動作（§7.6）", () => {
  it("組字中打出頓號不切 chip、不開選單", () => {
    const { container } = render(<Host />);
    const input = container.querySelector("input")!;

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "海豚公寓房間、" } });

    expect(chips(container)).toHaveLength(0);
    expect(rows(container)).toEqual([]);
  });

  it("組字結束才輪到我們：這一刻起選單與分隔符開始作用", async () => {
    const { container } = render(<Host />);
    const input = container.querySelector("input")!;

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "海豚公寓房間、" } });
    fireEvent.compositionEnd(input, { target: { value: "海豚公寓房間、" } });

    await waitFor(() => expect(chipTexts(container)).toEqual(["海豚公寓房間"]));
  });

  it("確認輸入的那一刻選單就出現 —— 不必再多打一個字", () => {
    const { container } = render(<Host />);
    const input = container.querySelector("input")!;

    // 注音：組字中 → 按 Enter 送出。**送出前後的字串一模一樣**（沒有多打任何東西），
    // 這正是原本漏掉一次重繪的情境：`text` 沒變，React bail out，選單要等下一個按鍵。
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "海豚" } });
    fireEvent.compositionEnd(input, { target: { value: "海豚" } });

    expect(rows(container)).toEqual([
      "📍 海豚公寓房間",
      "＋ 建立新實體「海豚」",
      "🔗 作為既有實體的另一個名字…",
    ]);
  });
});

describe("組字中的預覽：看得見，但按不到（使用者裁決 2026-09-10）", () => {
  it("邊組字邊給命中 —— 不必等送出就知道本子裡已經有這個地點", () => {
    const { container } = render(<Host />);
    const input = container.querySelector("input")!;

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "海豚" } });

    expect(previewRows(container)).toEqual(["📍 海豚公寓房間"]);
    // 但**可以操作的那份**仍然是空的：這一刻每一顆鍵都屬於 IME。
    expect(rows(container)).toEqual([]);
  });

  it("預覽不接手鍵盤：組字中的 Enter 仍然是 IME 的送出鍵，不會選走任何一列", () => {
    const { container } = render(<Host />);
    const input = container.querySelector("input")!;

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "海豚" } });
    // React 的 isComposing 由 nativeEvent 帶 —— 這裡明講，因為它就是這條測試的主詞。
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });

    expect(chips(container)).toHaveLength(0);
  });

  it("預覽不進無障礙樹 —— 輸入框這一刻沒有展開任何選單，那是實話", () => {
    const { container } = render(<Host />);
    const input = container.querySelector("input")!;

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "海豚" } });

    expect(container.querySelector(".entity-field__menu--preview")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it("組字結束就換成真的選單（多一列「建立新實體」與別名入口）", () => {
    const { container } = render(<Host />);
    const input = container.querySelector("input")!;

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "海豚" } });
    fireEvent.compositionEnd(input, { target: { value: "海豚" } });

    expect(previewRows(container)).toEqual([]);
    expect(rows(container)).toHaveLength(3);
  });
});

describe("chip 住在輸入框裡", () => {
  it("點 chip 把它還原成可編輯的文字，游標接在後面", async () => {
    const { container } = render(<Host initial={[{ id: "lo_1", displayName: "海豚公寓房間" }]} />);
    const input = container.querySelector("input")!;

    fireEvent.mouseDown(chips(container)[0]!);

    await waitFor(() => expect(chips(container)).toHaveLength(0));
    expect(input.value).toBe("海豚公寓房間");
    expect(document.activeElement).toBe(input);
  });

  it("× 是刪除，不是編輯 —— 字不會回到輸入框", async () => {
    const { container } = render(<Host initial={[{ id: "lo_1", displayName: "海豚公寓房間" }]} />);
    const input = container.querySelector("input")!;

    fireEvent.mouseDown(container.querySelector(".entity-chip__remove")!);

    await waitFor(() => expect(chips(container)).toHaveLength(0));
    expect(input.value).toBe("");
  });

  it("新的輸入接在前一個 chip 後面（同一個輸入框）", async () => {
    const { container } = render(<Host initial={[{ id: "lo_1", displayName: "海豚公寓房間" }]} />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "派出所、" } });

    await waitFor(() => expect(chipTexts(container)).toEqual(["海豚公寓房間", "派出所"]));
  });
});

describe("自動補全三列", () => {
  it("命中既有／建立新實體／作為既有實體的另一個名字", () => {
    const { container } = render(<Host />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "海豚" } });

    expect(rows(container)).toEqual([
      "📍 海豚公寓房間",
      "＋ 建立新實體「海豚」",
      "🔗 作為既有實體的另一個名字…",
    ]);
  });

  it("打字當下不問任何問題 —— 沒有任何一列在懷疑兩個名字是同一筆", () => {
    const { container } = render(<Host />);
    fireEvent.change(container.querySelector("input")!, { target: { value: "未知大樓房間" } });

    // 相似名不會被積極合併：命中列一列都沒有，只剩「建立新的」與那個入口。
    expect(rows(container)).toEqual([
      "＋ 建立新實體「未知大樓房間」",
      "🔗 作為既有實體的另一個名字…",
    ]);
  });

  it("命中列印出「（N 場）」，而且只有選單真的要畫時才去數（§7.7）", () => {
    const count = vi.fn(() => new Map([[dolphinApartment.id, 12]]));
    const { container } = render(
      <EntityField
        kind="location"
        placeholder="地點"
        refs={[]}
        options={[dolphinApartment]}
        usage={count}
        multiple
        onCommit={() => {}}
        onCreate={async () => null}
      />,
    );

    // 還沒打字 → 沒有選單 → 一遍 doc 都不必走。
    expect(count).not.toHaveBeenCalled();

    fireEvent.change(container.querySelector("input")!, { target: { value: "海豚" } });
    expect(rows(container)[0]).toBe("📍 海豚公寓房間（12 場）");
  });

  it("選命中列 → 引用指向那筆實體，顯示名就是實體名", async () => {
    const { container } = render(<Host />);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "海豚" } });

    fireEvent.keyDown(input, { key: "Enter" }); // active 預設是第一列（命中）

    await waitFor(() => expect(chipTexts(container)).toEqual(["海豚公寓房間"]));
    expect(container.querySelector(".entity-chip--hit")).not.toBeNull();
  });

  it("先建立實體、再寫入引用 —— onCreate 完成之前不會 commit", async () => {
    const order: string[] = [];
    let release: (() => void) | null = null;
    const onCreate = async (name: string) => {
      order.push("create:start");
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      order.push("create:done");
      return { id: "lo_new", name };
    };

    const commits: EntityRef[][] = [];
    function Slow() {
      const [refs, setRefs] = useState<EntityRef[]>([]);
      return (
        <EntityField
          kind="location"
          placeholder="地點"
          refs={refs}
          options={[]}
          multiple
          onCommit={(next) => {
            order.push("commit");
            commits.push(next);
            setRefs(next);
          }}
          onCreate={onCreate}
        />
      );
    }

    const { container } = render(<Slow />);
    fireEvent.change(container.querySelector("input")!, { target: { value: "海豚公寓房間、" } });

    await waitFor(() => expect(order).toEqual(["create:start"]));
    release!();

    await waitFor(() => expect(order).toEqual(["create:start", "create:done", "commit"]));
    expect(commits.at(-1)).toEqual([{ id: "lo_new", displayName: "海豚公寓房間" }]);
  });
});

describe("新建 chip 與命中 chip 視覺可辨", () => {
  it("這一輪新建的掛 --new，命中既有的掛 --hit", async () => {
    const { container } = render(<Host />);
    const input = container.querySelector("input")!;

    fireEvent.change(input, { target: { value: "海豚公寓房間、未知大樓房間、" } });

    await waitFor(() => expect(chips(container)).toHaveLength(2));
    expect(chips(container)[0]!.className).toContain("entity-chip--hit");
    expect(chips(container)[1]!.className).toContain("entity-chip--new");
  });

  it("懸空引用（實體已不在目錄裡）照印顯示名，不跳警告", () => {
    const { container } = render(
      <Host initial={[{ id: "lo_已被⌘Z掉", displayName: "海豚公寓房間" }]} options={[]} />,
    );

    expect(chipTexts(container)).toEqual(["海豚公寓房間"]);
    expect(container.querySelector(".entity-chip--dangling")).not.toBeNull();
  });
});

describe("第三列：作為既有實體的另一個名字（兩步）", () => {
  const openAlias = (container: HTMLElement) => {
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "未知大樓房間" } });
    const alias = [...container.querySelectorAll(".entity-field__menu li")].find((li) =>
      li.textContent?.includes("另一個名字"),
    )!;
    fireEvent.mouseDown(alias);
    return input;
  };

  it("第二步是選一筆既有實體，第三步吸收改名（只當這一場 ／ 同時把實體改名）", () => {
    const { container } = render(<Host onRenameEntity={() => {}} />);
    openAlias(container);

    expect(rows(container)).toEqual(["📍 海豚公寓房間", "📍 派出所"]);

    fireEvent.mouseDown(container.querySelectorAll(".entity-field__menu li")[0]!);
    expect(rows(container)).toEqual([
      "只當這一場的名字（海豚公寓房間）",
      "同時把實體改名為「未知大樓房間」",
    ]);
  });

  it("「只當這一場的名字」→ 引用指向既有實體，但顯示名是編劇這一場寫的字", async () => {
    const { container } = render(<Host onRenameEntity={() => {}} />);
    openAlias(container);
    fireEvent.mouseDown(container.querySelectorAll(".entity-field__menu li")[0]!);
    fireEvent.mouseDown(container.querySelectorAll(".entity-field__menu li")[0]!);

    await waitFor(() => expect(chipTexts(container)).toEqual(["未知大樓房間"]));
    // 命中既有實體 —— 這一筆會在場次表按 `海豚公寓房間（未知大樓房間）` 聚合。
    expect(container.querySelector(".entity-chip--hit")).not.toBeNull();
  });

  it("「同時把實體改名」→ 改的是實體，不代換任何既有引用的顯示名", async () => {
    const rename = vi.fn();
    const { container } = render(<Host onRenameEntity={rename} />);
    openAlias(container);
    fireEvent.mouseDown(container.querySelectorAll(".entity-field__menu li")[0]!);
    fireEvent.mouseDown(container.querySelectorAll(".entity-field__menu li")[1]!);

    expect(rename).toHaveBeenCalledWith(dolphinApartment.id, "未知大樓房間");
    await waitFor(() => expect(chipTexts(container)).toEqual(["未知大樓房間"]));
  });

  it("沒有改名能力時就不出現那一列（不給做不到的選項）", () => {
    const { container } = render(<Host />);
    openAlias(container);
    fireEvent.mouseDown(container.querySelectorAll(".entity-field__menu li")[0]!);

    expect(rows(container)).toEqual(["只當這一場的名字（海豚公寓房間）"]);
  });
});


describe("把 chip 拿回來重新編輯", () => {
  it("Backspace 拿下來的那一筆整串反白 —— 再按一次就一起刪掉", () => {
    const { container } = render(
      <Host initial={[{ id: policeStation.id, displayName: "派出所" }]} />,
    );
    const input = container.querySelector("input")!;

    fireEvent.keyDown(input, { key: "Backspace" });

    expect(input.value).toBe("派出所");
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, "派出所".length]);
    expect(chips(container)).toHaveLength(0);
  });

  it("滑鼠點 chip 進來不反白 —— 那是要改字，游標留在字尾", () => {
    const { container } = render(
      <Host initial={[{ id: policeStation.id, displayName: "派出所" }]} />,
    );

    fireEvent.mouseDown(container.querySelector(".entity-chip")!);

    const input = container.querySelector("input")!;
    expect(input.value).toBe("派出所");
    expect(input.selectionStart).toBe(input.selectionEnd);
  });

  it("原封放回不會憑空多建一筆實體（使用者回報：多一筆 POST）", async () => {
    // 拿下來的那一刻它就沒有引用了 —— 而孤兒不算存在（ADR-0005）。`usage` 回空 Map 就是
    // 那個狀態：沒有這條路的話，`resolve` 會把原樣放回的名字當成新東西再建一筆。
    const onCreate = vi.fn(async (name: string) => ({ id: `lo_new_${name}`, name }));
    const { container } = render(
      <Host
        initial={[{ id: policeStation.id, displayName: "派出所" }]}
        usage={() => new Map()}
        onCreate={onCreate}
      />,
    );
    const input = container.querySelector("input")!;

    fireEvent.keyDown(input, { key: "Backspace" }); // 拿下來
    fireEvent.blur(input); // 什麼都不動就走

    await waitFor(() => expect(chipTexts(container)).toEqual(["派出所"]));
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("改了名字才是新東西 —— 那時才建", async () => {
    const onCreate = vi.fn(async (name: string) => ({ id: `lo_new_${name}`, name }));
    const { container } = render(
      <Host
        initial={[{ id: policeStation.id, displayName: "派出所" }]}
        usage={() => new Map()}
        onCreate={onCreate}
      />,
    );
    const input = container.querySelector("input")!;

    fireEvent.keyDown(input, { key: "Backspace" });
    fireEvent.change(input, { target: { value: "派出所後門" } });
    fireEvent.blur(input);

    // 第二個參數是**這一筆從哪一條路生出來的**（票券 35）—— 打字新建就是 "typed"。
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith("派出所後門", "typed"));
  });
});

describe("編輯中的那一筆不是孤兒（票券 38）", () => {
  // 拿下來的那一刻它的引用就從 doc 上消失了 —— 只被引用一次的話 usage 掉到 0。
  // 那不是孤兒，是**暫時被拿在手上**：ADR-0005 要擋的是 ⌘Z 留下的殘骸，不是進行到一半的編輯。
  const lonely = () =>
    render(
      <Host
        initial={[{ id: policeStation.id, displayName: "派出所" }]}
        usage={() => new Map()}
      />,
    );

  it("拿回來改 → 沒有「建立新實體」那一列，第一列印著它自己", () => {
    const { container } = lonely();
    fireEvent.keyDown(container.querySelector("input")!, { key: "Backspace" });

    expect(rows(container)[0]).toBe("📍 派出所");
    expect(rows(container).some((r) => r.includes("建立新實體"))).toBe(false);
  });

  it("一個字都不改直接定案 → 還是同一筆實體，不多建", async () => {
    const onCreate = vi.fn(async (name: string) => ({ id: `lo_new_${name}`, name }));
    const { container } = render(
      <Host
        initial={[{ id: policeStation.id, displayName: "派出所" }]}
        usage={() => new Map()}
        onCreate={onCreate}
      />,
    );
    const input = container.querySelector("input")!;

    fireEvent.keyDown(input, { key: "Backspace" });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(chipTexts(container)).toEqual(["派出所"]));
    expect(onCreate).not.toHaveBeenCalled();
    // 同名的新實體 chip 文字會長得一模一樣 —— 看的是它仍然是**命中**那一種。
    expect(chips(container)[0]!.className).toContain("--hit");
  });

  it("改成沒人用過的名字 → 「建立新實體」回來了（那才真的是新的一位）", () => {
    const { container } = lonely();
    const input = container.querySelector("input")!;

    fireEvent.keyDown(input, { key: "Backspace" });
    fireEvent.change(input, { target: { value: "派出所後門" } });

    expect(rows(container)[0]).toBe("＋ 建立新實體「派出所後門」");
  });

  it("改成另一位既有存在實體的名字 → 命中那一列在、建立新的不在", () => {
    const { container } = render(
      <Host
        initial={[{ id: policeStation.id, displayName: "派出所" }]}
        usage={() => new Map([[dolphinApartment.id, 2]])}
      />,
    );
    const input = container.querySelector("input")!;

    fireEvent.keyDown(input, { key: "Backspace" });
    fireEvent.change(input, { target: { value: "海豚公寓房間" } });

    expect(rows(container)[0]).toBe("📍 海豚公寓房間（2 場）");
    expect(rows(container).some((r) => r.includes("建立新實體"))).toBe(false);
  });

  it("被引用兩次以上的那一筆行為不變 —— 它本來就沒離開 existing()", () => {
    const { container } = render(
      <Host
        initial={[{ id: policeStation.id, displayName: "派出所" }]}
        usage={() => new Map([[policeStation.id, 1]])}
      />,
    );
    const input = container.querySelector("input")!;

    fireEvent.keyDown(input, { key: "Backspace" });

    expect(rows(container)[0]).toBe("📍 派出所（1 場）");
    expect(rows(container).some((r) => r.includes("建立新實體"))).toBe(false);
  });

  it("孤兒仍然不進自動補全 —— 手上沒握著它就還是不存在", () => {
    const { container } = render(
      <Host initial={[]} usage={() => new Map([[dolphinApartment.id, 2]])} />,
    );

    fireEvent.change(container.querySelector("input")!, { target: { value: "派出所" } });

    expect(rows(container)[0]).toBe("＋ 建立新實體「派出所」");
  });
});

describe("編輯中的那一筆：別名與人物欄（票券 38 code review）", () => {
  it("拿回來原封放回 → 顯示名仍是這一場的別名，不會被目錄名蓋掉", async () => {
    // 別名住在引用上（ADR-0005）。第一列印的是**實體**（📍 海豚公寓房間），按下去指的
    // 也是它 —— 但這一場叫什麼，是編劇寫在這一場的字，不該被那一列順手改掉。
    const commits: EntityRef[][] = [];
    const { container } = render(
      <EntityField
        kind="location"
        placeholder="地點"
        refs={[{ id: dolphinApartment.id, displayName: "未知大樓房間" }]}
        options={[dolphinApartment]}
        usage={() => new Map()}
        multiple
        onCommit={(next) => commits.push(next)}
        onCreate={async () => null}
      />,
    );
    const input = container.querySelector("input")!;

    fireEvent.keyDown(input, { key: "Backspace" });
    // 主體是實體名，括號裡是這一場的叫法（票券 38 驗收回饋那一節）。
    expect(rows(container)[0]).toBe("📍 海豚公寓房間（這場顯示為 未知大樓房間）");

    fireEvent.keyDown(input, { key: "Enter" }); // 第一列就是預設那一列
    await waitFor(() => expect(commits.at(-1)).toHaveLength(1));
    expect(commits.at(-1)![0]).toEqual({
      id: dolphinApartment.id,
      displayName: "未知大樓房間",
    });
  });

  it("人物欄走同一段程式碼 —— 拿回來改一樣不冒那一列", () => {
    const { container } = render(
      <EntityField
        kind="character"
        placeholder="人物"
        refs={[{ id: "ch_1", displayName: "服務生小李" }]}
        options={[{ id: "ch_1", name: "服務生小李" }]}
        usage={() => new Map()}
        onCommit={() => {}}
        onCreate={async () => null}
      />,
    );

    fireEvent.keyDown(container.querySelector("input")!, { key: "Backspace" });

    expect(rows(container)[0]).toBe("👤 服務生小李");
    expect(rows(container).some((r) => r.includes("建立新實體"))).toBe(false);
  });
});

describe("別名 ＋ 實體改名之後，命中列不重覆（票券 38 人工驗收）", () => {
  it("舊顯示名是實體新名的前綴時，第一列只印一次", () => {
    // 編劇跑出來的路：A 場地點 `test` 建了實體 → B 場打 `test1` 走別名那一列，
    // 並且「同時把實體改名」→ 目錄裡那筆現在叫 `test1`，A 場的引用顯示名還是 `test`。
    // 回 A 場把 chip 拿回來改時，同一筆實體會從兩條路各進榜一次：
    // `exact`（手上那一筆，票券 38）與 `hits`（名字**包含** `test` 且不等於 `test`）。
    const { container } = render(
      <EntityField
        kind="location"
        placeholder="地點"
        refs={[{ id: "lo_1", displayName: "test" }]}
        options={[{ id: "lo_1", name: "test1" }]}
        usage={() => new Map([["lo_1", 1]])}
        multiple
        onCommit={() => {}}
        onCreate={async () => null}
      />,
    );

    fireEvent.keyDown(container.querySelector("input")!, { key: "Backspace" });

    expect(rows(container).filter((r) => r.startsWith("📍 test1"))).toHaveLength(1);
  });
});

describe("命中列標出這一場的叫法（票券 38 驗收回饋）", () => {
  const heldAlias = (options: EntityOption[], displayName: string) => {
    const { container } = render(
      <EntityField
        kind="location"
        placeholder="地點"
        refs={[{ id: "lo_1", displayName }]}
        options={options}
        usage={() => new Map([["lo_1", 1]])}
        multiple
        onCommit={() => {}}
        onCreate={async () => null}
      />,
    );
    fireEvent.keyDown(container.querySelector("input")!, { key: "Backspace" });
    return rows(container);
  };

  it("顯示名不等於實體名時，括號裡補一句這一場叫什麼", () => {
    // 沿用場次表那條慣例：印 `實體名（這一場的顯示名）`，只在兩者不同時才印括號
    // （CONTEXT.md 的地點詞條）。選單與場次表回答同一個問題，形狀就該是同一個。
    expect(heldAlias([{ id: "lo_1", name: "test1" }], "test")[0]).toBe(
      "📍 test1（這場顯示為 test，1 場）",
    );
  });

  it("兩者相同時一個字都不多印", () => {
    expect(heldAlias([{ id: "lo_1", name: "test" }], "test")[0]).toBe("📍 test（1 場）");
  });
});


describe("✏️ 把實體改名（票券 39）", () => {
  /** 派出所被三場引用，其中這一場就是這個欄位 —— chip 拿起來的那一刻 doc 只剩另外兩場。 */
  const scenesInDoc = (refs: readonly EntityRef[]) =>
    new Map([[policeStation.id, 2 + refs.filter((r) => r.id === policeStation.id).length]]);
  const held = () =>
    render(
      <Host
        initial={[{ id: policeStation.id, displayName: "派出所" }]}
        usage={scenesInDoc}
        onRenameEntity={() => {}}
      />,
    );

  /** 把 chip 拿回來、改成另一個字。 */
  const retype = (container: HTMLElement, value: string) => {
    fireEvent.mouseDown(container.querySelector(".entity-chip")!);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value } });
    return input;
  };

  it("把 chip 拿回來改字 → 多一列改名，場數寫在按下去之前", () => {
    const { container } = held();
    retype(container, "派出所後門");

    // **排在建立新實體後面**：第一列是 Enter 會做的事，而改名 ⌘Z 回不來，不該順手發生。
    expect(rows(container)).toEqual([
      "＋ 建立新實體「派出所後門」",
      "✏️ 把實體改名為「派出所後門」",
      "🔗 作為既有實體的另一個名字…",
    ]);
  });

  it("拿回來的是別名、字沒動時也能改名 —— 那個字本來就不是實體名", () => {
    const { container } = render(
      <Host
        initial={[{ id: policeStation.id, displayName: "分局" }]}
        usage={scenesInDoc}
        onRenameEntity={() => {}}
      />,
    );
    fireEvent.mouseDown(container.querySelector(".entity-chip")!);

    expect(rows(container)).toEqual([
      "📍 派出所（這場顯示為 分局，3 場）",
      "✏️ 把實體改名為「分局」",
      "🔗 作為既有實體的另一個名字…",
    ]);
  });

  it("框裡的字等於實體名（沒改）時那一列不出現 —— 沒有東西要改", () => {
    const { container } = held();
    retype(container, "派出所");

    expect(rows(container)).toEqual(["📍 派出所（3 場）", "🔗 作為既有實體的另一個名字…"]);
  });

  it("沒有改名能力時就不出現那一列（不給做不到的選項）", () => {
    const { container } = render(
      <Host
        initial={[{ id: policeStation.id, displayName: "派出所" }]}
        usage={() => new Map([[policeStation.id, 2]])}
      />,
    );
    retype(container, "派出所後門");

    expect(rows(container).some((r) => r.includes("把實體改名"))).toBe(false);
  });

  it("打的字是另一筆存在實體的名字時不出現 —— 那會讓目錄有兩筆同名（合併是另一件事）", () => {
    const { container } = render(
      <Host
        initial={[{ id: policeStation.id, displayName: "派出所" }]}
        onRenameEntity={() => {}}
      />,
    );
    retype(container, "海豚公寓房間");

    expect(rows(container).some((r) => r.includes("把實體改名"))).toBe(false);
  });

  it("孤兒不出現改名列 —— 沒拿在手上的目錄殘骸不算命中", () => {
    const { container } = render(
      <Host usage={() => new Map()} onRenameEntity={() => {}} />,
    );
    fireEvent.change(container.querySelector("input")!, { target: { value: "派出所後門" } });

    expect(rows(container).some((r) => r.includes("把實體改名"))).toBe(false);
  });

  it("沒有別場印著舊名 → 一步就改完：目錄改名，這一場也顯示新名", async () => {
    const rename = vi.fn();
    const { container } = render(
      <Host
        initial={[{ id: policeStation.id, displayName: "派出所" }]}
        usage={() => new Map()}
        onRenameEntity={rename}
        retitleOthers={{ count: () => 0, run: vi.fn(() => true) }}
      />,
    );
    retype(container, "派出所後門");
    fireEvent.mouseDown(
      [...container.querySelectorAll(".entity-field__menu li")].find((li) =>
        li.textContent?.includes("把實體改名"),
      )!,
    );

    expect(rename).toHaveBeenCalledWith(policeStation.id, "派出所後門");
    await waitFor(() => expect(chipTexts(container)).toEqual(["派出所後門"]));
  });

  describe("別場還印著舊名 → 按下去先問「要不要一起改」", () => {
    const openRename = (retitle: {
      count: () => number;
      run: (id: string, from: string, to: string) => boolean;
    }) => {
      const rename = vi.fn();
      const view = render(
        <Host
          initial={[{ id: policeStation.id, displayName: "派出所" }]}
          usage={() => new Map([[policeStation.id, 2]])}
          onRenameEntity={rename}
          retitleOthers={retitle}
        />,
      );
      retype(view.container, "派出所後門");
      fireEvent.mouseDown(
        [...view.container.querySelectorAll(".entity-field__menu li")].find((li) =>
          li.textContent?.includes("把實體改名"),
        )!,
      );
      return { ...view, rename };
    };

    it("第二步攤出兩條路，數字都寫在按下去之前", () => {
      const { container } = openRename({ count: () => 2, run: () => true });

      expect(rows(container)).toEqual([
        "只改這一筆的叫法 —— 那 2 場繼續印「派出所」",
        "連那 2 場一起改成「派出所後門」",
      ]);
    });

    it("第一步就把代價說出來 —— 數的是「還印著舊名的場次」，不是「這筆實體用在幾場」", () => {
      const { container } = render(
        <Host
          initial={[{ id: policeStation.id, displayName: "派出所" }]}
          usage={() => new Map([[policeStation.id, 2]])}
          onRenameEntity={() => {}}
          retitleOthers={{ count: () => 1, run: () => true }}
        />,
      );
      retype(container, "派出所後門");

      expect(rows(container)).toContain("✏️ 把實體改名為「派出所後門」（還有 1 場印著「派出所」）");
    });

    it("「只改這一場」→ 別場一個字都不動", async () => {
      const run = vi.fn(() => true);
      const { container, rename } = openRename({ count: () => 2, run });
      fireEvent.mouseDown(container.querySelectorAll(".entity-field__menu li")[0]!);

      expect(rename).toHaveBeenCalledWith(policeStation.id, "派出所後門");
      expect(run).not.toHaveBeenCalled();
      await waitFor(() => expect(chipTexts(container)).toEqual(["派出所後門"]));
    });

    it("「連那幾場一起改」→ 舊名換成新名，真正取過別名的那些不在這個範圍裡", async () => {
      const run = vi.fn(() => true);
      const { container, rename } = openRename({ count: () => 2, run });
      fireEvent.mouseDown(container.querySelectorAll(".entity-field__menu li")[1]!);

      expect(rename).toHaveBeenCalledWith(policeStation.id, "派出所後門");
      expect(run).toHaveBeenCalledWith(policeStation.id, "派出所", "派出所後門");
      await waitFor(() => expect(chipTexts(container)).toEqual(["派出所後門"]));
    });

    it("寫不進 doc 時整個改名都不做 —— 不留下「目錄改了、稿沒改」的半套", async () => {
      const { container, rename } = openRename({ count: () => 2, run: () => false });
      fireEvent.mouseDown(container.querySelectorAll(".entity-field__menu li")[1]!);

      expect(rename).not.toHaveBeenCalled();
      // 字也留在框裡 —— 他還站在那個決定上。
      expect(container.querySelector("input")!.value).toBe("派出所後門");
      await waitFor(() => expect(chipTexts(container)).toEqual([]));
    });

    it("Esc 退回第一步，打的字留著", () => {
      const { container } = openRename({ count: () => 2, run: () => true });
      fireEvent.keyDown(container.querySelector("input")!, { key: "Escape" });

      expect(container.querySelector("input")!.value).toBe("派出所後門");
      expect(rows(container).some((r) => r.includes("把實體改名為"))).toBe(true);
    });
  });
});

describe("手上握著一筆實體時的回饋（票券 39 收票）", () => {
  /** 派出所被三場引用，其中這一場就是這個欄位 —— 拿起來那一刻 doc 只剩另外兩場。 */
  const held = () =>
    render(
      <Host
        initial={[{ id: policeStation.id, displayName: "派出所" }]}
        usage={(refs) =>
          new Map([[policeStation.id, 2 + refs.filter((r) => r.id === policeStation.id).length]])
        }
        onRenameEntity={() => {}}
      />,
    );

  it("命中列的場次數含編劇正站著的這一場 —— 拿起來不該讓一筆實體看起來變小", () => {
    const { container } = held();
    fireEvent.mouseDown(container.querySelector(".entity-chip")!);

    // doc 裡剩下兩場，加上被拿在手上的這一場 → 3。
    expect(rows(container)[0]).toBe("📍 派出所（3 場）");
  });

  it("字沒改時有一行唯讀抬頭說得出改名這條路 —— 沒有它，那條路完全不可見", () => {
    const { container } = held();
    fireEvent.mouseDown(container.querySelector(".entity-chip")!);

    expect(heldNote(container)).toBe("✏️ 正在編輯「派出所」，修改文字可更新名稱");
    // 它不是選項：選不到、Enter 碰不到。
    expect(rows(container)).toEqual(["📍 派出所（3 場）", "🔗 作為既有實體的另一個名字…"]);
  });

  it("字改過之後抬頭還在 —— 框裡的字已經不是它的名字了，「我在編輯誰」得有人說", () => {
    const { container } = held();
    fireEvent.mouseDown(container.querySelector(".entity-chip")!);
    fireEvent.change(container.querySelector("input")!, { target: { value: "派出所後門" } });

    expect(heldNote(container)).toBe("✏️ 正在編輯「派出所」，修改文字可更新名稱");
    expect(rows(container)).toContain("✏️ 把實體改名為「派出所後門」");
  });

  it("字清空了還握著 —— 編劇可能正要重新命名它，抬頭改說下一顆 Backspace 會做什麼", () => {
    const { container } = held();
    fireEvent.mouseDown(container.querySelector(".entity-chip")!);
    fireEvent.change(container.querySelector("input")!, { target: { value: "" } });

    expect(heldNote(container)).toBe("✏️ 正在編輯「派出所」，再按一次 Backspace 移除這一場的引用");
  });

  it("清空之後重打的字，改的是那一筆的名字（清空不等於放手）", () => {
    const { container } = held();
    fireEvent.mouseDown(container.querySelector(".entity-chip")!);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.change(input, { target: { value: "派出所後門" } });

    expect(rows(container)).toContain("✏️ 把實體改名為「派出所後門」");
  });

  it("Backspace 三段：拿起來、清空、放手 —— 第三下才輪到前一個 chip", () => {
    const { container } = render(
      <Host
        initial={[
          { id: dolphinApartment.id, displayName: "海豚公寓房間" },
          { id: policeStation.id, displayName: "派出所" },
        ]}
        onRenameEntity={() => {}}
      />,
    );
    const input = container.querySelector("input")!;

    // ① 拿起來（字整串反白）。
    fireEvent.keyDown(input, { key: "Backspace" });
    expect(chipTexts(container)).toEqual(["海豚公寓房間"]);
    expect(input.value).toBe("派出所");

    // ② 清空 —— 還握著，所以還改得了名。
    fireEvent.change(input, { target: { value: "" } });
    expect(heldNote(container)).not.toBeNull();

    // ③ 這一下才放手：引用沒了，游標停在前一個 chip 後面（`海豚公寓房間 |`）。
    fireEvent.keyDown(input, { key: "Backspace" });
    expect(heldNote(container)).toBeNull();
    expect(chipTexts(container)).toEqual(["海豚公寓房間"]);
    expect(input.value).toBe("");

    // ④ 再一下才輪到前一個。
    fireEvent.keyDown(input, { key: "Backspace" });
    expect(chipTexts(container)).toEqual([]);
    expect(input.value).toBe("海豚公寓房間");
  });

  it("空著離開欄位就是放手 —— 抬頭不會跟著欄位掛在畫面上", () => {
    const { container } = held();
    fireEvent.mouseDown(container.querySelector(".entity-chip")!);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    expect(heldNote(container)).toBeNull();
  });

  it("Esc 之後抬頭跟著收 —— 「現在別煩我」是整份選單的事", () => {
    const { container } = held();
    fireEvent.mouseDown(container.querySelector(".entity-chip")!);
    fireEvent.keyDown(container.querySelector("input")!, { key: "Escape" });

    expect(heldNote(container)).toBeNull();
  });

  it("手上沒握著東西就沒有抬頭（空欄位打字不是在編輯任何一筆）", () => {
    const { container } = render(<Host onRenameEntity={() => {}} />);
    fireEvent.change(container.querySelector("input")!, { target: { value: "派出" } });

    expect(heldNote(container)).toBeNull();
  });
});

describe("拿起來改的那一筆放回原位（票券 39 收票）", () => {
  const three = () =>
    render(
      <Host
        initial={[
          { id: "ch_a", displayName: "阿盈" },
          { id: "ch_b", displayName: "建鳴" },
          { id: "ch_c", displayName: "小明" },
        ]}
        options={[
          { id: "ch_a", name: "阿盈" },
          { id: "ch_b", name: "建鳴" },
          { id: "ch_c", name: "小明" },
        ]}
        onRenameEntity={() => {}}
      />,
    );

  it("點中間那一筆、原封放回 —— 次序不動", async () => {
    const { container } = three();
    fireEvent.mouseDown(chips(container)[1]!);
    fireEvent.keyDown(container.querySelector("input")!, { key: "Enter" });

    await waitFor(() => expect(chipTexts(container)).toEqual(["阿盈", "建鳴", "小明"]));
  });

  it("改成另一筆既有實體，也是回到原來那一格 —— 次序是編劇排的，改字不該把誰擠到隊尾", async () => {
    const { container } = three();
    fireEvent.mouseDown(chips(container)[0]!);
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "新的人" } });
    fireEvent.keyDown(input, { key: "Enter" }); // ＋ 建立新實體

    await waitFor(() => expect(chipTexts(container)).toEqual(["新的人", "建鳴", "小明"]));
  });

  it("一口氣切出好幾筆就整串插在那個位置，順序跟打的一樣", async () => {
    const { container } = three();
    fireEvent.mouseDown(chips(container)[1]!);
    fireEvent.change(container.querySelector("input")!, { target: { value: "小華、阿姨、" } });

    await waitFor(() =>
      expect(chipTexts(container)).toEqual(["阿盈", "小華", "阿姨", "小明"]),
    );
  });

  it("新打的一筆照樣排在隊尾（沒有拿起任何人）", async () => {
    const { container } = three();
    fireEvent.change(container.querySelector("input")!, { target: { value: "小華、" } });

    await waitFor(() => expect(chipTexts(container)).toEqual(["阿盈", "建鳴", "小明", "小華"]));
  });
});
