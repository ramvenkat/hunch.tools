import { fileURLToPath } from "node:url";
import { Command, InvalidArgumentError } from "commander";

import { askCommand } from "./commands/ask.js";
import { decideCommand } from "./commands/decide.js";
import { doctorCommand } from "./commands/doctor.js";
import { listCommand } from "./commands/list.js";
import { localSetupCommand, localStatusCommand } from "./commands/local.js";
import { newCommand } from "./commands/new.js";
import { openCommand } from "./commands/open.js";
import { runCommand } from "./commands/run.js";
import { saveCommand } from "./commands/save.js";
import { showCommand } from "./commands/show.js";
import { statusCommand } from "./commands/status.js";
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
    .option("--local", "Use the local model for initial generation.")
    .option("--cloud", "Use the configured cloud fallback for initial generation.")
    .option("--anthropic", "Use Anthropic for initial generation.")
    .option("--openai", "Use OpenAI for initial generation.")
    .action(
      (commandOptions: {
        local?: boolean;
        cloud?: boolean;
        anthropic?: boolean;
        openai?: boolean;
      }) => newCommand({ ...options, ...commandOptions }),
    );

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
    .command("status")
    .description("Show the active spike state.")
    .action(async () => {
      await statusCommand(options);
    });

  program
    .command("save")
    .argument("[name]", "Saved prototype folder name.")
    .description("Save the active spike to a durable folder.")
    .option("--force", "Overwrite an existing save.")
    .option("--to <dir>", "Directory where saved prototypes are stored.")
    .action(
      (
        name: string | undefined,
        commandOptions: { force?: boolean; to?: string },
      ) => saveCommand(name, { ...options, ...commandOptions }).then(() => undefined),
    );

  program
    .command("doctor")
    .alias("doc")
    .description("Check Hunch configuration and active spike health.")
    .action(async () => {
      await doctorCommand(options);
    });

  program
    .command("ask")
    .argument("[message...]", "Message to send to the active spike agent.")
    .description("Ask the active spike agent for help.")
    .option("--verbose", "Print tool activity.")
    .option("--local", "Use the local model.")
    .option("--cloud", "Use the configured cloud fallback.")
    .option("--anthropic", "Use Anthropic.")
    .option("--openai", "Use OpenAI.")
    .option(
      "--max-tool-iterations <count>",
      "Maximum agent tool batches before stopping.",
      parsePositiveInteger,
    )
    .option("--repair", "Constrain the agent to repairing a broken spike.")
    .action(
      (
        messageParts: string[] | undefined,
        commandOptions: {
          verbose?: boolean;
          local?: boolean;
          cloud?: boolean;
          anthropic?: boolean;
          openai?: boolean;
          maxToolIterations?: number;
          repair?: boolean;
        },
      ) =>
        askCommand(messageParts?.join(" "), {
          ...options,
          ...commandOptions,
        }),
    );

  program
    .command("decide")
    .description("Review UX decisions for the active spike.")
    .action(() => decideCommand(options));

  program
    .command("show")
    .description("Prepare the active spike for a customer interview.")
    .option("--local", "Use the local model.")
    .option("--cloud", "Use the configured cloud fallback.")
    .option("--anthropic", "Use Anthropic.")
    .option("--openai", "Use OpenAI.")
    .action(
      (commandOptions: {
        local?: boolean;
        cloud?: boolean;
        anthropic?: boolean;
        openai?: boolean;
      }) =>
        showCommand({ ...options, ...commandOptions }),
    );

  const local = program
    .command("local")
    .description("Manage the local model used before cloud fallback.");

  local
    .command("status")
    .description("Show local model readiness.")
    .action(async () => {
      await localStatusCommand(options);
    });

  local
    .command("setup")
    .description("Install the configured local model.")
    .action(async () => {
      await localSetupCommand(options);
    });

  return program;
}

function parsePositiveInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new InvalidArgumentError("Expected a positive integer.");
  }

  return parsed;
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
