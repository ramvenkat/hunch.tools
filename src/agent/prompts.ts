import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function renderTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g, (_, key: string) => {
    return values[key] ?? "";
  });
}

export async function loadPrompt(
  name: string,
  values: Record<string, string>,
): Promise<string> {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const promptPath = join(moduleDir, "..", "prompts", `${name}.md`);
  const template = await readFile(promptPath, "utf8");

  return renderTemplate(template, values);
}
