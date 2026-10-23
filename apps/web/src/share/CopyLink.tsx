/**
 * 一格唯讀網址 ＋「複製」（票券 20）—— 分享面板與匯出面板共用。
 *
 * 複製之後鈕上的字換成「已複製」一會兒，就在網址框右邊，不另開提示。`autoCopy` 是匯出面板那條路：
 * 按「取得這次交付的連結」本身就是要那條網址，鑄好就直接進剪貼簿。拿不到剪貼簿（權限、非安全來源）
 * 不報錯 —— 網址還在框裡，點一下就全選。
 */
"use client";

import { useEffect, useId, useState, type ReactNode } from "react";

import "../styles/share.css";

const COPIED_FOR_MS = 2000;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function CopyLink({
  name,
  label,
  url,
  autoCopy = false,
  above,
  children,
}: {
  /** 網址框的名字（無障礙）。沒有 `label` 時它就是唯一的名字。 */
  name: string;
  /** 框上方看得到的那一行；省略 ＝ 由外面的標題說明。 */
  label?: ReactNode;
  url: string;
  autoCopy?: boolean;
  /** 夾在 `label` 與網址那一列之間的東西（分享面板的備註欄）。 */
  above?: ReactNode;
  /** 同一列、排在「複製」後面的鈕（分享面板的「停用」）。 */
  children?: ReactNode;
}) {
  const id = useId();
  const [copied, setCopied] = useState(false);

  const copy = async () => setCopied(await copyText(url));

  useEffect(() => {
    if (autoCopy) void copyText(url).then(setCopied);
  }, [autoCopy, url]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_FOR_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className="copy-link">
      {label && (
        <label className="copy-link__label" htmlFor={id}>
          {label}
        </label>
      )}
      {above}
      <div className="copy-link__row">
        <input id={id} type="text" readOnly value={url} aria-label={name} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="copy-link__copy" aria-live="polite" onClick={() => void copy()}>
          {copied ? "已複製" : "複製"}
        </button>
        {children}
      </div>
    </div>
  );
}
