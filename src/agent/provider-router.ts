import {
  createAnthropicClient as createDefaultAnthropicClient,
  type AnthropicClientOptions,
} from "./anthropic.js";
import type { AgentProviderClient } from "./client.js";
import {
  createOpenAIClient as createDefaultOpenAIClient,
  type OpenAIClientOptions,
} from "./openai.js";
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
  createOpenAIClient?: (options: OpenAIClientOptions) => AgentProviderClient;
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

  if (preference === "cloud") {
    return resolveCloudProvider(options, options.config.fallbackProvider);
  }

  if (preference === "anthropic" || preference === "openai") {
    return resolveCloudProvider(options, preference);
  }

  if (preference === "local") {
    await assertLocalReady(options);
    return {
      client: createLocalProvider(options),
      provider: "local",
    };
  }

  if (
    options.config.provider === "anthropic" ||
    options.config.provider === "openai"
  ) {
    return resolveCloudProvider(options, options.config.provider);
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

  const cloud = resolveCloudProvider(options, options.config.fallbackProvider);
  return {
    ...cloud,
    fallbackReason: status.enabled
      ? "local model is not installed"
      : "local model is disabled",
  };
}

function resolveCloudProvider(
  options: ResolveAgentClientOptions,
  provider: "anthropic" | "openai",
): ResolvedAgentClient {
  if (provider === "openai") {
    return {
      client: createOpenAIProvider(options),
      provider: "openai",
    };
  }

  return {
    client: createAnthropicProvider(options),
    provider: "anthropic",
  };
}

export function providerPreferenceFromFlags(options: {
  local?: boolean;
  cloud?: boolean;
  anthropic?: boolean;
  openai?: boolean;
}): ProviderPreference | undefined {
  const selected = [
    options.local ? "local" : undefined,
    options.cloud ? "cloud" : undefined,
    options.anthropic ? "anthropic" : undefined,
    options.openai ? "openai" : undefined,
  ].filter(Boolean);

  if (selected.length > 1) {
    throw new HunchError(
      "Choose only one provider flag: --local, --cloud, --anthropic, or --openai.",
    );
  }

  return selected[0] as ProviderPreference | undefined;
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

function createOpenAIProvider(
  options: ResolveAgentClientOptions,
): AgentProviderClient {
  const factory = options.createOpenAIClient ?? createDefaultOpenAIClient;

  return factory({
    apiKey: (options.env ?? process.env)[options.config.openai.apiKeyEnv],
    model: options.config.openai.model,
  });
}

function createLocalProvider(
  options: ResolveAgentClientOptions,
): AgentProviderClient {
  const factory = options.createLocalClient ?? createDefaultLocalClient;
  return factory(options.config);
}
