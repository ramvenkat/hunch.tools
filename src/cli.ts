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

if (import.meta.url === `file://${process.argv[1]}`) {
  await buildCli().parseAsync(process.argv);
}
