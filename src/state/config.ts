import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

import { createPathResolver, type PathResolverOptions } from "./paths.js";

export interface HunchConfig {
  provider: "anthropic";
  model: string;
  apiKeyEnv: string;
  spikeDir: string;
  pushBackOnScopeCreep: boolean;
  logDecisions: boolean;
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
    parsed = YAML.parse(await readFile(paths.configPath, "utf8")) ?? {};
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

function expandHome(value: string, homeDir: string): string {
  if (value === "~") {
    return homeDir;
  }

  if (value.startsWith("~/")) {
    return path.join(homeDir, value.slice(2));
  }

  return value;
}
