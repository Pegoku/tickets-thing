import "server-only";

import path from "node:path";

import { getOptionalEnv } from "@/lib/env";
import { extractReceiptData } from "@/lib/gemini";
import { normalizeUploadedImage } from "@/lib/images";
import { extractPdfPages } from "@/lib/pdf";
import {
  createReceiptWorkspace,
  loadDraft,
  readStoredAsset,
  saveDraft,
  writeReceiptBuffer,
} from "@/lib/storage";
import {
  checkForDuplicates,
  fetchExistingRows,
  syncReceiptToSheet,
  syncReceiptItemsToTickets,
  type ItemSyncResult,
  type SyncDecision,
  type SyncSummary,
} from "@/lib/sheets";
import {
  receiptDraftSchema,
  reviewSubmissionSchema,
  type ReceiptDraft,
  type ReviewSubmission,
} from "@/lib/schema";
import {
  inferSupermarketTag,
  normalizeOptionalNumber,
  normalizeOptionalText,
  sanitizeFilename,
} from "@/lib/utils";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

type UploadResult = {
  receiptId: string;
};

export async function createDraftFromUpload(formData: FormData): Promise<UploadResult> {
  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (files.length === 0) {
    throw new Error("Upload at least one PDF or image file.");
  }

  const { UPLOAD_MAX_MB } = getOptionalEnv();
  const maxBytes = UPLOAD_MAX_MB * 1024 * 1024;

  const { id } = await createReceiptWorkspace();
  const now = new Date().toISOString();

  const originalFiles: ReceiptDraft["originalFiles"] = [];
  const pages: ReceiptDraft["pages"] = [];
  const sourceTypes = new Set<ReceiptDraft["sourceType"]>();

  for (const [fileIndex, file] of files.entries()) {
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      throw new Error(`Unsupported file type: ${file.type || file.name}`);
    }

    if (file.size > maxBytes) {
      throw new Error(`${file.name} exceeds the upload limit of ${UPLOAD_MAX_MB} MB.`);
    }

    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const safeName = `${fileIndex + 1}-${sanitizeFilename(file.name)}`;
    const originalPath = path.join("originals", safeName);

    await writeReceiptBuffer(id, originalPath, inputBuffer);

    originalFiles.push({
      filename: file.name,
      mimeType: file.type,
      assetPath: path.join(id, originalPath),
    });

    if (file.type === "application/pdf") {
      sourceTypes.add("pdf");

      const renderedPages = await extractPdfPages(inputBuffer);

      for (const renderedPage of renderedPages) {
        const pagePath = path.join("pages", `${fileIndex + 1}-page-${renderedPage.pageNumber}.png`);
        await writeReceiptBuffer(id, pagePath, renderedPage.buffer);

        pages.push({
          pageNumber: pages.length + 1,
          assetPath: path.join(id, pagePath),
          mimeType: renderedPage.mimeType,
          width: renderedPage.width,
          height: renderedPage.height,
        });
      }
    } else {
      sourceTypes.add("images");

      const normalized = await normalizeUploadedImage(inputBuffer);
      const extension = normalized.mimeType === "image/jpeg" ? "jpg" : "png";
      const pagePath = path.join("pages", `${fileIndex + 1}.${extension}`);

      await writeReceiptBuffer(id, pagePath, normalized.buffer);

      pages.push({
        pageNumber: pages.length + 1,
        assetPath: path.join(id, pagePath),
        mimeType: normalized.mimeType,
        width: normalized.width,
        height: normalized.height,
      });
    }
  }

  if (pages.length === 0) {
    throw new Error("No page images could be extracted from the upload.");
  }

  const sourceType =
    sourceTypes.size > 1 ? "mixed" : sourceTypes.values().next().value ?? "images";

  const extraction = await extractReceiptData(
    await Promise.all(
      pages.map(async (page) => ({
        pageNumber: page.pageNumber,
        mimeType: page.mimeType,
        buffer: await readStoredAsset(page.assetPath),
      })),
    ),
  );

  const draft = receiptDraftSchema.parse({
    id,
    status: "review",
    sourceType,
    originalFiles,
    pages,
    supermarketName: normalizeOptionalText(extraction.supermarketName),
    supermarketTag:
      normalizeOptionalText(extraction.supermarketTag) ??
      inferSupermarketTag(normalizeOptionalText(extraction.supermarketName)),
    purchaseDate: normalizeOptionalText(extraction.purchaseDate),
    currency: normalizeOptionalText(extraction.currency),
    notes: normalizeOptionalText(extraction.notes),
    extractionConfidence: extraction.extractionConfidence,
    items: extraction.items,
    rawModelResponse: extraction.rawResponse,
    sheetSyncedAt: null,
    syncError: null,
    createdAt: now,
    updatedAt: now,
  });

  await saveDraft(draft);

  return {
    receiptId: id,
  };
}

