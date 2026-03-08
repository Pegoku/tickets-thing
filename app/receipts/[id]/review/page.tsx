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
          paddingTop: 24,
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
        }}
      >
        <Link href="/">Back to uploads</Link>
        <span>{draft.id}</span>
      </div>
      <ReviewEditor draft={draft} />
    </main>
  );
}
