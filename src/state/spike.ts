import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { HunchError } from "../utils/errors.js";
import { todayStamp } from "../utils/time.js";
import { loadConfig } from "./config.js";
import { createPathResolver, type PathResolverOptions } from "./paths.js";

export interface SpikeRef {
  name: string;
  dir: string;
  appDir: string;
  hunchDir: string;
}

export async function listSpikes(
  options: PathResolverOptions = {},
): Promise<SpikeRef[]> {
  const config = await loadConfig(options);
  const entries = await readdir(config.spikeDir, { withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return [];
      }

      throw error;
    },
  );

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => spikeRef(config.spikeDir, entry.name))
    .sort((a, b) => b.name.localeCompare(a.name));
}

export async function setActiveSpike(
  name: string,
  options: PathResolverOptions = {},
): Promise<void> {
  const paths = createPathResolver(options);
  await mkdir(paths.hunchDir, { recursive: true });
  await writeFile(paths.activePath, `${name}\n`, "utf8");
}

export async function getActiveSpike(
  options: PathResolverOptions = {},
): Promise<SpikeRef> {
  const paths = createPathResolver(options);
  const config = await loadConfig(options);
  let active: string;

  try {
    active = (await readFile(paths.activePath, "utf8")).trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new HunchError(
        "No active spike. Run `hunch list` or `hunch open <name>`.",
      );
    }

    throw error;
  }

  if (!active) {
    throw new HunchError("No active spike. Run `hunch open <name>`.");
  }

  return spikeRef(config.spikeDir, active);
}

export function buildSpikeName(slug: string, date = new Date()): string {
  return `${todayStamp(date)}-${slug}`;
}

export function spikeRef(spikeDir: string, name: string): SpikeRef {
  const dir = path.join(spikeDir, name);

  return {
    name,
    dir,
    appDir: path.join(dir, "app"),
    hunchDir: path.join(dir, ".hunch"),
  };
}
