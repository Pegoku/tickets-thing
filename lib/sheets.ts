import "server-only";

import { google, sheets_v4 } from "googleapis";

import { getSheetsEnv } from "@/lib/env";
import type { ReceiptDraft, ReceiptItem } from "@/lib/schema";

const HEADERS = [
  "supermarket_name",
  "supermarket_tag",
  "original_name",
  "name_en",
  "name_es",
  "unit_price",
  "currency",
  "quantity_value",
  "quantity_unit",
  "price_per_measure_value",
  "price_per_measure_unit",
];

/** Column indices matching HEADERS */
const COL = {
  supermarketTag: 1,
  originalName: 2,
  unitPrice: 5,
} as const;

const TABLE_NAME = "TicketsThing";

/**
 * Represents an existing row in the sheet for duplicate detection.
 */
export type ExistingSheetRow = {
  /** 1-based row number in the spreadsheet */
  rowNumber: number;
  supermarketTag: string;
  originalName: string;
  unitPrice: number | null;
};

/**
 * Result of comparing a new item against existing sheet rows.
 * - "new": no match found, will be appended
 * - "duplicate": exact match (same product + supermarket + same price), will be skipped
 * - "price_changed": same product + supermarket but different price, user decides
 */
export type ItemSyncStatus = "new" | "duplicate" | "price_changed";

export type ItemSyncResult = {
  itemId: string;
  status: ItemSyncStatus;
  existingPrice: number | null;
  newPrice: number | null;
};

export type SyncDecision = {
  itemId: string;
  action: "add" | "skip" | "update";
};

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

function toCellValue(value: string | number | null) {
  if (value === null || value === "") {
    return {};
  }

  if (typeof value === "number") {
    return {
      userEnteredValue: {
        numberValue: value,
      },
    };
  }

  return {
    userEnteredValue: {
      stringValue: value,
    },
  };
}

function toRowData(values: Array<string | number | null>): sheets_v4.Schema$RowData {
  return {
    values: values.map(toCellValue),
  };
}

async function getSheetInfo(
  client: sheets_v4.Sheets,
  spreadsheetId: string,
  tabName: string,
) {
  const spreadsheet = await client.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(sheetId,title,gridProperties),tables)",
  });

  return spreadsheet.data.sheets?.find((sheet) => sheet.properties?.title === tabName) ?? null;
}

