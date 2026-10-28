/**
 * 文件每走一步歷史（⌘Z／⌘⇧Z）就叫一次 —— 欄位的宿主拿它把「這一欄在 doc 裡現在的樣子」交給
 * 欄位（票券 82 驗收：點走那一下的定案被撤掉時，整串字要回到框裡）。
 *
 * 為什麼由宿主做：焦點已經不在欄位裡時，那一下 ⌘Z 打在 ProseMirror 上，欄位自己的 `handleKeyDown`
 * 收不到；欄位的 `refs` 又要等下一次重繪才換新（場次 node view 只在 attr 變了才重繪）。看得到
 * doc 的這一層在交易當下讀一次，最準。
 */
import type { Editor } from "@tiptap/core";
import { isHistoryTransaction } from "@tiptap/pm/history";
import type { Transaction } from "@tiptap/pm/state";
import { useEffect, useRef } from "react";

export function useAfterHistory(editor: Editor, run: () => void): void {
  // 每次重繪換成最新那一支 —— 訂閱只在 editor 換了才重來，不必每次重繪都 off／on。
  const latest = useRef(run);
  useEffect(() => {
    latest.current = run;
  });
  useEffect(() => {
    const onTransaction = ({ transaction }: { transaction: Transaction }) => {
      if (isHistoryTransaction(transaction)) latest.current();
    };
    editor.on("transaction", onTransaction);
    return () => {
      editor.off("transaction", onTransaction);
    };
  }, [editor]);
}
