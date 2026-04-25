import { Command } from "commander";

export function buildCli(): Command {
  const program = new Command();

  program
    .name("hunch")
    .description("Turn a customer problem into a disposable prototype.")
    .version("0.1.0");

  program.command("list").description("List spikes.").action(() => {
    console.log("No spikes yet.");
  });

  return program;
}

export async function runCli(argv = process.argv): Promise<void> {
  await buildCli().parseAsync(argv);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runCli();
}
