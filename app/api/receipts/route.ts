import { NextResponse } from "next/server";

import { createDraftFromUpload } from "@/lib/receipt-service";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const result = await createDraftFromUpload(formData);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to process receipt upload.",
      },
      { status: 400 },
    );
  }
}
