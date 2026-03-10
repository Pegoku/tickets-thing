import "server-only";

import path from "node:path";
import { z } from "zod";

const optionalEnvSchema = z.object({
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default("google/gemini-2.5-flash"),
  OPENROUTER_BASE_URL: z.string().default("https://openrouter.ai/api/v1"),
  GOOGLE_SHEETS_SPREADSHEET_URL: z.string().optional(),
  GOOGLE_SHEETS_SPREADSHEET_ID: z.string().optional(),
  GOOGLE_SHEETS_TAB_NAME: z.string().default("prices"),
  GOOGLE_SHEETS_TICKETS_TAB_NAME: z.string().default("Tickets"),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: z.string().optional(),
  STORAGE_DIR: z.string().default(path.join(process.cwd(), ".data")),
  UPLOAD_MAX_MB: z.coerce.number().int().positive().default(20),
  MAX_RECEIPT_PAGES: z.coerce.number().int().positive().default(12),
});

export type AppEnv = z.infer<typeof optionalEnvSchema>;

function parseSpreadsheetId(env: AppEnv) {
  if (env.GOOGLE_SHEETS_SPREADSHEET_ID) {
    return env.GOOGLE_SHEETS_SPREADSHEET_ID;
  }

  const url = env.GOOGLE_SHEETS_SPREADSHEET_URL;
  if (!url) {
    return null;
  }

  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] ?? null;
}

export function getOptionalEnv() {
  return optionalEnvSchema.parse(process.env);
}

export function getOpenRouterEnv() {
  const env = getOptionalEnv();

  if (!env.OPENROUTER_API_KEY) {
    throw new Error("Missing OPENROUTER_API_KEY in environment.");
  }

  return {
    apiKey: env.OPENROUTER_API_KEY,
    model: env.OPENROUTER_MODEL,
    baseUrl: env.OPENROUTER_BASE_URL.replace(/\/$/, ""),
  };
}

export function getSheetsEnv() {
  const env = getOptionalEnv();
  const spreadsheetId = parseSpreadsheetId(env);

  if (!spreadsheetId) {
    throw new Error(
      "Missing GOOGLE_SHEETS_SPREADSHEET_URL or GOOGLE_SHEETS_SPREADSHEET_ID in environment.",
    );
  }

  if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    throw new Error(
      "Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY in environment.",
    );
  }

  return {
    spreadsheetId,
    tabName: env.GOOGLE_SHEETS_TAB_NAME,
    ticketsTabName: env.GOOGLE_SHEETS_TICKETS_TAB_NAME,
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, "\n"),
  };
}

export function getConfigStatus() {
  const env = getOptionalEnv();
  const spreadsheetId = parseSpreadsheetId(env);

  return {
    hasOpenRouter: Boolean(env.OPENROUTER_API_KEY),
    hasSheets: Boolean(
      spreadsheetId &&
        env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
        env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
    ),
    uploadMaxMb: env.UPLOAD_MAX_MB,
    maxReceiptPages: env.MAX_RECEIPT_PAGES,
    storageDir: env.STORAGE_DIR,
    sheetTabName: env.GOOGLE_SHEETS_TAB_NAME,
    ticketsSheetTabName: env.GOOGLE_SHEETS_TICKETS_TAB_NAME,
  };
}
