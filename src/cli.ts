import { fileURLToPath } from "node:url";
import { Command } from "commander";

import { listCommand } from "./commands/list.js";
import { openCommand } from "./commands/open.js";
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
    .command("list")
    .description("List spikes.")
    .action(() => listCommand(options));

  program
    .command("open")
    .argument("<name>", "Spike name to activate.")
    .description("Set the active spike.")
    .action((name: string) => openCommand(name, options));

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
