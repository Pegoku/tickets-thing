"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import type { ReceiptDraft, ReviewSubmission } from "@/lib/schema";
import { formatCurrencyValue } from "@/lib/utils";

import styles from "./review-editor.module.css";

type ReviewEditorProps = {
  draft: ReceiptDraft;
};

type SaveState = "idle" | "saving" | "confirming";

export function ReviewEditor({ draft }: ReviewEditorProps) {
  const router = useRouter();
  const [form, setForm] = useState<ReviewSubmission>({
    supermarketName: draft.supermarketName,
    supermarketTag: draft.supermarketTag,
    purchaseDate: draft.purchaseDate,
    currency: draft.currency,
    notes: draft.notes,
    items: draft.items,
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const totals = useMemo(() => {
    const pricedItems = form.items.filter((item) => item.unitPrice !== null);
    const total = pricedItems.reduce((sum, item) => sum + (item.unitPrice ?? 0), 0);

    return {
      total,
      pricedItems: pricedItems.length,
    };
  }, [form.items]);

  function updateItem(index: number, key: keyof ReviewSubmission["items"][number], value: unknown) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [key]: value,
              userEdited: true,
            }
          : item,
      ),
    }));
  }

  async function persist(mode: "save" | "confirm") {
    setError(null);
    setMessage(null);
    setSaveState(mode === "confirm" ? "confirming" : "saving");

    try {
      const response = await fetch(
        mode === "confirm"
          ? `/api/receipts/${draft.id}/confirm`
          : `/api/receipts/${draft.id}/review`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(form),
        },
      );

      const payload = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Request failed.");
      }

      setMessage(
        payload.message ??
          (mode === "confirm"
            ? "Rows confirmed and sent to Google Sheets."
            : "Draft saved."),
      );
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Request failed.");
    } finally {
      setSaveState("idle");
    }
  }

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.card}>
          <p className={styles.label}>Receipt snapshot</p>
          <h1>{form.supermarketName || "Untitled receipt"}</h1>
          <p className={styles.status} data-status={draft.status}>
            {draft.status.replace("_", " ")}
          </p>

          <div className={styles.fieldStack}>
            <label>
              <span>Supermarket</span>
              <input
                value={form.supermarketName ?? ""}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    supermarketName: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>Tag</span>
              <input
                value={form.supermarketTag ?? ""}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    supermarketTag: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>Purchase date</span>
              <input
                placeholder="2026-03-08"
                value={form.purchaseDate ?? ""}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    purchaseDate: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span>Currency</span>
              <input
                placeholder="EUR"
                value={form.currency ?? ""}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    currency: event.target.value.toUpperCase(),
                  }))
                }
              />
            </label>
            <label>
              <span>Notes</span>
              <textarea
                rows={4}
                value={form.notes ?? ""}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
              />
            </label>
          </div>
        </div>

        <div className={styles.card}>
          <p className={styles.label}>Quick stats</p>
          <div className={styles.statGrid}>
            <div>
              <strong>{form.items.length}</strong>
              <span>Items</span>
            </div>
            <div>
              <strong>{draft.pages.length}</strong>
              <span>Pages</span>
            </div>
            <div>
              <strong>{totals.pricedItems}</strong>
              <span>Priced</span>
            </div>
            <div>
              <strong>{formatCurrencyValue(totals.total, form.currency)}</strong>
              <span>Total</span>
            </div>
          </div>

          <div className={styles.actionRow}>
            <button
              className={styles.secondaryAction}
              disabled={saveState !== "idle"}
              onClick={() => void persist("save")}
              type="button"
            >
              {saveState === "saving" ? "Saving..." : "Save draft"}
            </button>
            <button
              className={styles.primaryAction}
              disabled={saveState !== "idle"}
              onClick={() => void persist("confirm")}
              type="button"
            >
              {saveState === "confirming" ? "Syncing..." : "Confirm to Sheets"}
            </button>
          </div>

          {message ? <p className={styles.success}>{message}</p> : null}
          {error ? <p className={styles.error}>{error}</p> : null}
          {draft.syncError ? <p className={styles.error}>{draft.syncError}</p> : null}
        </div>

        <div className={styles.card}>
          <p className={styles.label}>Source pages</p>
          <div className={styles.previewGrid}>
            {draft.pages.map((page) => (
              <Image
                key={page.assetPath}
                alt={`Receipt page ${page.pageNumber}`}
                className={styles.previewImage}
                src={`/api/assets/${page.assetPath}`}
                width={page.width}
                height={page.height}
                unoptimized
              />
            ))}
          </div>
        </div>
      </aside>

      <section className={styles.tableWrap}>
        <div className={styles.tableHeader}>
          <div>
            <p className={styles.label}>Review extracted rows</p>
            <h2>Edit anything Gemini got wrong before syncing.</h2>
          </div>
        </div>

        <div className={styles.tableScroller}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>Original</th>
                <th>English</th>
                <th>Spanish</th>
                <th>Unit price</th>
                <th>Per kg/l</th>
                <th>Qty</th>
                <th>Page</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {form.items.map((item, index) => (
                <tr key={item.id}>
                  <td>{index + 1}</td>
                  <td>
                    <input
                      value={item.originalName}
                      onChange={(event) => updateItem(index, "originalName", event.target.value)}
                    />
                    <textarea
                      rows={2}
                      value={item.rawText ?? ""}
                      onChange={(event) => updateItem(index, "rawText", event.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      value={item.translatedNameEn}
                      onChange={(event) => updateItem(index, "translatedNameEn", event.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      value={item.translatedNameEs}
                      onChange={(event) => updateItem(index, "translatedNameEs", event.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      inputMode="decimal"
                      value={item.unitPrice ?? ""}
                      onChange={(event) => updateItem(index, "unitPrice", event.target.value)}
                    />
                  </td>
                  <td>
                    <div className={styles.inlinePair}>
                      <input
                        inputMode="decimal"
                        value={item.pricePerMeasureValue ?? ""}
                        onChange={(event) =>
                          updateItem(index, "pricePerMeasureValue", event.target.value)
                        }
                      />
                      <select
                        value={item.pricePerMeasureUnit ?? ""}
                        onChange={(event) =>
                          updateItem(
                            index,
                            "pricePerMeasureUnit",
                            event.target.value || null,
                          )
                        }
                      >
                        <option value="">-</option>
                        <option value="kg">kg</option>
                        <option value="l">l</option>
                      </select>
                    </div>
                  </td>
                  <td>
                    <div className={styles.inlinePair}>
                      <input
                        inputMode="decimal"
                        value={item.quantityValue ?? ""}
                        onChange={(event) => updateItem(index, "quantityValue", event.target.value)}
                      />
                      <input
                        value={item.quantityUnit ?? ""}
                        onChange={(event) => updateItem(index, "quantityUnit", event.target.value)}
                      />
                    </div>
                  </td>
                  <td>
                    <input
                      inputMode="numeric"
                      value={item.pageNumber ?? ""}
                      onChange={(event) => updateItem(index, "pageNumber", event.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      inputMode="decimal"
                      value={item.confidence ?? ""}
                      onChange={(event) => updateItem(index, "confidence", event.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
