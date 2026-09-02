# Scenephonie

結構化劇本創作平台。受 Notion 啟發，讓編劇以場次為單位結構化地址、登場人物等資訊，
並能以台灣標準劇本格式匯出 PDF。背景見 [`DRAFT.md`](./DRAFT.md)、[`CONTEXT.md`](./CONTEXT.md)、
規格 [`.scratch/scenephonie-mvp/spec.md`](./.scratch/scenephonie-mvp/spec.md)。

## Monorepo 佈局

| 路徑 | 內容 |
|---|---|
| `packages/schema/` | isomorphic 場次 schema 與推導函式（`projectScenes()` 等）。**零瀏覽器相依**，Node 可單獨跑測試（規格 §5.5）。 |
| `apps/web/` | Next.js（App Router）＋ TypeScript ＋ Drizzle ORM。 |

技術棧鎖定值與部署意圖見 [`docs/tech-stack.md`](./docs/tech-stack.md)。

## 開發

需求：Node 22（見 `.nvmrc`）、pnpm 11、Docker（本機 Postgres）。

```bash
pnpm install
cp .env.example .env            # 填入連線字串，或用下方本機 Postgres

docker compose up -d db         # 本機 Postgres（localhost:5432）
# .env 內把 DATABASE_URL / DIRECT_URL 指向 postgresql://postgres:postgres@localhost:5432/scenephonie

pnpm db:generate                # 由 src/db/schema.ts 生成 SQL migration
pnpm db:migrate                 # 套用 migration（走 DIRECT_URL）

pnpm dev                        # http://localhost:3000
```

## 檢查（與 CI 相同）

```bash
pnpm lint        # ESLint，含 §5.5 isomorphic 邊界強制
pnpm typecheck   # 各套件 tsc --noEmit
pnpm test        # vitest run
pnpm build       # next build
```
