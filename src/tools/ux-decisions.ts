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
  time: string;
  rationale: string;
  start: number;
  end: number;
  statusStart: number;
  statusEnd: number;
  rationaleStart: number;
}

export interface DecisionEntry {
  title: string;
  status: StoredDecisionStatus;
  time: string;
  rationale: string;
  start: number;
  end: number;
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

export function parseDecisionEntries(content: string): DecisionEntry[] {
  return parseDecisionSections(content).map(
    ({ title, status, time, rationale, start, end }) => ({
      title,
      status,
      time,
      rationale,
      start,
      end,
    }),
  );
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

function findDecisionSections(
  content: string,
  decision: string,
): DecisionSection[] {
  return parseDecisionSections(content).filter(
    (section) => section.title === decision,
  );
}

function parseDecisionSections(content: string): DecisionSection[] {
  const entryPattern =
    /^## ([^\r\n]+)\n\nStatus: (pending|approved|superseded|removed)\nTime: ([^\r\n]+)$/gm;
  const sections: DecisionSection[] = [];
  let match: RegExpExecArray | null;

  while ((match = entryPattern.exec(content)) !== null) {
    const title = match[1] ?? "";
    const status = (match[2] ?? "pending") as StoredDecisionStatus;
    const time = match[3] ?? "";
    const statusPrefix = `## ${title}\n\nStatus: `;
    const statusStart = match.index + statusPrefix.length;
    const rationaleStart = entryPattern.lastIndex + 2;

    sections.push({
      title,
      status,
      time,
      rationale: "",
      start: match.index,
      end: content.length,
      statusStart,
      statusEnd: statusStart + status.length,
      rationaleStart,
    });
  }

  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index];
    if (section === undefined) {
      continue;
    }

    section.end = sections[index + 1]?.start ?? content.length;
    section.rationale = content
      .slice(section.rationaleStart, section.end)
      .replace(/\n+$/, "");
  }

  assertNoMalformedDecisionHeadings(content, sections);

  return sections;
}

function assertNoMalformedDecisionHeadings(
  content: string,
  sections: DecisionSection[],
): void {
  const firstSectionStart = sections[0]?.start ?? content.length;
  const uncheckedPrefix = content.slice(0, firstSectionStart);
  const malformedHeading = /^## ([^\r\n]+)$/m.exec(uncheckedPrefix);

  if (malformedHeading !== null) {
    throw new HunchError(
      `Malformed UX decision entry: ${malformedHeading[1]}. Expected Status and Time metadata after the heading.`,
    );
  }
}
