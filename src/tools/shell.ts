import { spawn } from "node:child_process";

import { HunchError } from "../utils/errors.js";

export interface RunShellToolInput {
  command: string;
}

const NPM_INSTALL = "npm install";
const NPM_RUN_PATTERN = /^npm run [a-zA-Z0-9:_-]+$/;
const SHADCN_ADD_PATTERN = /^npx shadcn(?:@[a-zA-Z0-9._-]+)? add [a-zA-Z0-9:_-]+$/;

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

export async function runShellTool(
  cwd: string,
  input: RunShellToolInput,
): Promise<string> {
  if (!isAllowedShellCommand(input.command)) {
    throw new HunchError(`Shell command is not allowlisted: ${input.command}`);
  }

  const [command, args] = parseAllowedCommand(input.command);

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      reject(new HunchError(`Failed to run shell command: ${error.message}`));
    });

    child.on("close", (code) => {
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
}
