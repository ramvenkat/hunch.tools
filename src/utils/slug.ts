const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "or",
  "the",
  "to",
  "of",
  "for",
  "in",
  "on",
]);

export function slugifyProblem(input: string, maxWords = 5): string {
  const words = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0 && !STOP_WORDS.has(word))
    .slice(0, maxWords);

  return words.length > 0 ? words.join("-") : "untitled-spike";
}
