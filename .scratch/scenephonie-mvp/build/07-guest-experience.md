# 07 — 訪客體驗

**What to build:** 登入頁一顆「以訪客身分體驗」入口，**不放公開帳密**（那會把剛否決的密碼從後門放回來）。每次進入：建立 ephemeral user + clone 一份 demo project，**不用共用帳號**（共用帳號撞上「無同步層 ＋ 一列 jsonb 整列重寫」＝ last-write-wins 互相覆蓋，且打破「一個 `user` 列 ＝ 一個人」）。兩條入口（Google／訪客）收斂進**同一條 pipeline**，domain 不知道誰是訪客、零授權例外。`is_demo` 是 `users` 上的 infrastructure/lifecycle metadata，**不進 domain model**，**TTL 清理 7 天**。不長出 demo lifecycle domain。

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] 點「以訪客身分體驗」→ 得到自己的 user 身分與自己的 demo project 副本
- [ ] 兩個訪客 session 互不覆蓋對方的稿（非共用帳號）
- [ ] domain／command 層沒有「訪客」分支或授權例外
- [ ] `is_demo` 不出現在 domain model；7 天 TTL 清理任務存在
- [ ] Google 與訪客兩條入口走同一條 pipeline
