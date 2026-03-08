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

type SaveState = "idle" | "saving" | "checking" | "confirming";

type ItemSyncResult = {
  itemId: string;
  status: "new" | "duplicate" | "price_changed";
  existingPrice: number | null;
  newPrice: number | null;
};

type ItemDecision = "add" | "skip" | "update";

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

  // Duplicate checking state
  const [syncResults, setSyncResults] = useState<ItemSyncResult[] | null>(null);
  const [decisions, setDecisions] = useState<Map<string, ItemDecision>>(new Map());

  const totals = useMemo(() => {
    const pricedItems = form.items.filter((item) => item.unitPrice !== null);
    const total = pricedItems.reduce((sum, item) => sum + (item.unitPrice ?? 0), 0);

    return {
      total,
      pricedItems: pricedItems.length,
    };
  }, [form.items]);

  const syncSummary = useMemo(() => {
    if (!syncResults) return null;

    const newCount = syncResults.filter((r) => r.status === "new").length;
    const duplicateCount = syncResults.filter((r) => r.status === "duplicate").length;
    const priceChangedCount = syncResults.filter((r) => r.status === "price_changed").length;

    return { new: newCount, duplicate: duplicateCount, priceChanged: priceChangedCount };
  }, [syncResults]);

  function getItemSyncResult(itemId: string): ItemSyncResult | undefined {
    return syncResults?.find((r) => r.itemId === itemId);
  }

  function getItemDecision(itemId: string): ItemDecision {
    if (decisions.has(itemId)) {
      return decisions.get(itemId)!;
    }

    const result = getItemSyncResult(itemId);
    if (!result) return "add";

    // Default decisions based on status
    if (result.status === "new") return "add";
    if (result.status === "duplicate") return "skip";
    return "skip"; // price_changed defaults to skip, user must explicitly choose
  }

  function setItemDecision(itemId: string, decision: ItemDecision) {
    setDecisions((prev) => {
      const next = new Map(prev);
      next.set(itemId, decision);
      return next;
    });
  }

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

    // Clear sync results when items change since they're now stale
    setSyncResults(null);
    setDecisions(new Map());
  }

  async function persistSave() {
    setError(null);
    setMessage(null);
    setSaveState("saving");

    try {
      const response = await fetch(`/api/receipts/${draft.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const payload = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Request failed.");
      }

      setMessage(payload.message ?? "Draft saved.");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Request failed.");
    } finally {
      setSaveState("idle");
    }
  }

  async function checkDuplicates() {
    setError(null);
    setMessage(null);
    setSaveState("checking");

    try {
      const response = await fetch(`/api/receipts/${draft.id}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const payload = (await response.json()) as {
        error?: string;
        results?: ItemSyncResult[];
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to check duplicates.");
      }

      const results = payload.results ?? [];
      setSyncResults(results);

      // Reset decisions to defaults
      const defaultDecisions = new Map<string, ItemDecision>();
      for (const result of results) {
        if (result.status === "new") {
          defaultDecisions.set(result.itemId, "add");
        } else if (result.status === "duplicate") {
          defaultDecisions.set(result.itemId, "skip");
        } else {
          defaultDecisions.set(result.itemId, "skip");
        }
      }
      setDecisions(defaultDecisions);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Request failed.");
    } finally {
      setSaveState("idle");
    }
  }

  async function confirmToSheets() {
    setError(null);
    setMessage(null);
    setSaveState("confirming");

    try {
      const decisionList = form.items.map((item) => ({
        itemId: item.id,
        action: getItemDecision(item.id),
      }));

      const response = await fetch(`/api/receipts/${draft.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submission: form, decisions: decisionList }),
      });

      const payload = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Request failed.");
      }

      setMessage(payload.message ?? "Synced to Google Sheets.");
      setSyncResults(null);
      setDecisions(new Map());
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Request failed.");
    } finally {
      setSaveState("idle");
    }
  }

  function getSyncStatusLabel(itemId: string): string | null {
    const result = getItemSyncResult(itemId);
    if (!result) return null;

    if (result.status === "new") return "New";
    if (result.status === "duplicate") return "Already exists";
    if (result.status === "price_changed") {
      return `Price changed (was ${result.existingPrice ?? "?"})`;
    }
    return null;
  }

  function getSyncStatusClass(itemId: string): string {
    const result = getItemSyncResult(itemId);
    if (!result) return "";

    if (result.status === "new") return styles.syncNew;
    if (result.status === "duplicate") return styles.syncDuplicate;
    if (result.status === "price_changed") return styles.syncChanged;
    return "";
  }

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.card}>
          <p className={styles.label}>Price registry</p>
          <h1>{form.supermarketName || "Untitled supermarket"}</h1>
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

          {syncSummary ? (
            <div className={styles.syncSummary}>
              <p className={styles.label}>Duplicate check results</p>
              <div className={styles.syncStats}>
                {syncSummary.new > 0 && (
                  <span className={styles.syncStatNew}>{syncSummary.new} new</span>
                )}
                {syncSummary.duplicate > 0 && (
                  <span className={styles.syncStatDuplicate}>
                    {syncSummary.duplicate} existing
                  </span>
                )}
                {syncSummary.priceChanged > 0 && (
                  <span className={styles.syncStatChanged}>
                    {syncSummary.priceChanged} price changed
                  </span>
                )}
              </div>
            </div>
          ) : null}

          <div className={styles.actionRow}>
            <button
              className={styles.secondaryAction}
              disabled={saveState !== "idle"}
              onClick={() => void persistSave()}
              type="button"
            >
              {saveState === "saving" ? "Saving..." : "Save draft"}
            </button>

            {!syncResults ? (
              <button
                className={styles.primaryAction}
                disabled={saveState !== "idle"}
                onClick={() => void checkDuplicates()}
                type="button"
              >
                {saveState === "checking" ? "Checking..." : "Check & sync to Sheets"}
              </button>
            ) : (
              <button
                className={styles.primaryAction}
                disabled={saveState !== "idle"}
                onClick={() => void confirmToSheets()}
                type="button"
              >
                {saveState === "confirming" ? "Syncing..." : "Confirm to Sheets"}
              </button>
            )}
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
            <p className={styles.label}>Review extracted products</p>
            <h2>Edit product names and prices before syncing to the registry.</h2>
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
                {syncResults && <th>Status</th>}
                {syncResults && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {form.items.map((item, index) => {
                const syncResult = getItemSyncResult(item.id);
                const decision = getItemDecision(item.id);

                return (
                  <tr
                    key={item.id}
                    className={`${getSyncStatusClass(item.id)} ${syncResults && decision === "skip" ? styles.rowSkipped : ""}`}
                  >
                    <td>{index + 1}</td>
                    <td>
                      <input
                        value={item.originalName}
                        onChange={(event) =>
                          updateItem(index, "originalName", event.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        value={item.translatedNameEn}
                        onChange={(event) =>
                          updateItem(index, "translatedNameEn", event.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        value={item.translatedNameEs}
                        onChange={(event) =>
                          updateItem(index, "translatedNameEs", event.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        inputMode="decimal"
                        value={item.unitPrice ?? ""}
                        onChange={(event) =>
                          updateItem(index, "unitPrice", event.target.value)
                        }
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
                          onChange={(event) =>
                            updateItem(index, "quantityValue", event.target.value)
                          }
                        />
                        <input
                          value={item.quantityUnit ?? ""}
                          onChange={(event) =>
                            updateItem(index, "quantityUnit", event.target.value)
                          }
                        />
                      </div>
                    </td>

                    {syncResults && (
                      <td>
                        <span className={styles.syncBadge} data-sync={syncResult?.status}>
                          {getSyncStatusLabel(item.id) ?? "Unknown"}
                        </span>
                      </td>
                    )}

                    {syncResults && (
                      <td>
                        {syncResult?.status === "new" ? (
                          <span className={styles.decisionLabel}>Will add</span>
                        ) : syncResult?.status === "duplicate" ? (
                          <span className={styles.decisionLabel}>Will skip</span>
                        ) : syncResult?.status === "price_changed" ? (
                          <select
                            className={styles.decisionSelect}
                            value={decision}
                            onChange={(event) =>
                              setItemDecision(item.id, event.target.value as ItemDecision)
                            }
                          >
                            <option value="skip">Skip</option>
                            <option value="update">Update price</option>
                          </select>
                        ) : null}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
