import { spawn } from "node:child_process";
import open from "open";
import ora from "ora";

import type { PathResolverOptions } from "../state/paths.js";
import { getActiveSpike } from "../state/spike.js";
import { out } from "../ui/output.js";
import { HunchError } from "../utils/errors.js";

export interface RunCommandOptions extends PathResolverOptions {
  demo?: boolean;
}

export async function runCommand(
  options: RunCommandOptions = {},
): Promise<void> {
  const spike = await getActiveSpike(options);
  const spinner = ora(`Starting dev server for ${spike.name}...`).start();
  const env = { ...process.env };
  if (options.demo) {
    env.VITE_HUNCH_DEMO = "1";
  }

  const child = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1"], {
    cwd: spike.appDir,
    env,
    stdio: ["inherit", "pipe", "pipe"],
  });

  let opened = false;
  const openWhenReady = async (chunk: Buffer): Promise<void> => {
    const text = chunk.toString();
    process.stdout.write(text);
    const match = text.match(/http:\/\/127\.0\.0\.1:\d+/);
    if (!match || opened) {
      return;
    }

    opened = true;
    spinner.succeed(`Vite running at ${match[0]}`);

    try {
      await open(match[0]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      out.warn(`Could not open browser: ${message}`);
    }
  };

  child.stdout.on("data", (chunk: Buffer) => {
    void openWhenReady(chunk);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    process.stderr.write(chunk);
  });

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = (): void => {
      process.off("SIGINT", handleSigint);
    };
    const finish = (error?: Error): void => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      if (error) {
        reject(error);
        return;
      }

      resolve();
    };
    const handleSigint = (): void => {
      child.kill("SIGINT");
    };

    process.on("SIGINT", handleSigint);

    child.on("error", (error) => {
      spinner.fail("Failed to start dev server.");
      finish(new HunchError(`Failed to start dev server: ${error.message}`));
    });
    child.on("exit", (code, signal) => {
      if (code && code !== 0) {
        finish(new HunchError(`Dev server exited with code ${code}.`));
        return;
      }

      if (signal && signal !== "SIGINT") {
        finish(new HunchError(`Dev server exited with signal ${signal}.`));
        return;
      }

      finish();
    });
  });
}
