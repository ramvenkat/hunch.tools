import { fileURLToPath } from "node:url";
import { Command } from "commander";

import { askCommand } from "./commands/ask.js";
import { listCommand } from "./commands/list.js";
import { newCommand } from "./commands/new.js";
import { openCommand } from "./commands/open.js";
import { runCommand } from "./commands/run.js";
import type { PathResolverOptions } from "./state/paths.js";
import { out } from "./ui/output.js";
import { HunchError } from "./utils/errors.js";

export function buildCli(options: PathResolverOptions = {}): Command {
  const program = new Command();

  program
    .name("hunch")
    .description("Turn a customer problem into a disposable prototype.")
    .version("0.1.0");

  program
    .command("new")
    .description("Start a new spike.")
    .action(() => newCommand(options));

  program
    .command("list")
    .description("List spikes.")
    .action(() => listCommand(options));

  program
    .command("open")
    .argument("<name>", "Spike name to activate.")
    .description("Set the active spike.")
    .action((name: string) => openCommand(name, options));

  program
    .command("run")
    .description("Run the active spike.")
    .option("--demo", "Run with VITE_HUNCH_DEMO=1")
    .action((commandOptions: { demo?: boolean }) =>
      runCommand({ ...options, ...commandOptions }),
    );

  program
    .command("ask")
    .argument("[message...]", "Message to send to the active spike agent.")
    .description("Ask the active spike agent for help.")
    .option("--verbose", "Print tool activity.")
    .action(
      (
        messageParts: string[] | undefined,
        commandOptions: { verbose?: boolean },
      ) =>
        askCommand(messageParts?.join(" "), {
          ...options,
          ...commandOptions,
        }),
    );

  return program;
}

export async function runCli(
  argv = process.argv,
  options: PathResolverOptions = {},
): Promise<void> {
  try {
    await buildCli(options).parseAsync(argv);
  } catch (error) {
    if (error instanceof HunchError) {
      out.error(error.message);
      process.exitCode = error.exitCode;
      return;
    }

    throw error;
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  await runCli();
}
