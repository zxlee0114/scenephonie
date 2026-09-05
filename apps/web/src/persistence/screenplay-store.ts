import { eq, max } from "drizzle-orm";

import { mintId } from "@scenephonie/schema";

import type { AuthorizedProject, AuthorizedScreenplay } from "@/authorization";
import { getDb } from "@/db/client";
import { screenplayBackups, screenplays } from "@/db/schema";

import { needsBackup } from "./backup-policy";
import { CURRENT_DOC_SCHEMA_VERSION, migrateDocToCurrent, type PersistedDoc } from "./doc-schema-version";
import { decodeSaveToken, encodeSaveToken, type SaveToken } from "./save-token";

/**
 * 存／載一份劇本 —— persistence 模組唯一的實作（§6.7）。
 *
 * 呼叫端只知道「存」與「載」。備份、`doc_seq`、schema 遷移、交易邊界全部住在這個檔案裡；
 * 模組外一個字都看不到（`persistence-boundary.test.ts` 是這條規則的守衛）。
 *
 * **「整份 doc 覆蓋」這個假設也只准住在這裡** —— 它是 v1 的儲存粒度選擇，不是領域事實。
 *
 * ⚠️ **每一支的第一個參數都是已授權的 handle，不是 `screenplayId` 字串**（不變式 H、票券 06）。
 * 這個模組因此不必知道授權是怎麼判的，也不可能被繞過 —— 沒有 handle 就打不出這通呼叫。
 */

const SCREENPLAY_ID_PREFIX = "sp_";
const BACKUP_ID_PREFIX = "bk_";

/**
 * 一份載進記憶體的劇本。`token` 是不透明的 —— 存檔時原封帶回即可。
 *
 * `origin` 說的是「這一份是剛開的，還是撈回來的」。只有這裡知道走了哪條路，而編輯器需要它
 * 才能決定進站時游標落在哪（票券 26）—— 用 doc 的形狀回猜（只有一場且為空＝新建）是拿形狀
 * 猜意圖，多寫一場空戲就破功。
 */
export type LoadedScreenplay = {
  screenplayId: string;
  doc: PersistedDoc;
  token: SaveToken;
  origin: "created" | "loaded";
};

/** 一次存檔請求。三個欄位永遠一起旅行 —— 它們是同一個東西。 */
export type SaveRequest = {
  screenplay: AuthorizedScreenplay;
  doc: PersistedDoc;
  token: SaveToken;
};

export type SaveResult =
  | { status: "saved"; token: SaveToken }
  /** 這份劇本在別處被改過了（另一個分頁、另一台裝置、伺服器端 command）。本次寫入未生效。 */
  | { status: "conflict" };

/**
 * 在一個已授權的專案下建立一份新劇本。
 *
 * 初始 doc 由呼叫端給 —— 「劇本至少有一場」是編輯器的責任，不是儲存的。
 */
export async function createScreenplay(
  project: AuthorizedProject,
  doc: PersistedDoc,
): Promise<LoadedScreenplay> {
  const screenplayId = mintId(SCREENPLAY_ID_PREFIX);
  await getDb().insert(screenplays).values({
    id: screenplayId,
    projectId: project.projectId,
    doc,
    docSchemaVersion: CURRENT_DOC_SCHEMA_VERSION,
  });
  return { screenplayId, doc, token: encodeSaveToken(0), origin: "created" };
}

/**
 * 載入一份劇本。舊版 doc 在**記憶體中**被帶到現行版本 —— **讀取路徑一律不寫回**：
 * PDF 匯出、場次表、分享連結都走這條，它們不該因為「讀了一下」就改資料庫（§6.7）。
 */
export async function loadScreenplay(
  screenplay: AuthorizedScreenplay,
): Promise<LoadedScreenplay | null> {
  const [row] = await getDb()
    .select({
      id: screenplays.id,
      doc: screenplays.doc,
      docSchemaVersion: screenplays.docSchemaVersion,
      docSeq: screenplays.docSeq,
    })
    .from(screenplays)
    .where(eq(screenplays.id, screenplay.screenplayId))
    .limit(1);

  if (!row) return null;

  return {
    screenplayId: row.id,
    doc: migrateDocToCurrent(row.doc as PersistedDoc, row.docSchemaVersion),
    token: encodeSaveToken(row.docSeq),
    origin: "loaded",
  };
}

/**
 * 存一份劇本。
 *
 * 一次成功的存檔是**單一 atomic state transition**：（依政策判定要寫的）before-image 備份、
 * doc 覆蓋、`doc_schema_version` 帶到現行版本、`doc_seq` 遞增，全部在同一個交易裡；
 * 任何一半失敗就整個不算數，不會留下「備份寫了但 doc 沒更新」這種狀態。
 *
 * 並行檢查沿用同一個 `doc_seq`：`SELECT … FOR UPDATE` 把同一份劇本的兩次存檔排成序，
 * 後到的那次看到的 `doc_seq` 已經不是它載入時的那個，於是被拒 —— 它的 doc 不會覆蓋掉
 * 別人剛寫進去的東西。
 */
export async function saveScreenplay({
  screenplay,
  doc,
  token,
}: SaveRequest): Promise<SaveResult> {
  const { screenplayId } = screenplay;
  const expectedDocSeq = decodeSaveToken(token);
  if (expectedDocSeq === null) return { status: "conflict" };

  return getDb().transaction(async (tx): Promise<SaveResult> => {
    const [current] = await tx
      .select({
        doc: screenplays.doc,
        docSchemaVersion: screenplays.docSchemaVersion,
        docSeq: screenplays.docSeq,
      })
      .from(screenplays)
      .where(eq(screenplays.id, screenplayId))
      .limit(1)
      .for("update");

    // 劇本不存在，或不是我們載到的那一份 —— 兩者對呼叫端是同一件事：這次寫入沒有落點。
    if (!current || current.docSeq !== expectedDocSeq) return { status: "conflict" };

    const [{ lastBackupAt } = { lastBackupAt: null }] = await tx
      .select({ lastBackupAt: max(screenplayBackups.createdAt) })
      .from(screenplayBackups)
      .where(eq(screenplayBackups.screenplayId, screenplayId));

    if (needsBackup({ lastBackupAt: lastBackupAt ?? null, now: new Date() })) {
      // before-image ＝ 被這次存檔覆蓋掉的那一份，連同它當時的 schema 版本
      // （撈回來時才知道該從遷移鏈的哪一節接上）。
      await tx.insert(screenplayBackups).values({
        id: mintId(BACKUP_ID_PREFIX),
        screenplayId,
        doc: current.doc,
        docSchemaVersion: current.docSchemaVersion,
      });
    }

    const nextDocSeq = current.docSeq + 1;
    await tx
      .update(screenplays)
      .set({
        doc,
        docSchemaVersion: CURRENT_DOC_SCHEMA_VERSION,
        docSeq: nextDocSeq,
        updatedAt: new Date(),
      })
      .where(eq(screenplays.id, screenplayId));

    return { status: "saved", token: encodeSaveToken(nextDocSeq) };
  });
}
