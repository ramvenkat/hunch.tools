import { getActiveSpike, listSpikes } from "../state/spike.js";
import { loadConfig } from "../state/config.js";
import { HunchError } from "../utils/errors.js";
import { out } from "../ui/output.js";

export async function listCommand(): Promise<void> {
  const config = await loadConfig();
  const spikes = await listSpikes();

  if (spikes.length === 0) {
    out.info(
      `No spikes found in ${config.spikeDir}. Run \`hunch new\` to create one.`,
    );
    return;
  }

  const activeName = await readActiveName();
  for (const spike of spikes) {
    out.info(`${spike.name}${spike.name === activeName ? " [active]" : ""}`);
  }
}

async function readActiveName(): Promise<string | undefined> {
  try {
    return (await getActiveSpike()).name;
  } catch (error) {
    if (
      error instanceof HunchError &&
      error.message.startsWith("No active spike.")
    ) {
      return undefined;
    }

    throw error;
  }
}
