import Link from "next/link";
import { notFound } from "next/navigation";

import { ReviewEditor } from "@/components/review-editor";
import { getDraftById } from "@/lib/receipt-service";

type ReviewPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ReviewPage({ params }: ReviewPageProps) {
  const { id } = await params;
  const draft = await getDraftById(id).catch(() => null);

  if (!draft) {
    notFound();
  }

  return (
    <main>
      <div
        style={{
          paddingTop: 32,
          paddingBottom: 8,
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
          borderBottom: "1px solid var(--border)",
          marginBottom: -16
        }}
      >
        <Link 
          href="/" 
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            color: "var(--fg-muted)",
            fontWeight: 500,
            fontSize: "0.95rem",
            textDecoration: "none"
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          Back to uploads
        </Link>
        <span style={{ 
          fontSize: "0.85rem", 
          fontFamily: "monospace",
          color: "var(--fg-muted)",
          background: "var(--bg-muted)",
          padding: "4px 8px",
          borderRadius: "var(--radius-sm)"
        }}>
          {draft.id}
        </span>
      </div>
      <ReviewEditor draft={draft} />
    </main>
  );
}
