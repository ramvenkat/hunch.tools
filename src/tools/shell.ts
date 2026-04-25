import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";

import { HunchError } from "../utils/errors.js";

export interface RunShellToolInput {
  command: string;
}

export interface RunShellToolOptions {
  timeoutMs?: number;
  outputCapBytes?: number;
}

const NPM_INSTALL = "npm install";
const NPM_RUN_PATTERN = /^npm run [a-zA-Z0-9:_-]+$/;
const SHADCN_ADD_PATTERN = /^npx shadcn(?:@[a-zA-Z0-9._-]+)? add [a-zA-Z0-9:_-]+$/;
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_OUTPUT_CAP_BYTES = 200 * 1024;
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

export function isAllowedShellCommand(command: string): boolean {
  const trimmed = command.trim();
  return (
    trimmed === NPM_INSTALL ||
    NPM_RUN_PATTERN.test(trimmed) ||
    SHADCN_ADD_PATTERN.test(trimmed)
  );
}

function parseAllowedCommand(command: string): [string, string[]] {
  const trimmed = command.trim();
  return [trimmed.split(" ")[0] ?? "", trimmed.split(" ").slice(1)];
}

function formatOutput(stdout: string, stderr: string): string {
  return [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
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

async function assertCwd(cwd: string): Promise<string> {
  const resolved = path.resolve(cwd);

  try {
    const stats = await stat(resolved);
    if (!stats.isDirectory()) {
      throw new HunchError(`run_shell cwd must be an existing directory: ${cwd}`);
    }
  } catch (error) {
    if (error instanceof HunchError) {
      throw error;
    }
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new HunchError(`run_shell cwd must be an existing directory: ${cwd}`);
    }
    throw error;
  }

  return resolved;
}

function killChild(child: ReturnType<typeof spawn>): void {
  if (child.pid === undefined) {
    return;
  }

  try {
    if (process.platform === "win32") {
      child.kill("SIGTERM");
    } else {
      process.kill(-child.pid, "SIGTERM");
    }
  } catch {
    child.kill("SIGTERM");
  }
}

export async function runShellTool(
  cwd: string,
  input: RunShellToolInput,
  options: RunShellToolOptions = {},
): Promise<string> {
  if (!isAllowedShellCommand(input.command)) {
    throw new HunchError(`Shell command is not allowlisted: ${input.command}`);
  }

  const resolvedCwd = await assertCwd(cwd);
  const [command, args] = parseAllowedCommand(input.command);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const outputCapBytes = options.outputCapBytes ?? DEFAULT_OUTPUT_CAP_BYTES;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: resolvedCwd,
      detached: process.platform !== "win32",
      env: buildSafeEnv(),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    let settled = false;

    const finish = (callback: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      callback();
    };

    const timeout = setTimeout(() => {
      killChild(child);
      finish(() => {
        reject(
          new HunchError(
            `Shell command timed out after ${timeoutMs}ms: ${input.command}`,
          ),
        );
      });
    }, timeoutMs);
    timeout.unref();

    const appendOutput = (stream: "stdout" | "stderr", chunk: string): void => {
      outputBytes += Buffer.byteLength(chunk, "utf8");
      if (outputBytes > outputCapBytes) {
        killChild(child);
        finish(() => {
          reject(
            new HunchError(
              `Shell command output exceeded ${outputCapBytes} bytes: ${input.command}`,
            ),
          );
        });
        return;
      }

      if (stream === "stdout") {
        stdout += chunk;
      } else {
        stderr += chunk;
      }
    };

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      appendOutput("stdout", chunk);
    });
    child.stderr.on("data", (chunk: string) => {
      appendOutput("stderr", chunk);
    });

    child.on("error", (error) => {
      finish(() => {
        reject(new HunchError(`Failed to run shell command: ${error.message}`));
      });
    });

    child.on("close", (code) => {
      finish(() => {
        const output = formatOutput(stdout, stderr);

        if (code === 0) {
          resolve(output);
          return;
        }

        reject(
          new HunchError(
            `Shell command failed with exit code ${code ?? "unknown"}.\n${output}`,
            typeof code === "number" ? code : 1,
          ),
        );
      });
    });
  });
}
