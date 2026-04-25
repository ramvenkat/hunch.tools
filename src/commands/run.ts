import { spawn } from "node:child_process";
import open from "open";
import ora from "ora";

import type { PathResolverOptions } from "../state/paths.js";
import { getActiveSpike } from "../state/spike.js";
import { out } from "../ui/output.js";
import { HunchError } from "../utils/errors.js";

export interface RunCommandOptions extends PathResolverOptions {
  demo?: boolean;
  sigintGraceMs?: number;
}

export interface DevServerHandle {
  stop: () => void;
  wait: Promise<void>;
}

export async function runCommand(
  options: RunCommandOptions = {},
): Promise<void> {
  const server = await startDevServer(options);
  await server.wait;
}

export async function startDevServer(
  options: RunCommandOptions = {},
): Promise<DevServerHandle> {
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

  let stopRequested = false;
  let sigintTimer: ReturnType<typeof setTimeout> | undefined;
  const wait = new Promise<void>((resolve, reject) => {
    let settled = false;
    let interrupted = false;
    const cleanup = (): void => {
      if (sigintTimer) {
        clearTimeout(sigintTimer);
      }

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
      if (interrupted) {
        child.kill("SIGKILL");
        finish(interruptedError());
        return;
      }

      interrupted = true;
      child.kill("SIGINT");
      sigintTimer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(interruptedError());
      }, options.sigintGraceMs ?? 3_000);
    };

    process.on("SIGINT", handleSigint);

    child.on("error", (error) => {
      spinner.fail("Failed to start dev server.");
      finish(
        interrupted
          ? interruptedError()
          : new HunchError(`Failed to start dev server: ${error.message}`),
      );
    });
    child.on("exit", (code, signal) => {
      if (stopRequested) {
        finish();
        return;
      }

      if (interrupted || signal === "SIGINT") {
        finish(interruptedError());
        return;
      }

      if (code && code !== 0) {
        finish(new HunchError(`Dev server exited with code ${code}.`));
        return;
      }

      if (signal) {
        finish(new HunchError(`Dev server exited with signal ${signal}.`));
        return;
      }

      finish();
    });
  });

  const stop = (): void => {
    if (stopRequested) {
      return;
    }

    stopRequested = true;
    child.kill("SIGINT");
    sigintTimer = setTimeout(() => {
      child.kill("SIGKILL");
    }, options.sigintGraceMs ?? 3_000);
  };

  return { stop, wait };
}

function interruptedError(): HunchError {
  return new HunchError("Interrupted.", 130);
}
