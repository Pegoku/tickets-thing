import "server-only";

import { GoogleGenAI, createPartFromBase64 } from "@google/genai";

import { getGeminiEnv } from "@/lib/env";
import { inferSupermarketTag } from "@/lib/utils";
import { reviewSubmissionSchema } from "@/lib/schema";

type ProcessInputPage = {
  pageNumber: number;
  mimeType: string;
  buffer: Buffer;
};

const receiptJsonSchema = {
  type: "object",
  required: [
    "supermarketName",
    "supermarketTag",
    "purchaseDate",
    "currency",
    "notes",
    "extractionConfidence",
    "items",
  ],
  properties: {
    supermarketName: { type: "string" },
    supermarketTag: { type: "string" },
    purchaseDate: { type: "string" },
    currency: { type: "string" },
    notes: { type: "string" },
    extractionConfidence: { type: "number" },
    items: {
      type: "array",
      items: {
        type: "object",
        required: [
          "originalName",
          "genericName",
          "translatedNameEn",
          "translatedNameEs",
          "quantityValue",
          "quantityUnit",
          "unitPrice",
          "pricePerMeasureValue",
          "pricePerMeasureUnit",
          "pageNumber",
          "confidence",
          "rawText",
        ],
        properties: {
          originalName: { type: "string" },
          genericName: { type: "string" },
          translatedNameEn: { type: "string" },
          translatedNameEs: { type: "string" },
          quantityValue: { type: ["number", "null"] },
          quantityUnit: { type: ["string", "null"] },
          unitPrice: { type: ["number", "null"] },
          pricePerMeasureValue: { type: ["number", "null"] },
          pricePerMeasureUnit: { type: ["string", "null"] },
          pageNumber: { type: ["integer", "null"] },
          confidence: { type: ["number", "null"] },
          rawText: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

export async function extractReceiptData(pages: ProcessInputPage[]) {
  const { apiKey, model } = getGeminiEnv();
  const client = new GoogleGenAI({ apiKey });

  const prompt = [
    "You extract supermarket receipt data from one or more images.",
    "Return only JSON matching the schema.",
    "Rules:",
    "- Preserve original product names exactly as printed when possible.",
    "- genericName should be a short normalized product category/name, such as Tomato, Milk, Wheat Bread, Banana, Olive Oil, or Chicken Breast.",
    "- translatedNameEn must be English.",
    "- translatedNameEs must be Spanish.",
    "- supermarketTag should be a short classification token such as JUMBO or AH when possible.",
    "- If a value is unknown, use null for numeric/nullable fields and empty string for text fields.",
    "- pricePerMeasureValue and pricePerMeasureUnit should only be filled when clearly shown or confidently derived.",
    "- pageNumber should point to the source image page.",
    "- confidence and extractionConfidence must be between 0 and 1.",
    "- Ignore totals, taxes, loyalty lines, and discounts unless they represent product items.",
  ].join("\n");

  const contents = [
    prompt,
    ...pages.map((page) =>
      createPartFromBase64(page.buffer.toString("base64"), page.mimeType),
    ),
  ];

  const response = await client.models.generateContent({
    model,
    contents,
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: receiptJsonSchema,
      temperature: 0.1,
    },
  });

  const raw = response.text;

  if (!raw) {
    throw new Error("Gemini returned an empty response.");
  }

  const parsed = JSON.parse(raw) as Record<string, unknown>;

  const normalized = reviewSubmissionSchema.parse({
    supermarketName: parsed.supermarketName ?? null,
    supermarketTag:
      parsed.supermarketTag || inferSupermarketTag(String(parsed.supermarketName ?? "")),
    purchaseDate: parsed.purchaseDate ?? null,
    currency: parsed.currency ?? null,
    notes: parsed.notes ?? null,
    items: Array.isArray(parsed.items)
      ? parsed.items.map((item, index) => ({
          id: crypto.randomUUID(),
          lineIndex: index,
          originalName: item && typeof item === "object" ? item.originalName ?? "" : "",
          genericName: item && typeof item === "object" ? item.genericName ?? "" : "",
          translatedNameEn:
            item && typeof item === "object" ? item.translatedNameEn ?? "" : "",
          translatedNameEs:
            item && typeof item === "object" ? item.translatedNameEs ?? "" : "",
          quantityValue:
            item && typeof item === "object" && typeof item.quantityValue === "number"
              ? item.quantityValue
              : null,
          quantityUnit:
            item && typeof item === "object" && typeof item.quantityUnit === "string"
              ? item.quantityUnit
              : null,
          unitPrice:
            item && typeof item === "object" && typeof item.unitPrice === "number"
              ? item.unitPrice
              : null,
          pricePerMeasureValue:
            item && typeof item === "object" && typeof item.pricePerMeasureValue === "number"
              ? item.pricePerMeasureValue
              : null,
          pricePerMeasureUnit:
            item && typeof item === "object" && (item.pricePerMeasureUnit === "kg" || item.pricePerMeasureUnit === "l")
              ? item.pricePerMeasureUnit
              : null,
          pageNumber:
            item && typeof item === "object" && typeof item.pageNumber === "number"
              ? item.pageNumber
              : null,
          confidence:
            item && typeof item === "object" && typeof item.confidence === "number"
              ? item.confidence
              : null,
          rawText:
            item && typeof item === "object" && typeof item.rawText === "string"
              ? item.rawText
              : null,
          userEdited: false,
        }))
      : [],
  });

  return {
    ...normalized,
    extractionConfidence:
      typeof parsed.extractionConfidence === "number"
        ? parsed.extractionConfidence
        : null,
    rawResponse: raw,
  };
}
