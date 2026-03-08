import { NextResponse } from "next/server";
import { z } from "zod";

import { confirmDraft } from "@/lib/receipt-service";
import { reviewSubmissionSchema } from "@/lib/schema";

const syncDecisionSchema = z.object({
  itemId: z.string().min(1),
  action: z.enum(["add", "skip", "update"]),
});

const confirmPayloadSchema = z.object({
  submission: reviewSubmissionSchema,
  decisions: z.array(syncDecisionSchema),
});

type RouteProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, { params }: RouteProps) {
  try {
    console.log("[confirm] Parsing request body...");
    const body = await request.json();
    const { submission, decisions } = confirmPayloadSchema.parse(body);
    const { id } = await params;
    console.log("[confirm] Draft ID:", id, "| Items:", submission.items.length, "| Decisions:", decisions.length);
    console.log("[confirm] Decisions:", JSON.stringify(decisions));
    const { summary } = await confirmDraft(id, submission, decisions);
    console.log("[confirm] Summary:", JSON.stringify(summary));

    const parts: string[] = [];
    if (summary.added > 0) parts.push(`${summary.added} added`);
    if (summary.updated > 0) parts.push(`${summary.updated} updated`);
    if (summary.skipped > 0) parts.push(`${summary.skipped} skipped`);

    const message = parts.length > 0
      ? `Sync complete: ${parts.join(", ")}.`
      : "Nothing to sync.";

    return NextResponse.json({ message, summary });
  } catch (error) {
    console.error("[confirm] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to confirm receipt into Google Sheets.",
      },
      { status: 400 },
    );
  }
}
