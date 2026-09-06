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
  multiple = true,
}: {
  initial?: EntityRef[];
  options?: EntityOption[];
  onCreate?: (name: string) => Promise<EntityOption | null>;
  onRenameEntity?: (id: string, name: string) => void;
  multiple?: boolean;
}) {
  const [refs, setRefs] = useState<EntityRef[]>(initial);
  const [catalog, setCatalog] = useState<EntityOption[]>(options);
  return (
    <EntityField
      kind="location"
      placeholder="地點"
      refs={refs}
      options={catalog}
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
    />
  );
}

const chips = (root: HTMLElement) => [...root.querySelectorAll(".entity-chip")];
const chipTexts = (root: HTMLElement) =>
  chips(root).map((c) => c.textContent?.replace(/[×＋📍👤]/gu, "") ?? "");
const rows = (root: HTMLElement) =>
  [...root.querySelectorAll(".entity-field__menu li")].map((li) => li.textContent ?? "");

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
