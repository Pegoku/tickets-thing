import "server-only";

import sharp from "sharp";

const MAX_DIMENSION = 2200;

export async function normalizeUploadedImage(buffer: Buffer) {
  const pipeline = sharp(buffer, { failOn: "none" }).rotate();
  const metadata = await pipeline.metadata();

  const resized = await pipeline
    .resize({
      width: metadata.width && metadata.width > MAX_DIMENSION ? MAX_DIMENSION : undefined,
      height:
        metadata.height && metadata.height > MAX_DIMENSION ? MAX_DIMENSION : undefined,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();

  const normalizedMeta = await sharp(resized).metadata();

  return {
    buffer: resized,
    width: normalizedMeta.width ?? metadata.width ?? 1200,
    height: normalizedMeta.height ?? metadata.height ?? 1600,
    mimeType: "image/jpeg",
  };
}
