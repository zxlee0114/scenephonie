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
  usage,
}: {
  initial?: EntityRef[];
  options?: EntityOption[];
  onCreate?: (name: string) => Promise<EntityOption | null>;
  onRenameEntity?: (id: string, name: string) => void;
  multiple?: boolean;
  /** 給要模擬「孤兒不算存在」的測試用；不給就是整份目錄都算存在（見 EntityField）。 */
  usage?: () => ReadonlyMap<string, number>;
}) {
  const [refs, setRefs] = useState<EntityRef[]>(initial);
  const [catalog, setCatalog] = useState<EntityOption[]>(options);
  return (
    <EntityField
      kind="location"
      placeholder="地點"
      refs={refs}
      options={catalog}
      usage={usage}
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
/** 可以操作的那份選單（預覽不算 —— 它按不到，見下面那個 describe）。 */
const rows = (root: HTMLElement) =>
  [...root.querySelectorAll(".entity-field__menu:not(.entity-field__menu--preview) li")].map(
    (li) => li.textContent ?? "",
  );
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
    expect(rows(container)[0]).toBe("📍 海豚公寓房間（這一場叫 未知大樓房間）");

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
      "📍 test1（這一場叫 test，1 場）",
    );
  });

  it("兩者相同時一個字都不多印", () => {
    expect(heldAlias([{ id: "lo_1", name: "test" }], "test")[0]).toBe("📍 test（1 場）");
  });
});
