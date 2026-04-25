import { HunchError } from "../utils/errors.js";

export interface SeedData {
  items: Array<{ title: string; body: string }>;
}

export function parseSeedDataJson(text: string): SeedData {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new HunchError(`Invalid seed data JSON: ${message}`);
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("items" in parsed) ||
    !Array.isArray(parsed.items)
  ) {
    throw new HunchError("Seed data JSON must include an items array.");
  }

  const items = parsed.items.map((item, index) => {
    if (
      typeof item !== "object" ||
      item === null ||
      !("title" in item) ||
      !("body" in item) ||
      typeof item.title !== "string" ||
      typeof item.body !== "string"
    ) {
      throw new HunchError(
        `Seed data item ${index} must include string title and body.`,
      );
    }

    return {
      title: item.title,
      body: item.body,
    };
  });

  return { items };
}
