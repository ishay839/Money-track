import "server-only";

import OpenAI from "openai";
import { OPENAI_MODEL } from "@/lib/types";
import type {
  AIProvider,
  CategoryForCategorization,
  CategoryMapping,
  PastCorrection,
  TransactionForCategorization,
} from "../types";
import { buildCategorizationPrompt, SYSTEM_PROMPT } from "../prompts";

interface StructuredCategorization {
  mappings: Array<{
    index: number;
    categoryName: string;
    confidence: number;
    isNew: boolean;
  }>;
}

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async categorize(
    transactions: TransactionForCategorization[],
    categories: CategoryForCategorization[],
    options?: { allowProposals?: boolean; pastCorrections?: PastCorrection[] }
  ): Promise<CategoryMapping[]> {
    const allowProposals = options?.allowProposals ?? false;
    const prompt = buildCategorizationPrompt(
      transactions,
      categories,
      allowProposals,
      options?.pastCorrections ?? []
    );
    const categoryNames = categories.map((category) => category.name);
    const categoryTokens = categoryNames.map((_, index) => `category_${index}`);
    const tokenToCategoryName = new Map(
      categoryTokens.map((token, index) => [token, categoryNames[index]])
    );
    const categoryNameSchema =
      !allowProposals && categoryNames.length > 0
        ? { type: "string", enum: categoryTokens }
        : { type: "string" };
    const categoryTokenInstructions = !allowProposals
      ? `\nFor categoryName, return the token from this mapping instead of the category's display name:\n${JSON.stringify(
          categoryTokens.map((token, index) => ({
            token,
            name: categoryNames[index],
          }))
        )}`
      : "";

    const response = await this.client.responses.create({
      model: OPENAI_MODEL,
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 4096,
      instructions: `${SYSTEM_PROMPT}\nThe response schema is authoritative. Return an object with a mappings array, and include isNew on every mapping.`,
      input: `${prompt}\n\nAPI format override: return {"mappings":[...]} instead of a bare array. Set isNew to false for an existing category and true only for a proposed category.${categoryTokenInstructions}`,
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "transaction_categorizations",
          strict: true,
          schema: {
            type: "object",
            properties: {
              mappings: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    index: {
                      type: "integer",
                      minimum: 0,
                      maximum: Math.max(0, transactions.length - 1),
                    },
                    categoryName: categoryNameSchema,
                    confidence: { type: "integer", minimum: 1, maximum: 7 },
                    isNew: { type: "boolean" },
                  },
                  required: ["index", "categoryName", "confidence", "isNew"],
                  additionalProperties: false,
                },
              },
            },
            required: ["mappings"],
            additionalProperties: false,
          },
        },
      },
    });

    if (!response.output_text) {
      throw new Error("OpenAI returned no categorization output");
    }

    const parsed = JSON.parse(response.output_text) as StructuredCategorization;
    const canonicalNames = new Map(
      categoryNames.map((name) => [name.toLowerCase(), name])
    );

    return parsed.mappings.flatMap((mapping) => {
      if (
        !Number.isInteger(mapping.index) ||
        mapping.index < 0 ||
        mapping.index >= transactions.length
      ) {
        return [];
      }

      const rawName = mapping.categoryName.trim();
      const name = tokenToCategoryName.get(rawName) ?? rawName;
      const existingName = canonicalNames.get(name.toLowerCase());
      if (!existingName && !allowProposals) return [];

      return [
        {
          index: mapping.index,
          categoryName: existingName ?? name,
          isNew: !existingName,
          confidence: Math.max(1, Math.min(7, Math.round(mapping.confidence))),
        },
      ];
    });
  }
}
