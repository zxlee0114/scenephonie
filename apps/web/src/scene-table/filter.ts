/**
 * 場次表與場次導覽 sidebar 的搜尋框（票券 15、16，§7.10）—— v1 只做**清單篩選**：純前端 filter
 * over 已在記憶體的投影，**沒有新的資料路徑**。全文搜尋不做（另一個量級，歸宿可能是 `⌘+K`，§3.3）。
 *
 * 兩邊比對同一組欄位、同一套規則 —— 同一個詞在場次表找得到、在 sidebar 卻找不到，會讓人以為
 * 其中一邊壞了。列的形狀不同（sidebar 含草稿、印簡稱），所以由呼叫端交出要比的那幾格字。
 */
/**
 * 拿來比的那幾格字：場次號（不帶 `S`）、內外、時間、地點、人物、群演。都是字 —— sidebar 的草稿
 * 可能還沒填內外與時間（`""`）。
 */
export type SceneFilterFields = Record<
  "label" | "intExt" | "time" | "location" | "appearingCharacters" | "extras",
  string
>;

/**
 * 留下對得上的列。比對表上的每一欄：場次號、景、時間、地點、人物、群演（§7.10）。空白（全形半形）
 * 分開的幾個詞要**全部**對上，每個詞各自對上任一欄即可。
 *
 * 場次號**整個比**：打 `5` 是在找第 5 場（連同它的子場次 `5.1`），不是 `15`、`50`。地點與人物比整格
 * 的字 —— 那一格是 `實體名（這一場的顯示名）`，所以兩種叫法都找得到。
 */
export function filterScenes<Row>(
  rows: readonly Row[],
  query: string,
  fieldsOf: (row: Row) => SceneFilterFields,
): readonly Row[] {
  // `\s` 已含全形空白（U+3000）。
  const terms = query.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return rows;
  return rows.filter((row) => {
    const fields = fieldsOf(row);
    return terms.every((term) => matches(fields, term));
  });
}

/** 草稿標籤 `S5[D1]`／`S5.1[D2]` 錨定的那個場次號（`5`／`5.1`）；不是草稿、或排在全劇第一場之前（`[D1]`）回 `null`。 */
function draftAnchor(label: string): string | null {
  return /^S(.+)\[D\d+\]$/.exec(label)?.[1] ?? null;
}

function matches(row: SceneFilterFields, term: string): boolean {
  // sidebar 印的是 `S5`（票券 16）—— 照著畫面打也要找得到。
  const number = /^[Ss]\d/.test(term) ? term.slice(1) : term;
  // 草稿不佔號，以它錨定的場次號比（票券 16 使用者裁決）：打 `5` 也帶出 `S5[D1]`、`S5.1[D1]`，
  // 跟正式的 `5.1` 被 `5` 帶出來是同一條規則。sidebar 印的是「草稿」，標籤要滑過才看得到，
  // 不能要求編劇把 `S5[D1]` 整串打出來。
  const anchored = draftAnchor(row.label) ?? row.label;
  return (
    row.label === term ||
    anchored === number ||
    anchored.startsWith(`${number}.`) ||
    row.intExt.includes(term) ||
    row.time.includes(term) ||
    row.location.includes(term) ||
    row.appearingCharacters.includes(term) ||
    row.extras.includes(term)
  );
}
