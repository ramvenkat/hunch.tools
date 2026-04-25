import { fileURLToPath } from "node:url";
import { Command } from "commander";

import { listCommand } from "./commands/list.js";
import { openCommand } from "./commands/open.js";
import { out } from "./ui/output.js";
import { HunchError } from "./utils/errors.js";

export function buildCli(): Command {
  const program = new Command();

  program
    .name("hunch")
    .description("Turn a customer problem into a disposable prototype.")
    .version("0.1.0");

  program.command("list").description("List spikes.").action(listCommand);

  program
    .command("open")
    .argument("<name>", "Spike name to activate.")
    .description("Set the active spike.")
    .action(openCommand);

  return program;
}

export async function runCli(argv = process.argv): Promise<void> {
  await buildCli().parseAsync(argv);
}

async function main(): Promise<void> {
  try {
    await runCli();
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
  await main();
}
