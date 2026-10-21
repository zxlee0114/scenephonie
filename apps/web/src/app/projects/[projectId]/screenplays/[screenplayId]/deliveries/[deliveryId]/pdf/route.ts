import { authorizeScreenplay } from "@/authorization";
import { exportOptionsFromQuery } from "@/pdf/export-options";
import { printPdf } from "@/pdf/print-pdf";
import { renderDeliveryHtml } from "@/pdf/render-html";
import { loadDelivery } from "@/persistence";

// Chromium 要 Node runtime；印一份長稿要幾秒，給足時間（Vercel 的上限內）。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 一筆交付的 PDF（票券 18，§9.2）。
 *
 * **讀的是交付，不是 live doc** —— 匯出按鈕先建立交付（`createDeliveryAction`），再開這個網址。
 * 印壞了就再開一次同一個網址：重印 ＝ 同一筆交付再印一次，不產生第二筆（不變式 D）。
 *
 * 匯出選項（浮水印文字、登場人物、時間戳）在網址上 —— 它們是**渲染的參數，不是交付的內容**：
 * 同一筆交付換選項重印，承諾的字（場次號、內文）一個都不變。
 *
 * gate 在前：不是你的劇本、網址的專案對不上、交付不在這份劇本底下，全部是同一個 404（不變式 H）。
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; screenplayId: string; deliveryId: string }> },
): Promise<Response> {
  const { projectId, screenplayId, deliveryId } = await params;

  const screenplay = await authorizeScreenplay(screenplayId);
  if (!screenplay || screenplay.projectId !== projectId) return notFound();

  const delivery = await loadDelivery(screenplay, deliveryId);
  if (!delivery) return notFound();

  const html = renderDeliveryHtml(delivery, exportOptionsFromQuery(new URL(request.url).searchParams));
  const pdf = await printPdf(html);
  return new Response(pdf as Uint8Array<ArrayBuffer>, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${delivery.deliveryId}.pdf"`,
      // 同一筆交付、同一組選項永遠印同樣的字，但 PDF 是使用者的稿 —— 不進任何共用快取。
      "cache-control": "private, no-store",
    },
  });
}

/** 與「不存在」同一個答案 —— 不給存在性探針。 */
const notFound = () => new Response(null, { status: 404 });
