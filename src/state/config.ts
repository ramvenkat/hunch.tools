import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

import { HunchError } from "../utils/errors.js";
import { createPathResolver, type PathResolverOptions } from "./paths.js";

export interface HunchConfig {
  provider: "anthropic";
  model: string;
  apiKeyEnv: string;
  spikeDir: string;
  pushBackOnScopeCreep: boolean;
  logDecisions: boolean;
}

export async function ensureHunchDir(
  options: PathResolverOptions = {},
): Promise<void> {
  const paths = createPathResolver(options);
  await mkdir(paths.hunchDir, { recursive: true });
}

export async function loadConfig(
  options: PathResolverOptions = {},
): Promise<HunchConfig> {
  const paths = createPathResolver(options);
  await mkdir(paths.hunchDir, { recursive: true });

  let parsed: ConfigYaml = {};
  try {
    parsed = parseConfig(YAML.parse(await readFile(paths.configPath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  return {
    provider: parsed.provider ?? "anthropic",
    model: parsed.model ?? "claude-3-5-sonnet-latest",
    apiKeyEnv: parsed.api_key_env ?? "ANTHROPIC_API_KEY",
    spikeDir: expandHome(parsed.spike_dir ?? paths.defaultSpikeDir, paths.homeDir),
    pushBackOnScopeCreep:
      parsed.agent?.push_back_on_scope_creep ??
      parsed.push_back_on_scope_creep ??
      true,
    logDecisions: parsed.agent?.log_decisions ?? parsed.log_decisions ?? true,
  };
}

interface ConfigYaml {
  provider?: "anthropic";
  model?: string;
  api_key_env?: string;
  spike_dir?: string;
  push_back_on_scope_creep?: boolean;
  log_decisions?: boolean;
  agent?: {
    push_back_on_scope_creep?: boolean;
    log_decisions?: boolean;
  };
}

function parseConfig(value: unknown): ConfigYaml {
  if (value == null) {
    return {};
  }

  if (!isRecord(value)) {
    throw invalidConfig("root must be an object");
  }

  const config: ConfigYaml = {};

  if ("provider" in value) {
    if (value.provider !== "anthropic") {
      throw invalidConfig('provider must be "anthropic"');
    }
    config.provider = value.provider;
  }

  if ("model" in value) {
    config.model = readOptionalString(value.model, "model");
  }

  if ("api_key_env" in value) {
    config.api_key_env = readOptionalString(value.api_key_env, "api_key_env");
  }

  if ("spike_dir" in value) {
    config.spike_dir = readOptionalString(value.spike_dir, "spike_dir");
  }

  if ("push_back_on_scope_creep" in value) {
    config.push_back_on_scope_creep = readOptionalBoolean(
      value.push_back_on_scope_creep,
      "push_back_on_scope_creep",
    );
  }

  if ("log_decisions" in value) {
    config.log_decisions = readOptionalBoolean(
      value.log_decisions,
      "log_decisions",
    );
  }

  if ("agent" in value) {
    if (!isRecord(value.agent)) {
      throw invalidConfig("agent must be an object");
    }

    config.agent = {};

    if ("push_back_on_scope_creep" in value.agent) {
      config.agent.push_back_on_scope_creep = readOptionalBoolean(
        value.agent.push_back_on_scope_creep,
        "agent.push_back_on_scope_creep",
      );
    }

    if ("log_decisions" in value.agent) {
      config.agent.log_decisions = readOptionalBoolean(
        value.agent.log_decisions,
        "agent.log_decisions",
      );
    }
  }

  return config;
}

function readOptionalString(value: unknown, key: string): string {
  if (typeof value !== "string") {
    throw invalidConfig(`${key} must be a string`);
  }

  return value;
}

function readOptionalBoolean(value: unknown, key: string): boolean {
  if (typeof value !== "boolean") {
    throw invalidConfig(`${key} must be a boolean`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidConfig(message: string): HunchError {
  return new HunchError(`Invalid Hunch config: ${message}`);
}

function expandHome(value: string, homeDir: string): string {
  if (value === "~") {
    return homeDir;
  }

  if (value.startsWith("~/")) {
    return path.join(homeDir, value.slice(2));
  }

  return value;
}
