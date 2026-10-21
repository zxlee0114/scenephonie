/**
 * 場次表的搜尋框（票券 15，§7.10）—— v1 只做**清單篩選**：純前端 filter over 已在記憶體的投影，
 * **沒有新的資料路徑**。全文搜尋不做（另一個量級，歸宿可能是 `⌘+K`，§3.3）。
 */
import type { LabeledSceneTableRow } from "@scenephonie/schema";

/**
 * 留下對得上的列。比對表上的每一欄：場次號、景、時間、地點、人物、群演（§7.10）。空白（全形半形）
 * 分開的幾個詞要**全部**對上，每個詞各自對上任一欄即可。
 *
 * 場次號**整個比**：打 `5` 是在找第 5 場（連同它的子場次 `5.1`），不是 `15`、`50`。地點與人物比整格
 * 的字 —— 那一格是 `實體名（這一場的顯示名）`，所以兩種叫法都找得到。
 */
export function filterSceneTable(
  rows: readonly LabeledSceneTableRow[],
  query: string,
): readonly LabeledSceneTableRow[] {
  // `\s` 已含全形空白（U+3000）。
  const terms = query.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return rows;
  return rows.filter((row) => terms.every((term) => matches(row, term)));
}

function matches(row: LabeledSceneTableRow, term: string): boolean {
  return (
    row.label === term ||
    row.label.startsWith(`${term}.`) ||
    row.intExt.includes(term) ||
    row.time.includes(term) ||
    row.location.includes(term) ||
    row.appearingCharacters.includes(term) ||
    row.extras.includes(term)
  );
}
