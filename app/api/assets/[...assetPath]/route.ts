import { NextResponse } from "next/server";

import { readStoredAsset } from "@/lib/storage";

type RouteProps = {
  params: Promise<{
    assetPath: string[];
  }>;
};

function getMimeType(filePath: string) {
  if (filePath.endsWith(".png")) {
    return "image/png";
  }

  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (filePath.endsWith(".webp")) {
    return "image/webp";
  }

  return "application/octet-stream";
}

export async function GET(_: Request, { params }: RouteProps) {
  try {
    const { assetPath } = await params;
    const joinedPath = assetPath.join("/");
    const buffer = await readStoredAsset(joinedPath);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": getMimeType(joinedPath),
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  }
}
