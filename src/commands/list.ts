import { loadConfig } from "../state/config.js";
import type { PathResolverOptions } from "../state/paths.js";
import { getActiveSpikeName, listSpikes } from "../state/spike.js";
import { out } from "../ui/output.js";

export async function listCommand(
  options: PathResolverOptions = {},
): Promise<void> {
  const config = await loadConfig(options);
  const spikes = await listSpikes(options);

  if (spikes.length === 0) {
    out.info(
      `No spikes found in ${config.spikeDir}. Run \`hunch new\` to create one.`,
    );
    return;
  }

  const activeName = await getActiveSpikeName(options);
  for (const spike of spikes) {
    out.info(`${spike.name}${spike.name === activeName ? " [active]" : ""}`);
  }
}
