import { input } from "@inquirer/prompts";

import { createAnthropicClient } from "../agent/anthropic.js";
import { runAgentLoop } from "../agent/loop.js";
import { loadConfig } from "../state/config.js";
import type { PathResolverOptions } from "../state/paths.js";
import { getActiveSpike } from "../state/spike.js";

export interface AskCommandOptions extends PathResolverOptions {
  verbose?: boolean;
}

export async function askCommand(
  message?: string,
  options: AskCommandOptions = {},
): Promise<void> {
  const config = await loadConfig(options);
  const spike = await getActiveSpike(options);
  const client = createAnthropicClient({
    apiKey: process.env[config.apiKeyEnv],
    model: config.model,
  });

  if (message !== undefined && message.trim().length > 0) {
    await runAgentLoop({ client, spike, message, verbose: options.verbose });
    process.stdout.write("\n");
    return;
  }

  while (true) {
    const nextMessage = await input({ message: "hunch" });
    if (nextMessage.trim().length === 0) {
      return;
    }

    await runAgentLoop({
      client,
      spike,
      message: nextMessage,
      verbose: options.verbose,
    });
    process.stdout.write("\n");
  }
}
