import { NextResponse } from "next/server";

import { checkDraftDuplicates } from "@/lib/receipt-service";
import { reviewSubmissionSchema } from "@/lib/schema";

type RouteProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, { params }: RouteProps) {
  try {
    console.log("[check] Parsing request body...");
    const payload = reviewSubmissionSchema.parse(await request.json());
    const { id } = await params;
    console.log("[check] Draft ID:", id, "| Items:", payload.items.length);
    const results = await checkDraftDuplicates(id, payload);
    console.log("[check] Results:", JSON.stringify(results));

    return NextResponse.json({ results });
  } catch (error) {
    console.error("[check] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to check for duplicates.",
      },
      { status: 400 },
    );
  }
}