async function getUsedRowCount(
  client: sheets_v4.Sheets,
  spreadsheetId: string,
  tabName: string,
) {
  const values = await client.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!A1:K`,
  });

  return Math.max(values.data.values?.length ?? 0, 1);
}

async function createSheetIfMissing(
  client: sheets_v4.Sheets,
  spreadsheetId: string,
  tabName: string,
) {
  const existingSheet = await getSheetInfo(client, spreadsheetId, tabName);

  if (existingSheet) {
    return existingSheet;
  }

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

  const created = await getSheetInfo(client, spreadsheetId, tabName);

  if (!created || created.properties?.sheetId === undefined) {
    throw new Error("Failed to create the destination Google Sheets tab.");
  }

  return created;
}

export async function ensureSheetTable() {
  console.log("[ensureSheetTable] Starting...");
  const { client, spreadsheetId, tabName } = await getSheetsClient();
  console.log("[ensureSheetTable] Connected. Tab:", tabName, "| Spreadsheet:", spreadsheetId.slice(0, 8) + "...");
  const sheet = await createSheetIfMissing(client, spreadsheetId, tabName);
  const sheetId = sheet.properties?.sheetId;
  console.log("[ensureSheetTable] Sheet found/created. sheetId:", sheetId);

  if (sheetId === undefined) {
    throw new Error("Failed to resolve the destination sheet ID.");
  }

  const usedRowCount = await getUsedRowCount(client, spreadsheetId, tabName);
  console.log("[ensureSheetTable] Used row count:", usedRowCount);

  await client.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabName}!A1:K1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [HEADERS],
    },
  });

  const refreshedSheet = await getSheetInfo(client, spreadsheetId, tabName);
  const existingTable = refreshedSheet?.tables?.[0] ?? null;
  console.log("[ensureSheetTable] Existing table:", existingTable?.tableId ?? "none");

  const tableRange = {
    sheetId,
    startRowIndex: 0,
    endRowIndex: usedRowCount,
    startColumnIndex: 0,
    endColumnIndex: HEADERS.length,
  };

  const tableDefinition: sheets_v4.Schema$Table = {
    tableId: existingTable?.tableId ?? undefined,
    name: existingTable?.name ?? TABLE_NAME,
    range: tableRange,
    columnProperties: HEADERS.map((header, index) => ({
      columnIndex: index,
      columnName: header,
    })),
    rowsProperties: {
      headerColorStyle: {
        rgbColor: {
          red: 0.129,
          green: 0.369,
          blue: 0.298,
        },
      },
      firstBandColorStyle: {
        rgbColor: {
          red: 0.964,
          green: 0.98,
          blue: 0.972,
        },
      },
      secondBandColorStyle: {
        rgbColor: {
          red: 0.91,
          green: 0.949,
          blue: 0.933,
        },
      },
    },
  };

  if (existingTable?.tableId) {
    await client.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            updateTable: {
              table: tableDefinition,
              fields: "name,range,columnProperties,rowsProperties",
            },
          },
        ],
      },
    });

    return existingTable.tableId;
  }

  const addResponse = await client.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addTable: {
            table: tableDefinition,
          },
        },
      ],
      includeSpreadsheetInResponse: false,
    },
  });

  const tableId = addResponse.data.replies?.[0]?.addTable?.table?.tableId;

  if (!tableId) {
    throw new Error("Failed to create the Google Sheets native table.");
  }

  return tableId;
}

// ---------------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------------

function normalizeForComparison(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Reads all data rows from the sheet and returns them as ExistingSheetRow[].
 */
export async function fetchExistingRows(): Promise<ExistingSheetRow[]> {
  const { client, spreadsheetId, tabName } = await getSheetsClient();
  console.log("[fetchExistingRows] Reading from tab:", tabName);

  let response;
  try {
    response = await client.spreadsheets.values.get({
      spreadsheetId,
      range: `${tabName}!A2:K`,
    });
  } catch (err) {
    console.error("[fetchExistingRows] Sheets API error:", err);
    // If the tab doesn't exist yet, return empty
    console.log("[fetchExistingRows] Returning empty (tab may not exist yet)");
    return [];
  }

  const rawRows = response.data.values ?? [];
  console.log("[fetchExistingRows] Raw rows found:", rawRows.length);

  return rawRows.map((row, index) => {
    const priceRaw = row[COL.unitPrice] ?? null;
    const parsed = priceRaw !== null && priceRaw !== "" ? Number(priceRaw) : null;

    return {
      rowNumber: index + 2,
      supermarketTag: String(row[COL.supermarketTag] ?? ""),
      originalName: String(row[COL.originalName] ?? ""),
      unitPrice: parsed !== null && Number.isFinite(parsed) ? parsed : null,
    };
  });
}

/**
 * Checks a list of items against existing sheet data and returns sync status per item.
 */
export function checkForDuplicates(
  items: ReceiptItem[],
  supermarketTag: string | null,
  existingRows: ExistingSheetRow[],
): ItemSyncResult[] {
  const normalizedTag = normalizeForComparison(supermarketTag ?? "");

  return items.map((item) => {
    const normalizedName = normalizeForComparison(item.originalName);

    const match = existingRows.find(
      (row) =>
        normalizeForComparison(row.supermarketTag) === normalizedTag &&
        normalizeForComparison(row.originalName) === normalizedName,
    );

    if (!match) {
      return {
        itemId: item.id,
        status: "new" as const,
        existingPrice: null,
        newPrice: item.unitPrice,
      };
    }

    const pricesMatch =
      match.unitPrice === item.unitPrice ||
      (match.unitPrice !== null &&
        item.unitPrice !== null &&
        Math.abs(match.unitPrice - item.unitPrice) < 0.005);

    if (pricesMatch) {
      return {
        itemId: item.id,
        status: "duplicate" as const,
        existingPrice: match.unitPrice,
        newPrice: item.unitPrice,
      };
    }

    return {
      itemId: item.id,
      status: "price_changed" as const,
      existingPrice: match.unitPrice,
      newPrice: item.unitPrice,
    };
  });
}

/**
 * Find the 1-based row number of an existing row matching the given tag + name.
 */
function findExistingRowNumber(
  existingRows: ExistingSheetRow[],
  supermarketTag: string,
  originalName: string,
): number | null {
  const normalizedTag = normalizeForComparison(supermarketTag);
  const normalizedName = normalizeForComparison(originalName);

  const match = existingRows.find(
    (row) =>
      normalizeForComparison(row.supermarketTag) === normalizedTag &&
      normalizeForComparison(row.originalName) === normalizedName,
  );

  return match?.rowNumber ?? null;
}

// ---------------------------------------------------------------------------
// Smart sync: append new items, update changed prices, skip duplicates
// ---------------------------------------------------------------------------

export type SyncSummary = {
  added: number;
  updated: number;
  skipped: number;
};

/**
 * Convert a ReceiptItem into a flat array of cell values matching HEADERS order.
 */
function itemToRow(draft: ReceiptDraft, item: ReceiptItem): Array<string | number | null> {
  return [
    draft.supermarketName ?? "",
    draft.supermarketTag ?? "",
    item.originalName,
    item.translatedNameEn,
    item.translatedNameEs,
    item.unitPrice,
    draft.currency ?? "",
    item.quantityValue,
    item.quantityUnit,
    item.pricePerMeasureValue,
    item.pricePerMeasureUnit,
  ];
}

export async function syncReceiptToSheet(
  draft: ReceiptDraft,
  decisions: SyncDecision[],
  existingRows: ExistingSheetRow[],
): Promise<SyncSummary> {
  console.log("[syncReceiptToSheet] Starting sync. Items:", draft.items.length, "| Decisions:", decisions.length, "| Existing rows:", existingRows.length);
  const { client, spreadsheetId, tabName } = await getSheetsClient();
  await ensureSheetTable();

  // Resolve sheetId once for all update requests
  const sheetInfo = await getSheetInfo(client, spreadsheetId, tabName);
  const sheetId = sheetInfo?.properties?.sheetId ?? 0;
  console.log("[syncReceiptToSheet] Resolved sheetId:", sheetId);

  const decisionMap = new Map(decisions.map((d) => [d.itemId, d.action]));
  const summary: SyncSummary = { added: 0, updated: 0, skipped: 0 };

  const rowsToAppend: Array<Array<string | number | null>> = [];
  const updateRequests: sheets_v4.Schema$Request[] = [];

  for (const item of draft.items) {
    const action = decisionMap.get(item.id) ?? "skip";
    console.log("[syncReceiptToSheet] Item:", item.originalName, "| Action:", action);

    if (action === "skip") {
      summary.skipped++;
      continue;
    }

    if (action === "add") {
      rowsToAppend.push(itemToRow(draft, item));
      summary.added++;
      continue;
    }

    if (action === "update") {
      const rowNumber = findExistingRowNumber(
        existingRows,
        draft.supermarketTag ?? "",
        item.originalName,
      );
      console.log("[syncReceiptToSheet] Update target row:", rowNumber);

      if (rowNumber) {
        const rowValues = itemToRow(draft, item);

        updateRequests.push({
          updateCells: {
            range: {
              sheetId,
              startRowIndex: rowNumber - 1,
              endRowIndex: rowNumber,
              startColumnIndex: 0,
              endColumnIndex: HEADERS.length,
            },
            rows: [toRowData(rowValues.map((v) => (v === "" ? null : v)))],
            fields: "userEnteredValue",
          },
        });
        summary.updated++;
      } else {
        console.log("[syncReceiptToSheet] Row not found for update, falling back to add");
        rowsToAppend.push(itemToRow(draft, item));
        summary.added++;
      }
    }
  }

  // Execute updates via batchUpdate
  if (updateRequests.length > 0) {
    console.log("[syncReceiptToSheet] Executing", updateRequests.length, "update requests...");
    await client.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: updateRequests },
    });
    console.log("[syncReceiptToSheet] Updates done.");
  }

  // Append new items via values.append (reliable, no native-table dependency)
  if (rowsToAppend.length > 0) {
    console.log("[syncReceiptToSheet] Appending", rowsToAppend.length, "new items via values.append...");
    await client.spreadsheets.values.append({
      spreadsheetId,
      range: `${tabName}!A1:K1`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: rowsToAppend.map((row) =>
          row.map((v) => (v === null ? "" : v)),
        ),
      },
    });
    console.log("[syncReceiptToSheet] Append done.");
  }

  console.log("[syncReceiptToSheet] Final summary:", JSON.stringify(summary));
  return summary;
}

/**
 * @deprecated Use syncReceiptToSheet with duplicate detection instead.
 */
export async function appendReceiptToSheet(draft: ReceiptDraft) {
  const { client, spreadsheetId } = await getSheetsClient();
  const tableId = await ensureSheetTable();

  const rows = draft.items.map((item) =>
    toRowData([
      draft.supermarketName ?? "",
      draft.supermarketTag ?? "",
      item.originalName,
      item.translatedNameEn,
      item.translatedNameEs,
      item.unitPrice,
      draft.currency ?? "",
      item.quantityValue,
      item.quantityUnit,
      item.pricePerMeasureValue,
      item.pricePerMeasureUnit,
    ]),
  );

  if (rows.length === 0) {
    throw new Error("There are no receipt items to append to Google Sheets.");
  }

  await client.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          appendCells: {
            tableId,
            rows,
            fields: "userEnteredValue",
          },
        },
      ],
    },
  });
}
