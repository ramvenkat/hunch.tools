import { readFile } from "node:fs/promises";
import path from "node:path";
import { select as promptSelect } from "@inquirer/prompts";

import type { PathResolverOptions } from "../state/paths.js";
import { getActiveSpike } from "../state/spike.js";
import {
  markDecision,
  parseDecisionEntries,
  type DecisionStatus,
} from "../tools/ux-decisions.js";
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

  const decisions = parseDecisionEntries(text);
  const pendingDecisions = decisions
    .filter((decision) => decision.status === "pending")
    .map((decision) => decision.title);

  if (pendingDecisions.length === 0) {
    out.info(
      decisions.length > 0
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

async function defaultSelectDecision(
  config: Parameters<SelectDecision>[0],
): Promise<DecisionChoice> {
  return promptSelect<DecisionChoice>(config);
}
