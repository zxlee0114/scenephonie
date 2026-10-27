---
target: scenephonie 全站介面
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/Users/leon/Projects/fullstack/scenephonie/apps/web/apps/web/src/app"
timestamp: 2026-10-27T00-56-47Z
slug: apps-web-src-app
---
# Critique — apps/web 全站（Operate）

Method: dual-agent (A: design review · B: detector + browser overlay)

## Nielsen 10 項 — 27/40（Acceptable）
1 系統狀態 2｜2 真實世界 3｜3 控制自由 3｜4 一致標準 2｜5 預防錯誤 2｜6 辨識 3｜7 效率 4｜8 極簡 2｜9 錯誤復原 3｜10 說明 3

## Design specificity
結構與文案為產品量身打造（場次抬頭、chip 實體欄、ⓘ 劇組語言、GHSA 匯出防呆）；外殼（儀表板／hub 卡片、分享面板、精靈）是通用 SaaS。分享頁比編輯器更像劇本。
Detector：CLI 扣掉已裁決的 side-tab 為 0；overlay：scene-nav__toggle 2.4:1、entity-field placeholder 4.3:1、hub-card__preview 2.2:1（刻意淡字縮圖）、flat-type-hierarchy（false positive，字重分層）。

## Priority issues
- [P1] 選完說話者直接打台詞 → 台詞變成新人物 chip、「，」前半句遺失 —— 新（entity-field.tsx / chip-row.tsx）
- [P1] 場次抬頭常駐三列表單框 + 每場 5 顆 ⓘ，非焦點場次不收合 —— 新（ⓘ hover 部分 33）
- [P1] V.O./O.S. 在資料與輸出存在，編輯器 chip 不可見 —— 59（現況比票描述更糟）
- [P2] 頂列無專案／劇本名、分享頁無片名、編輯器切換列無分場大綱 —— 新
- [P2] 範例劇本登場人物全空，第一次匯出就被警告；人物介紹空 —— 新（73／78 相關）
- [P2] 對比：scene-nav__toggle「‹ 場次」2.4:1（寬版用 --text-faint）；entity-field input 無 ::placeholder 4.3:1 —— 新

## Persona red flags
Alex：雙 Enter 違反 Final Draft 肌肉記憶；slash 選單對白／動作排最後。Sam：ⓘ 目標 16px、emoji 記號（55）、低對比按鈕。Jordan：「實體」工程用語、空白卡片封面。長時間寫稿編劇：每場越過表單、選單切邊（33）、游標沉底（81）、存檔狀態淡（74）。

## Minor
景／光 vs 內外／時間 vs 時間 用詞三套；刪除本場緊貼標記為草稿無危險樣式（68）；Esc 後選取底色殘留；主按鈕實心／外框不一致；sidebar S1 vs gutter 1；分享面板停用＝複製同重；文件頁字數浮動、泡泡選單蓋 H1；快捷鍵總覽貼頂；精靈必填星號用錯誤紅；390px 抬頭待實機。

## Questions
抬頭收成一行排版、ⓘ 只在焦點時出現？預設單人直接進台詞、齊聲改用「、」？「實體」給誰看？範例劇本該示範理想狀態嗎？編輯器要閱讀模式嗎？
