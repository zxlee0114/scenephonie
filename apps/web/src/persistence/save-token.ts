/**
 * 存檔 token —— `doc_seq` 對外的不透明包裝。
 *
 * `doc_seq` 是每一次**成功改變 canonical document state** 的 optimistic concurrency token。
 * 它不是自動存檔次數、不是版次、不是任何產品概念，**不對使用者曝露**，與交付無關（§6.7）。
 *
 * 並行控制在物理上需要呼叫端把「我載到的是哪一份」帶回來，但那不代表呼叫端要認識 `doc_seq`：
 * 它拿到的是一個 opaque 字串，**能傳回來、不能解讀、不能自己算下一個**。persistence 之外的
 * 程式碼因此只看得到「存／載」。
 */

declare const saveTokenBrand: unique symbol;

/** 載入時拿到、存檔時原封帶回的不透明 token。內容無意義，不得解析。 */
export type SaveToken = string & { readonly [saveTokenBrand]: true };

const TOKEN_PREFIX = "st_";

export function encodeSaveToken(docSeq: number): SaveToken {
  return `${TOKEN_PREFIX}${docSeq.toString(36)}` as SaveToken;
}

/** 解不開就回 `null` —— 呼叫端捏造或竄改 token 的結果是「這次存檔被拒」，不是 crash。 */
export function decodeSaveToken(token: string): number | null {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const body = token.slice(TOKEN_PREFIX.length);
  if (!/^[0-9a-z]+$/.test(body)) return null;
  const docSeq = Number.parseInt(body, 36);
  return Number.isSafeInteger(docSeq) && docSeq >= 0 ? docSeq : null;
}
