import { NextResponse } from "next/server";

import { confirmDraft } from "@/lib/receipt-service";
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
    await confirmDraft(id, payload);

    return NextResponse.json({ message: "Rows added to Google Sheets." });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to confirm receipt into Google Sheets.",
      },
      { status: 400 },
    );
  }
}
