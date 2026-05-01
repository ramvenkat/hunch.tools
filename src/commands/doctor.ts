import { spawn } from "node:child_process";

import { getLocalModelStatus, type LocalModelDeps, type LocalModelStatus } from "../agent/local.js";
import { loadConfig } from "../state/config.js";
import type { PathResolverOptions } from "../state/paths.js";
import { getActiveSpike, type SpikeRef } from "../state/spike.js";
import { out } from "../ui/output.js";

export interface BuildCheckResult {
  ok: boolean;
  output: string;
}

export interface DoctorCommandOptions extends PathResolverOptions {
  env?: NodeJS.ProcessEnv;
  buildRunner?: (appDir: string) => Promise<BuildCheckResult>;
  localModelDeps?: LocalModelDeps;
}

export interface DoctorResult {
  activeSpike: SpikeRef | null;
  keys: {
    openai: boolean;
    anthropic: boolean;
  };
  local: LocalModelStatus;
  build: BuildCheckResult;
}

const SAFE_ENV_KEYS = [
  "PATH",
  "HOME",
  "TMPDIR",
  "TMP",
  "TEMP",
  "SystemRoot",
  "WINDIR",
  "COMSPEC",
  "USERPROFILE",
  "PATHEXT",
] as const;

export async function doctorCommand(
  options: DoctorCommandOptions = {},
): Promise<DoctorResult> {
  const config = await loadConfig(options);
  const env = options.env ?? process.env;
  const activeSpike = await getActiveSpike(options).catch(() => null);
  const local = await getLocalModelStatus(config, options.localModelDeps);
  const build = activeSpike
    ? await (options.buildRunner ?? runBuildCheck)(activeSpike.appDir)
    : { ok: false, output: "No active spike." };

  const result: DoctorResult = {
    activeSpike,
    keys: {
      openai: Boolean(env[config.openai.apiKeyEnv]),
      anthropic: Boolean(env[config.apiKeyEnv]),
    },
    local,
    build,
  };

  out.info(`Active spike: ${activeSpike?.name ?? "none"}`);
  out.info(`OpenAI API key: ${result.keys.openai ? "set" : "missing"}`);
  out.info(`Anthropic API key: ${result.keys.anthropic ? "set" : "missing"}`);
  out.info(`Local model: ${local.ready ? "ready" : "not ready"}`);
  out.info(`Build: ${build.ok ? "pass" : "fail"}`);
  if (!build.ok && build.output.length > 0) {
    out.info(build.output);
  }

  return result;
}

export async function runBuildCheck(appDir: string): Promise<BuildCheckResult> {
  return new Promise((resolve) => {
    const child = spawn("npm", ["run", "build"], {
      cwd: appDir,
      env: buildSafeEnv(),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      output += chunk;
    });
    child.on("error", (error) => {
      resolve({ ok: false, output: error.message });
    });
    child.on("close", (code) => {
      resolve({ ok: code === 0, output: output.trim() });
    });
  });
}

function buildSafeEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};

  for (const key of SAFE_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }

  return env;
}
