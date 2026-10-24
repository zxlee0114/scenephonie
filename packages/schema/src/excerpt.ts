/**
 * 一份 ProseMirror doc 開頭的幾個字（票券 21：hub 卡片上的內文預覽）。
 *
 * 吃的是**存下來的 JSON**，不是 hydrate 過的 Node：預覽只要字，不需要知道節點合不合 schema，
 * 所以劇本與劇本外文件共用這一支，也不必先走遷移。場次的 metadata 在 attrs 裡（地點、人物是 id），
 * 不是字，自然不會出現 —— 劇本的預覽就是第一場的動作與對白。
 */
export function plainTextExcerpt(json: unknown, maxChars: number): string {
  const parts: string[] = [];
  let length = 0;

  const walk = (node: unknown): void => {
    if (length >= maxChars || typeof node !== "object" || node === null) return;
    const { text, content } = node as { text?: unknown; content?: unknown };
    if (typeof text === "string") {
      parts.push(text);
      length += text.length;
      return;
    }
    if (Array.isArray(content)) {
      for (const child of content) walk(child);
      // 區塊之間空一格，否則上一段的結尾與下一段的開頭會黏成一個字。
      parts.push(" ");
    }
  };
  walk(json);

  const flat = parts.join("").replace(/\s+/gu, " ").trim();
  return flat.length > maxChars ? `${flat.slice(0, maxChars).trimEnd()}…` : flat;
}
