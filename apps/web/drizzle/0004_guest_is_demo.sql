-- 訪客的 lifecycle metadata（票券 07、規格 §6.2）。
--
-- 既有的每一列都是受邀者，`DEFAULT false` 正確 —— 不需要回填，也沒有「不知道是誰」的列。
--
-- 刻意**不加索引**：這一欄只有 TTL 清理任務每天讀一次，而 v1 的 `users` 是十來列的表
-- （不公開註冊）。真的長到掃描會痛的那天，該加的是 `(is_demo) WHERE is_demo` 的 partial
-- index —— 但那同時也是票券 25 tripwire 6「ephemeral data 開始產生實際成本」觸發的那天，
-- 屆時要重看的不只是一條索引。
ALTER TABLE "users" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;