export async function getDraftById(id: string) {
  return loadDraft(id);
}

export async function updateDraftReview(id: string, submission: ReviewSubmission) {
  const parsed = reviewSubmissionSchema.parse(submission);
  const existing = await loadDraft(id);
  const now = new Date().toISOString();

  const updated = receiptDraftSchema.parse({
    ...existing,
    status: existing.status === "confirmed" ? "confirmed" : "review",
    supermarketName: normalizeOptionalText(parsed.supermarketName),
    supermarketTag:
      normalizeOptionalText(parsed.supermarketTag) ??
      inferSupermarketTag(parsed.supermarketName),
    purchaseDate: normalizeOptionalText(parsed.purchaseDate),
    currency: normalizeOptionalText(parsed.currency)?.toUpperCase() ?? null,
    notes: normalizeOptionalText(parsed.notes),
    items: parsed.items.map((item) => ({
      ...item,
      originalName: item.originalName.trim(),
      translatedNameEn: item.translatedNameEn.trim(),
      translatedNameEs: item.translatedNameEs.trim(),
      quantityValue: normalizeOptionalNumber(item.quantityValue),
      quantityUnit: normalizeOptionalText(item.quantityUnit),
      unitPrice: normalizeOptionalNumber(item.unitPrice),
      pricePerMeasureValue: normalizeOptionalNumber(item.pricePerMeasureValue),
      pricePerMeasureUnit: item.pricePerMeasureUnit,
      rawText: normalizeOptionalText(item.rawText),
      userEdited: item.userEdited,
    })),
    updatedAt: now,
    syncError: null,
  });

  await saveDraft(updated);

  return updated;
}

/**
 * Check items against existing sheet data for duplicates. Returns sync status per item.
 */
export async function checkDraftDuplicates(
  id: string,
  submission: ReviewSubmission,
): Promise<ItemSyncResult[]> {
  console.log("[checkDraftDuplicates] Updating draft review for:", id);
  const updated = await updateDraftReview(id, submission);
  console.log("[checkDraftDuplicates] Draft updated. Tag:", updated.supermarketTag, "| Items:", updated.items.length);

  console.log("[checkDraftDuplicates] Fetching existing rows from sheet...");
  const existingRows = await fetchExistingRows();
  console.log("[checkDraftDuplicates] Existing rows:", existingRows.length);

  const results = checkForDuplicates(
    updated.items,
    updated.supermarketTag,
    existingRows,
  );
  console.log("[checkDraftDuplicates] Duplicate check results:", results.map(r => `${r.itemId.slice(0,8)}=${r.status}`).join(", "));
  return results;
}

/**
 * Confirm and sync a draft to Google Sheets with per-item decisions (add/skip/update).
 */
export async function confirmDraft(
  id: string,
  submission: ReviewSubmission,
  decisions: SyncDecision[],
) {
  console.log("[confirmDraft] Starting confirm for draft:", id);
  const updated = await updateDraftReview(id, submission);
  console.log("[confirmDraft] Draft updated. Items:", updated.items.length);

  try {
    console.log("[confirmDraft] Fetching existing rows...");
    const existingRows = await fetchExistingRows();
    console.log("[confirmDraft] Existing rows:", existingRows.length);

    console.log("[confirmDraft] Syncing to sheet with", decisions.length, "decisions...");
    const sheetSummary = await syncReceiptToSheet(updated, decisions, existingRows);
    console.log("[confirmDraft] Registry sync complete:", JSON.stringify(sheetSummary));

    const ticketsSummary = await syncReceiptItemsToTickets(updated);
    console.log("[confirmDraft] Tickets sync complete:", JSON.stringify(ticketsSummary));

    const summary: SyncSummary & { ticketRowsLogged: number; ticketId: string } = {
      ...sheetSummary,
      ticketRowsLogged: ticketsSummary.rowsLogged,
      ticketId: ticketsSummary.ticketId,
    };

    const confirmed = receiptDraftSchema.parse({
      ...updated,
      status: "confirmed",
      sheetSyncedAt: new Date().toISOString(),
      syncError: null,
      updatedAt: new Date().toISOString(),
    });

    await saveDraft(confirmed);
    return { draft: confirmed, summary };
  } catch (error) {
    console.error("[confirmDraft] Error during sync:", error);
    const failed = receiptDraftSchema.parse({
      ...updated,
      status: "sync_failed",
      syncError: error instanceof Error ? error.message : "Failed to sync to Google Sheets.",
      updatedAt: new Date().toISOString(),
    });

    await saveDraft(failed);
    throw error;
  }
}
