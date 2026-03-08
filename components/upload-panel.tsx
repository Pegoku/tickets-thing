"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { ReceiptDraft } from "@/lib/schema";

import styles from "./upload-panel.module.css";

type UploadPanelProps = {
  recentDrafts: ReceiptDraft[];
  configStatus: {
    hasGemini: boolean;
    hasSheets: boolean;
    uploadMaxMb: number;
    maxReceiptPages: number;
    storageDir: string;
    sheetTabName: string;
  };
};

export function UploadPanel({ recentDrafts, configStatus }: UploadPanelProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const fileSummary = useMemo(() => {
    if (files.length === 0) {
      return "PDFs or images";
    }

    return files.map((file) => file.name).join(", ");
  }, [files]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (files.length === 0) {
      setError("Choose at least one PDF or image first.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));

      const response = await fetch("/api/receipts", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as { error?: string; receiptId?: string };

      if (!response.ok || !payload.receiptId) {
        throw new Error(payload.error ?? "Upload failed.");
      }

      router.push(`/receipts/${payload.receiptId}/review`);
      router.refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.shell}>
      <section className={styles.hero}>
        <div className={styles.eyebrow}>tickets-thing</div>
        <h1>Turn grocery tickets into a reviewable price table.</h1>
        <p className={styles.copy}>
          Drop in scans, phone photos, or PDFs. PDF pages are converted into images,
          Gemini extracts the line items, and you approve the final rows before they go
          into Google Sheets.
        </p>

        <div className={styles.badges}>
          <span data-ready={configStatus.hasGemini}>Gemini {configStatus.hasGemini ? "ready" : "missing"}</span>
          <span data-ready={configStatus.hasSheets}>Sheets {configStatus.hasSheets ? "ready" : "missing"}</span>
          <span>Max {configStatus.uploadMaxMb} MB</span>
          <span>{configStatus.maxReceiptPages} PDF pages</span>
        </div>
      </section>

      <section className={styles.panel}>
        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.dropzone}>
            <input
              type="file"
              name="files"
              accept="application/pdf,image/*"
              multiple
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            />
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--fg-muted)", marginBottom: "8px" }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            <span className={styles.dropTitle}>Upload ticket scans</span>
            <span className={styles.dropCopy}>
              Images are normalized. PDFs are split into page images automatically.
            </span>
            <span className={styles.fileSummary}>{fileSummary}</span>
          </label>

          <button className={styles.primaryAction} disabled={isSubmitting} type="submit">
            {isSubmitting ? "Processing..." : "Process with Gemini"}
          </button>

          {error ? <p className={styles.error}>{error}</p> : null}
        </form>

        <div className={styles.metaGrid}>
          <article>
            <h2>What gets extracted</h2>
            <ul>
              <li>Original product names as printed</li>
              <li>Generic normalized item name</li>
              <li>English and Spanish translations</li>
              <li>Unit price and price per kg/l when available</li>
              <li>Supermarket name and sortable supermarket tag</li>
            </ul>
          </article>

          <article>
            <h2>Export shape</h2>
            <ul>
              <li>One Google Sheets row per item</li>
              <li>Filterable header row on the configured tab</li>
              <li>Receipt metadata repeated for sorting and analysis</li>
              <li>Manual review before any sync happens</li>
            </ul>
          </article>
        </div>
      </section>

      <section className={styles.recentSection}>
        <div className={styles.sectionHeading}>
          <h2>Recent drafts</h2>
          <p>Stored locally in `{configStatus.storageDir}` until you confirm them.</p>
        </div>

        {recentDrafts.length === 0 ? (
          <div className={styles.emptyState}>No drafts yet. Your first upload will appear here.</div>
        ) : (
          <div className={styles.recentList}>
            {recentDrafts.map((draft) => (
              <a key={draft.id} className={styles.recentCard} href={`/receipts/${draft.id}/review`}>
                <div>
                  <p className={styles.recentName}>{draft.supermarketName || "Untitled receipt"}</p>
                  <p className={styles.recentMeta}>
                    {draft.items.length} items · {draft.pages.length} pages · {draft.status}
                  </p>
                </div>
                <span>{new Date(draft.updatedAt).toLocaleString()}</span>
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
