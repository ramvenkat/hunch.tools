import {
  createAnthropicClient as createDefaultAnthropicClient,
  type AnthropicClientOptions,
} from "./anthropic.js";
import type { AgentProviderClient } from "./client.js";
import {
  createLocalClient as createDefaultLocalClient,
  getLocalModelStatus,
  type LocalModelDeps,
} from "./local.js";
import type { HunchConfig, ProviderMode } from "../state/config.js";
import { HunchError } from "../utils/errors.js";

export type ProviderPreference = ProviderMode | "cloud";

export interface ResolveAgentClientOptions {
  config: HunchConfig;
  preference?: ProviderPreference;
  env?: NodeJS.ProcessEnv;
  localModelDeps?: LocalModelDeps;
  createAnthropicClient?: (
    options: AnthropicClientOptions,
  ) => AgentProviderClient;
  createLocalClient?: (config: HunchConfig) => AgentProviderClient;
}

export interface ResolvedAgentClient {
  client: AgentProviderClient;
  provider: AgentProviderClient["provider"];
  fallbackReason?: string;
}

export async function resolveAgentClient(
  options: ResolveAgentClientOptions,
): Promise<ResolvedAgentClient> {
  const preference = options.preference ?? options.config.provider;

  if (preference === "cloud" || preference === "anthropic") {
    return {
      client: createAnthropicProvider(options),
      provider: "anthropic",
    };
  }

  if (preference === "local") {
    await assertLocalReady(options);
    return {
      client: createLocalProvider(options),
      provider: "local",
    };
  }

  const status = await getLocalModelStatus(
    options.config,
    options.localModelDeps,
  );
  if (status.ready) {
    return {
      client: createLocalProvider(options),
      provider: "local",
    };
  }

  return {
    client: createAnthropicProvider(options),
    provider: "anthropic",
    fallbackReason: status.enabled
      ? "local model is not installed"
      : "local model is disabled",
  };
}

export function providerPreferenceFromFlags(options: {
  local?: boolean;
  cloud?: boolean;
}): ProviderPreference | undefined {
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

async function assertLocalReady(
  options: ResolveAgentClientOptions,
): Promise<void> {
  const status = await getLocalModelStatus(
    options.config,
    options.localModelDeps,
  );

  if (status.ready) {
    return;
  }

  if (!status.enabled) {
    throw new HunchError("Local provider requested, but local is disabled.");
  }

  throw new HunchError(
    [
      "Local provider requested, but the local model is not installed.",
      "Run `hunch local setup` or use `--cloud`.",
      `Expected model path: ${status.modelPath}`,
    ].join("\n"),
  );
}

function createAnthropicProvider(
  options: ResolveAgentClientOptions,
): AgentProviderClient {
  const factory = options.createAnthropicClient ?? createDefaultAnthropicClient;

  return factory({
    apiKey: (options.env ?? process.env)[options.config.apiKeyEnv],
    model: options.config.model,
  });
}

function createLocalProvider(
  options: ResolveAgentClientOptions,
): AgentProviderClient {
  const factory = options.createLocalClient ?? createDefaultLocalClient;
  return factory(options.config);
}
