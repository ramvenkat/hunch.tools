import { readFile } from "node:fs/promises";
import path from "node:path";
import { select as promptSelect } from "@inquirer/prompts";

import type { PathResolverOptions } from "../state/paths.js";
import { getActiveSpike } from "../state/spike.js";
import { markDecision, type DecisionStatus } from "../tools/ux-decisions.js";
import { out } from "../ui/output.js";

type DecisionChoice = DecisionStatus | "skip";
type SelectDecision = (config: {
  message: string;
  choices: Array<{ name: string; value: DecisionChoice }>;
}) => Promise<DecisionChoice>;

export interface DecideCommandOptions extends PathResolverOptions {
  select?: SelectDecision;
}

export async function decideCommand(
  options: DecideCommandOptions = {},
): Promise<void> {
  const spike = await getActiveSpike(options);
  const file = path.join(spike.hunchDir, "decisions.md");
  const text = await readDecisionFile(file);

  if (text === undefined) {
    out.info("No UX decisions logged yet.");
    return;
  }

  const pendingDecisions = parsePendingDecisionTitles(text);
  if (pendingDecisions.length === 0) {
    out.info(
      hasDecisionSections(text)
        ? "No pending UX decisions."
        : "No UX decisions logged yet.",
    );
    return;
  }

  const selectDecision = options.select ?? defaultSelectDecision;
  for (const decision of pendingDecisions) {
    const status = await selectDecision({
      message: decision,
      choices: [
        { name: "Approve", value: "approved" },
        { name: "Mark superseded", value: "superseded" },
        { name: "Mark removed", value: "removed" },
        { name: "Skip", value: "skip" },
      ],
    });

    if (status !== "skip") {
      await markDecision(file, decision, status);
    }
  }

  out.success("Decision review complete.");
}

async function readDecisionFile(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

function parsePendingDecisionTitles(text: string): string[] {
  return parseDecisionSections(text)
    .filter((section) => section.status === "pending")
    .map((section) => section.title);
}

function hasDecisionSections(text: string): boolean {
  return parseDecisionSections(text).length > 0;
}

function parseDecisionSections(text: string): Array<{
  title: string;
  status: DecisionStatus | "pending";
}> {
  const entryPattern =
    /^## ([^\r\n]+)\n\nStatus: (pending|approved|superseded|removed)\nTime: ([^\r\n]+)$/gm;
  const sections: Array<{ title: string; status: DecisionStatus | "pending" }> =
    [];
  let match: RegExpExecArray | null;

  while ((match = entryPattern.exec(text)) !== null) {
    sections.push({
      title: match[1] ?? "",
      status: (match[2] ?? "pending") as DecisionStatus | "pending",
    });
  }

  return sections;
}

async function defaultSelectDecision(
  config: Parameters<SelectDecision>[0],
): Promise<DecisionChoice> {
  return promptSelect<DecisionChoice>(config);
}
