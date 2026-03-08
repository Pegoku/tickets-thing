import { NextResponse } from "next/server";

import { updateDraftReview } from "@/lib/receipt-service";
import { reviewSubmissionSchema } from "@/lib/schema";

type RouteProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const payload = reviewSubmissionSchema.parse(await request.json());
    const { id } = await params;
    await updateDraftReview(id, payload);

    return NextResponse.json({ message: "Draft updated." });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save review." },
      { status: 400 },
    );
  }
}
