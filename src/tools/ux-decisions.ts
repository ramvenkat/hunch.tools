import { appendFile, readFile, writeFile } from "node:fs/promises";

import { HunchError } from "../utils/errors.js";

export type DecisionStatus = "approved" | "superseded" | "removed";
type StoredDecisionStatus = DecisionStatus | "pending";

export interface DecisionInput {
  decision: string;
  rationale: string;
  ts: string;
}

interface DecisionSection {
  title: string;
  status: StoredDecisionStatus;
  start: number;
  end: number;
  statusStart: number;
  statusEnd: number;
}

export async function appendDecision(
  file: string,
  input: DecisionInput,
): Promise<string> {
  validateDecisionTitle(input.decision);

  const existingContent = await readExistingFile(file);
  const duplicatePending = findDecisionSections(
    existingContent,
    input.decision,
  ).some((section) => section.status === "pending");

  if (duplicatePending) {
    throw new HunchError(`Pending decision already exists: ${input.decision}`);
  }

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
  const pendingSections = sections.filter((section) => section.status === "pending");

  if (sections.length === 0) {
    throw new HunchError(`Decision not found: ${decision}`);
  }

  if (pendingSections.length === 0) {
    throw new HunchError(`Decision is not pending: ${decision}`);
  }

  if (pendingSections.length > 1) {
    throw new HunchError(`Multiple pending decisions found: ${decision}`);
  }

  const section = pendingSections[0];
  if (section === undefined) {
    throw new HunchError(`Decision is not pending: ${decision}`);
  }

  await writeFile(
    file,
    content.slice(0, section.statusStart) +
      status +
      content.slice(section.statusEnd),
    "utf8",
  );
  return `Marked decision ${status}: ${decision}`;
}

function validateDecisionTitle(decision: string): void {
  if (decision.includes("\n") || decision.includes("\r")) {
    throw new HunchError("Decision title must be a single line.");
  }

  if (/^\s*#+\s/.test(decision)) {
    throw new HunchError("Decision title must not start with a markdown heading.");
  }
}

async function readExistingFile(file: string): Promise<string> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

function findDecisionSections(content: string, decision: string): DecisionSection[] {
  const entryPattern =
    /^## ([^\r\n]+)\n\nStatus: (pending|approved|superseded|removed)\nTime: ([^\r\n]+)$/gm;
  const sections: DecisionSection[] = [];
  const allSections: DecisionSection[] = [];
  let match: RegExpExecArray | null;

  while ((match = entryPattern.exec(content)) !== null) {
    const title = match[1] ?? "";
    const status = (match[2] ?? "pending") as StoredDecisionStatus;
    const statusPrefix = `## ${title}\n\nStatus: `;
    const statusStart = match.index + statusPrefix.length;

    allSections.push({
      title,
      status,
      start: match.index,
      end: content.length,
      statusStart,
      statusEnd: statusStart + status.length,
    });
  }

  for (let index = 0; index < allSections.length; index += 1) {
    const section = allSections[index];
    if (section === undefined) {
      continue;
    }

    section.end = allSections[index + 1]?.start ?? content.length;
    if (section.title === decision) {
      sections.push(section);
    }
  }

  return sections;
}
