import { appendFile, readFile, writeFile } from "node:fs/promises";

import { HunchError } from "../utils/errors.js";

export type DecisionStatus = "approved" | "superseded" | "removed";

export interface DecisionInput {
  decision: string;
  rationale: string;
  ts: string;
}

export async function appendDecision(
  file: string,
  input: DecisionInput,
): Promise<string> {
  await appendFile(
    file,
    [
      `## ${input.decision}`,
      "",
      "Status: pending",
      `Time: ${input.ts}`,
      "",
      input.rationale,
      "",
      "",
    ].join("\n"),
    "utf8",
  );

  return `Logged decision: ${input.decision}`;
}

export async function markDecision(
  file: string,
  decision: string,
  status: DecisionStatus,
): Promise<string> {
  const content = await readFile(file, "utf8");
  const sections = findDecisionSections(content, decision);

  if (sections.length === 0) {
    throw new HunchError(`Decision not found: ${decision}`);
  }

  for (const section of sections) {
    const sectionContent = content.slice(section.start, section.end);
    const nextSectionContent = sectionContent.replace(
      /^Status: pending$/m,
      `Status: ${status}`,
    );

    if (nextSectionContent !== sectionContent) {
      await writeFile(
        file,
        content.slice(0, section.start) +
          nextSectionContent +
          content.slice(section.end),
        "utf8",
      );
      return `Marked decision ${status}: ${decision}`;
    }
  }

  throw new HunchError(`Decision is not pending: ${decision}`);
}

function findDecisionSections(
  content: string,
  decision: string,
): Array<{ start: number; end: number }> {
  const sections: Array<{ start: number; end: number }> = [];
  const headingPattern = /^## (.+)$/gm;
  const headings: Array<{ title: string; start: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = headingPattern.exec(content)) !== null) {
    headings.push({ title: match[1] ?? "", start: match.index });
  }

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    if (heading?.title !== decision) {
      continue;
    }

    sections.push({
      start: heading.start,
      end: headings[index + 1]?.start ?? content.length,
    });
  }

  return sections;
}
