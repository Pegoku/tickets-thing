import "server-only";

import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { getOptionalEnv } from "@/lib/env";
import { receiptDraftSchema, type ReceiptDraft } from "@/lib/schema";

const RECEIPTS_DIR = "receipts";

function getBaseDir() {
  return getOptionalEnv().STORAGE_DIR;
}

function getReceiptsRoot() {
  return path.join(getBaseDir(), RECEIPTS_DIR);
}

export async function ensureStorageDirs() {
  await mkdir(getReceiptsRoot(), { recursive: true });
}

export async function createReceiptWorkspace() {
  await ensureStorageDirs();

  const id = randomUUID();
  const receiptDir = path.join(getReceiptsRoot(), id);

  await mkdir(path.join(receiptDir, "originals"), { recursive: true });
  await mkdir(path.join(receiptDir, "pages"), { recursive: true });

  return {
    id,
    receiptDir,
  };
}

export function getReceiptDir(id: string) {
  return path.join(getReceiptsRoot(), id);
}

export function getDraftPath(id: string) {
  return path.join(getReceiptDir(id), "draft.json");
}

export async function writeReceiptBuffer(
  receiptId: string,
  relativePath: string,
  buffer: Buffer,
) {
  const absolutePath = path.join(getReceiptDir(receiptId), relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buffer);
  return relativePath;
}

export async function saveDraft(draft: ReceiptDraft) {
  await writeFile(getDraftPath(draft.id), JSON.stringify(draft, null, 2), "utf8");
}

export async function loadDraft(id: string) {
  const raw = await readFile(getDraftPath(id), "utf8");
  return receiptDraftSchema.parse(JSON.parse(raw));
}

export async function listRecentDrafts(limit = 8) {
  await ensureStorageDirs();

  const entries = await readdir(getReceiptsRoot(), { withFileTypes: true });

  const drafts = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const draftPath = getDraftPath(entry.name);

        try {
          const [raw, draftStat] = await Promise.all([
            readFile(draftPath, "utf8"),
            stat(draftPath),
          ]);

          return {
            draft: receiptDraftSchema.parse(JSON.parse(raw)),
            updatedTime: draftStat.mtimeMs,
          };
        } catch {
          return null;
        }
      }),
  );

  return drafts
    .filter((value): value is { draft: ReceiptDraft; updatedTime: number } => value !== null)
    .sort((a, b) => b.updatedTime - a.updatedTime)
    .slice(0, limit)
    .map((entry) => entry.draft);
}

export async function readStoredAsset(relativeFilePath: string) {
  const safePath = path.normalize(relativeFilePath);

  if (safePath.startsWith("..") || path.isAbsolute(safePath)) {
    throw new Error("Invalid asset path.");
  }

  const absolutePath = path.join(getBaseDir(), RECEIPTS_DIR, safePath);
  return readFile(absolutePath);
}
