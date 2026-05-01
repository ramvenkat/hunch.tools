import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { input as promptInput, select as promptSelect } from "@inquirer/prompts";

import { createAnthropicClient } from "../agent/anthropic.js";
import type { AgentProviderClient } from "../agent/client.js";
import { runAgentLoop } from "../agent/loop.js";
import type { RunAgentLoopOptions } from "../agent/loop.js";
import { loadConfig } from "../state/config.js";
import type { PathResolverOptions } from "../state/paths.js";
import { getActiveSpike, type SpikeRef } from "../state/spike.js";
import {
  markDecision,
  parseDecisionEntries,
  type DecisionEntry,
  type DecisionStatus,
} from "../tools/ux-decisions.js";
import { out } from "../ui/output.js";
import { HunchError } from "../utils/errors.js";

type DecisionChoice = DecisionStatus | "push_back" | "skip";
type SelectDecision = (config: {
  message: string;
  choices: Array<{ name: string; value: DecisionChoice }>;
}) => Promise<DecisionChoice>;
type InputDecision = (config: { message: string }) => Promise<string>;
type AgentRunner = (options: RunAgentLoopOptions) => Promise<string>;

export interface DecideCommandOptions extends PathResolverOptions {
  select?: SelectDecision;
  input?: InputDecision;
  client?: AgentProviderClient;
  runAgent?: AgentRunner;
  env?: NodeJS.ProcessEnv;
  verbose?: boolean;
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
  const pendingDecisions = decisions.filter(
    (decision) => decision.status === "pending",
  );

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
      message: decision.title,
      choices: [
        { name: "Approve", value: "approved" },
        { name: "Push back", value: "push_back" },
        { name: "Mark superseded", value: "superseded" },
        { name: "Mark removed", value: "removed" },
        { name: "Skip", value: "skip" },
      ],
    });

    if (status === "push_back") {
      await pushBackOnDecision(file, decision, spike, options);
      continue;
    }

    if (status !== "skip") {
      await markDecision(file, decision.title, status);
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

async function pushBackOnDecision(
  file: string,
  decision: DecisionEntry,
  spike: SpikeRef,
  options: DecideCommandOptions,
): Promise<void> {
  const pushback = (
    await (options.input ?? promptInput)({
      message: "What pushback should the agent address?",
    })
  ).trim();

  if (pushback.length === 0) {
    throw new HunchError("Pushback text is required.");
  }

  const originalDecisionFile = await readFile(file, "utf8");
  await markDecision(file, decision.title, "superseded");

  try {
    const config = await loadConfig(options);
    const client =
      options.client ??
      createAnthropicClient({
        apiKey: (options.env ?? process.env)[config.apiKeyEnv],
        model: config.model,
      });
    const runAgent = options.runAgent ?? runAgentLoop;

    await runAgent({
      client,
      spike,
      verbose: options.verbose,
      progress: true,
      message: [
        "The user pushed back on a pending UX decision.",
        "",
        `Decision: ${decision.title}`,
        `Original rationale: ${decision.rationale}`,
        `User pushback: ${pushback}`,
        "",
        "Revisit the prototype direction with this decision context. Update files as needed and log any new replacement decision.",
      ].join("\n"),
    });
  } catch (error) {
    await writeFile(file, originalDecisionFile, "utf8");
    throw error;
  }
}
