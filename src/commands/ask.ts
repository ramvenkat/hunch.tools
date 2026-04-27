import { input } from "@inquirer/prompts";

import { runAgentLoop } from "../agent/loop.js";
import {
  resolveAgentClient,
  type ProviderPreference,
  type ResolveAgentClientOptions,
  type ResolvedAgentClient,
} from "../agent/provider-router.js";
import { loadConfig } from "../state/config.js";
import type { PathResolverOptions } from "../state/paths.js";
import { getActiveSpike } from "../state/spike.js";
import { HunchError } from "../utils/errors.js";

export interface AskCommandOptions extends PathResolverOptions {
  verbose?: boolean;
  local?: boolean;
  cloud?: boolean;
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
  const preference = getProviderPreference(options);
  const { client } = await (options.resolveClient ?? resolveAgentClient)({
    config,
    preference,
    env: options.env,
  });
  const runAgent = options.runAgent ?? runAgentLoop;

  if (message !== undefined && message.trim().length > 0) {
    await runAgent({ client, spike, message, verbose: options.verbose });
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
      message: nextMessage,
      verbose: options.verbose,
    });
    process.stdout.write("\n");
  }
}

function getProviderPreference(
  options: Pick<AskCommandOptions, "local" | "cloud">,
): ProviderPreference | undefined {
  if (options.local && options.cloud) {
    throw new HunchError("Choose either --local or --cloud, not both.");
  }

  if (options.local) {
    return "local";
  }

  if (options.cloud) {
    return "cloud";
  }

  return undefined;
}
