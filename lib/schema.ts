import { z } from "zod";

const nullableTextSchema = z.preprocess((value) => {
  if (value === "" || value === undefined) {
    return null;
  }

  return value;
}, z.string().nullable());

const nullableNumberSchema = z.preprocess((value) => {
  if (value === "" || value === undefined || value === null) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return value;
}, z.number().nullable());

const nullableIntegerSchema = z.preprocess((value) => {
  if (value === "" || value === undefined || value === null) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? value : Math.round(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }

  return value;
}, z.number().int().nullable());

export const receiptStatusSchema = z.enum([
  "processing",
  "review",
  "confirmed",
  "sync_failed",
]);

export const sourceTypeSchema = z.enum(["images", "pdf", "mixed"]);

export const pageAssetSchema = z.object({
  pageNumber: z.number().int().positive(),
  assetPath: z.string().min(1),
  mimeType: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const originalUploadSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  assetPath: z.string().min(1),
});

export const pricePerMeasureUnitSchema = z.enum(["kg", "l"]);

export const receiptItemSchema = z.object({
  id: z.string().min(1),
  lineIndex: z.number().int().nonnegative(),
  originalName: z.string().min(1),
  genericName: z.string().min(1),
  translatedNameEn: z.string().min(1),
  translatedNameEs: z.string().min(1),
  quantityValue: nullableNumberSchema.default(null),
  quantityUnit: nullableTextSchema.default(null),
  unitPrice: nullableNumberSchema.default(null),
  pricePerMeasureValue: nullableNumberSchema.default(null),
  pricePerMeasureUnit: pricePerMeasureUnitSchema.nullable().default(null),
  pageNumber: nullableIntegerSchema.pipe(z.number().int().positive().nullable()).default(null),
  confidence: nullableNumberSchema.pipe(z.number().min(0).max(1).nullable()).default(null),
  rawText: nullableTextSchema.default(null),
  userEdited: z.boolean().default(false),
});

export const receiptDraftSchema = z.object({
  id: z.string().min(1),
  status: receiptStatusSchema,
  sourceType: sourceTypeSchema,
  originalFiles: z.array(originalUploadSchema),
  pages: z.array(pageAssetSchema),
  supermarketName: z.string().nullable().default(null),
  supermarketTag: z.string().nullable().default(null),
  purchaseDate: z.string().nullable().default(null),
  currency: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
  extractionConfidence: z.number().min(0).max(1).nullable().default(null),
  items: z.array(receiptItemSchema),
  rawModelResponse: z.string().nullable().default(null),
  sheetSyncedAt: z.string().nullable().default(null),
  syncError: z.string().nullable().default(null),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const reviewSubmissionSchema = z.object({
  supermarketName: nullableTextSchema.default(null),
  supermarketTag: nullableTextSchema.default(null),
  purchaseDate: nullableTextSchema.default(null),
  currency: nullableTextSchema.default(null),
  notes: nullableTextSchema.default(null),
  items: z.array(
    receiptItemSchema.pick({
      id: true,
      lineIndex: true,
      originalName: true,
      genericName: true,
      translatedNameEn: true,
      translatedNameEs: true,
      quantityValue: true,
      quantityUnit: true,
      unitPrice: true,
      pricePerMeasureValue: true,
      pricePerMeasureUnit: true,
      pageNumber: true,
      confidence: true,
      rawText: true,
      userEdited: true,
    }),
  ),
});

export type ReceiptStatus = z.infer<typeof receiptStatusSchema>;
export type SourceType = z.infer<typeof sourceTypeSchema>;
export type PageAsset = z.infer<typeof pageAssetSchema>;
export type ReceiptItem = z.infer<typeof receiptItemSchema>;
export type ReceiptDraft = z.infer<typeof receiptDraftSchema>;
export type ReviewSubmission = z.infer<typeof reviewSubmissionSchema>;
