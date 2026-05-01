import { input } from "@inquirer/prompts";

import { runAgentLoop } from "../agent/loop.js";
import {
  providerPreferenceFromFlags,
  resolveAgentClient,
  type ResolveAgentClientOptions,
  type ResolvedAgentClient,
} from "../agent/provider-router.js";
import { loadConfig } from "../state/config.js";
import type { PathResolverOptions } from "../state/paths.js";
import { getActiveSpike } from "../state/spike.js";

export interface AskCommandOptions extends PathResolverOptions {
  verbose?: boolean;
  local?: boolean;
  cloud?: boolean;
  anthropic?: boolean;
  openai?: boolean;
  maxToolIterations?: number;
  repair?: boolean;
  env?: NodeJS.ProcessEnv;
  resolveClient?: (
    options: ResolveAgentClientOptions,
  ) => Promise<ResolvedAgentClient>;
  runAgent?: typeof runAgentLoop;
}

export async function askCommand(
  message?: string,
  options: AskCommandOptions = {},
): Promise<void> {
  const config = await loadConfig(options);
  const spike = await getActiveSpike(options);
  const preference = providerPreferenceFromFlags(options);
  const { client } = await (options.resolveClient ?? resolveAgentClient)({
    config,
    preference,
    env: options.env,
  });
  const runAgent = options.runAgent ?? runAgentLoop;

  if (message !== undefined && message.trim().length > 0) {
    await runAgent({
      client,
      spike,
      message: options.repair ? repairMessage(message) : message,
      verbose: options.verbose,
      progress: true,
      maxToolIterations: options.maxToolIterations,
    });
    process.stdout.write("\n");
    return;
  }

  while (true) {
    const nextMessage = await input({ message: "hunch" });
    if (nextMessage.trim().length === 0) {
      return;
    }

    await runAgent({
      client,
      spike,
      message: options.repair ? repairMessage(nextMessage) : nextMessage,
      verbose: options.verbose,
      progress: true,
      maxToolIterations: options.maxToolIterations,
    });
    process.stdout.write("\n");
  }
}

function repairMessage(message: string): string {
  return [
    "Repair mode: fix the active spike with the smallest safe change.",
    "",
    "Rules:",
    "- Do not redesign the prototype.",
    "- Focus on broken builds, malformed files, truncated files, and obvious runtime blockers.",
    "- Prefer editing existing files over creating new architecture.",
    "- Do not read package.json unless the build error specifically requires dependency or script context.",
    "- After fixing files, run the narrowest useful verification command available.",
    "",
    `User repair request: ${message}`,
  ].join("\n");
}
