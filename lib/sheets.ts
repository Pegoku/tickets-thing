import "server-only";

import { google } from "googleapis";

import { getSheetsEnv } from "@/lib/env";
import type { ReceiptDraft } from "@/lib/schema";

const HEADERS = [
  "receipt_id",
  "purchase_date",
  "uploaded_at",
  "supermarket_name",
  "supermarket_tag",
  "original_name",
  "name_en",
  "name_es",
  "quantity_value",
  "quantity_unit",
  "unit_price",
  "price_per_measure_value",
  "price_per_measure_unit",
  "currency",
  "page_number",
  "line_index",
  "confidence",
  "notes",
];

async function getSheetsClient() {
  const env = getSheetsEnv();
  const auth = new google.auth.JWT({
    email: env.email,
    key: env.privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  await auth.authorize();

  return {
    spreadsheetId: env.spreadsheetId,
    tabName: env.tabName,
    client: google.sheets({ version: "v4", auth }),
  };
}

export async function ensureSheetTable() {
  const { client, spreadsheetId, tabName } = await getSheetsClient();
  const spreadsheet = await client.spreadsheets.get({ spreadsheetId });

  const existingSheet = spreadsheet.data.sheets?.find(
    (sheet) => sheet.properties?.title === tabName,
  );

  if (!existingSheet) {
    await client.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: tabName,
                gridProperties: {
                  frozenRowCount: 1,
                },
              },
            },
          },
        ],
      },
    });
  }

  await client.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabName}!A1:R1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [HEADERS],
    },
  });

  const refreshed = await client.spreadsheets.get({ spreadsheetId });
  const sheetId = refreshed.data.sheets?.find(
    (sheet) => sheet.properties?.title === tabName,
  )?.properties?.sheetId;

  if (sheetId === undefined) {
    return;
  }

  await client.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          setBasicFilter: {
            filter: {
              range: {
                sheetId,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: HEADERS.length,
              },
            },
          },
        },
      ],
    },
  });
}

export async function appendReceiptToSheet(draft: ReceiptDraft) {
  const { client, spreadsheetId, tabName } = await getSheetsClient();

  await ensureSheetTable();

  const rows = draft.items.map((item) => [
    draft.id,
    draft.purchaseDate ?? "",
    draft.createdAt,
    draft.supermarketName ?? "",
    draft.supermarketTag ?? "",
    item.originalName,
    item.translatedNameEn,
    item.translatedNameEs,
    item.quantityValue ?? "",
    item.quantityUnit ?? "",
    item.unitPrice ?? "",
    item.pricePerMeasureValue ?? "",
    item.pricePerMeasureUnit ?? "",
    draft.currency ?? "",
    item.pageNumber ?? "",
    item.lineIndex,
    item.confidence ?? "",
    draft.notes ?? "",
  ]);

  if (rows.length === 0) {
    throw new Error("There are no receipt items to append to Google Sheets.");
  }

  await client.spreadsheets.values.append({
    spreadsheetId,
    range: `${tabName}!A:R`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: rows,
    },
  });
}
