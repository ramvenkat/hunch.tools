import { stat } from "node:fs/promises";

import { loadConfig } from "../state/config.js";
import { setActiveSpike, spikeRef } from "../state/spike.js";
import { out } from "../ui/output.js";
import { HunchError } from "../utils/errors.js";

export async function openCommand(name: string): Promise<void> {
  const config = await loadConfig();
  const spike = spikeRef(config.spikeDir, name);

  const spikeStats = await stat(spike.dir).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        throw new HunchError(`Spike not found: ${name}`);
      }

      throw error;
    },
  );

  if (!spikeStats.isDirectory()) {
    throw new HunchError(`Spike not found: ${name}`);
  }

  await setActiveSpike(name);
  out.success(`Active spike: ${name}`);
}
