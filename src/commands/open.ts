import { stat } from "node:fs/promises";

import { loadConfig } from "../state/config.js";
import type { PathResolverOptions } from "../state/paths.js";
import { setActiveSpike, spikeRef } from "../state/spike.js";
import { out } from "../ui/output.js";
import { HunchError } from "../utils/errors.js";

export async function openCommand(
  name: string,
  options: PathResolverOptions = {},
): Promise<void> {
  const config = await loadConfig(options);
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

  await setActiveSpike(name, options);
  out.success(`Active spike: ${name}`);
}
