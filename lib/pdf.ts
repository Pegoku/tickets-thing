import "server-only";

import { createCanvas } from "@napi-rs/canvas";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import sharp from "sharp";

import { getOptionalEnv } from "@/lib/env";

type RenderedPdfPage = {
  pageNumber: number;
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: string;
};

type CanvasAndContext = {
  canvas: {
    width: number;
    height: number;
    toBuffer: (mimeType: string) => Buffer;
  };
  context: object;
};

class CanvasFactory {
  create(width: number, height: number): CanvasAndContext {
    const canvas = createCanvas(width, height) as unknown as CanvasAndContext["canvas"] & {
      getContext: (contextId: "2d") => object;
    };
    const context = canvas.getContext("2d");

    return {
      canvas,
      context,
    };
  }

  reset(target: CanvasAndContext, width: number, height: number) {
    target.canvas.width = width;
    target.canvas.height = height;
  }

  destroy(target: CanvasAndContext) {
    target.canvas.width = 0;
    target.canvas.height = 0;
  }
}

export async function extractPdfPages(buffer: Buffer) {
  const { MAX_RECEIPT_PAGES } = getOptionalEnv();

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false,
    useWorkerFetch: false,
  });

  const pdf = await loadingTask.promise;

  if (pdf.numPages > MAX_RECEIPT_PAGES) {
    throw new Error(
      `PDF has ${pdf.numPages} pages, which exceeds MAX_RECEIPT_PAGES (${MAX_RECEIPT_PAGES}).`,
    );
  }

  const pages: RenderedPdfPage[] = [];
  const canvasFactory = new CanvasFactory();

  try {
    for (let index = 1; index <= pdf.numPages; index += 1) {
      const page = await pdf.getPage(index);
      const viewport = page.getViewport({ scale: 2.2 });

      const target = canvasFactory.create(
        Math.ceil(viewport.width),
        Math.ceil(viewport.height),
      );

      await page.render({
        canvas: target.canvas as never,
        canvasContext: target.context as never,
        viewport,
      }).promise;

      const pngBuffer = target.canvas.toBuffer("image/png");
      const normalized = await sharp(pngBuffer)
        .rotate()
        .flatten({ background: "#ffffff" })
        .png({ compressionLevel: 9 })
        .toBuffer();

      pages.push({
        pageNumber: index,
        buffer: normalized,
        width: Math.ceil(viewport.width),
        height: Math.ceil(viewport.height),
        mimeType: "image/png",
      });

      canvasFactory.destroy(target);
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }

  return pages;
}
