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
    "This data feeds a price-per-supermarket registry, so generic names must be maximally reusable.",
    "Return only JSON matching the schema.",
    "Rules:",
    "- Preserve original product names exactly as printed when possible.",
    "- translatedNameEn must be a short, generic English product name — the kind you would use as a canonical grocery category.",
    "- translatedNameEs must be a short, generic Spanish product name — the kind you would use as a canonical grocery category.",
    "- IMPORTANT: Strip ALL qualifiers, certifications, and descriptors from translated names. Remove words like: organic, bio, ecological, free-range, gluten-free, sugar-free, light, diet, zero, whole-grain, vegan, lactose-free, fair-trade, artisan, premium, natural, fresh, frozen, canned, smoked, raw, roasted, salted, unsalted, etc. Keep only the core product identity.",
    "- Example: 'AH Biologisch Halfvolle Melk' → translatedNameEn: 'Semi-skimmed Milk', translatedNameEs: 'Leche semidesnatada'.",
    "- Example: 'Pollo Campero Orgánico' → translatedNameEn: 'Chicken', translatedNameEs: 'Pollo'.",
    "- Example: 'Pan Integral Sin Gluten Bio' → translatedNameEn: 'Bread', translatedNameEs: 'Pan'.",
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
