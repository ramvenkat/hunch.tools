import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { createPathResolver, type PathResolverOptions } from "../state/paths.js";
import { getActiveSpike, type SpikeRef } from "../state/spike.js";
import { out } from "../ui/output.js";
import { HunchError } from "../utils/errors.js";

export interface SaveCommandOptions extends PathResolverOptions {
  force?: boolean;
  to?: string;
}

export interface SaveResult {
  source: string;
  destination: string;
}

export async function saveCommand(
  name?: string,
  options: SaveCommandOptions = {},
): Promise<SaveResult> {
  const paths = createPathResolver(options);
  const spike = await getActiveSpike(options);
  const saveName = sanitizeSaveName(name ?? spike.name);
  const saveRoot = path.resolve(options.to ?? path.join(paths.homeDir, "hunch-saves"));
  const destination = path.join(saveRoot, saveName);

  if ((await exists(destination)) && !options.force) {
    throw new HunchError(
      `Saved prototype already exists: ${saveName}. Use --force to overwrite.`,
    );
  }

  if (options.force) {
    await rm(destination, { recursive: true, force: true });
  }

  await mkdir(saveRoot, { recursive: true });
  await cp(spike.dir, destination, {
    recursive: true,
    filter: (source) => shouldCopy(source, spike.dir),
  });
  await writeFile(
    path.join(destination, "SAVED.md"),
    await renderSavedMarkdown(saveName, spike),
    "utf8",
  );

  out.info(`Saved ${spike.name} to ${destination}`);
  return { source: spike.dir, destination };
}

function sanitizeSaveName(name: string): string {
  const trimmed = name.trim();
  if (
    trimmed.length === 0 ||
    trimmed === "." ||
    trimmed === ".." ||
    trimmed.includes("/") ||
    trimmed.includes("\\")
  ) {
    throw new HunchError("Save name must be a single folder name.");
  }

  return trimmed;
}

function shouldCopy(source: string, spikeDir: string): boolean {
  const relative = path.relative(spikeDir, source).split(path.sep);
  return !relative.includes("node_modules") && !relative.includes("dist");
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function renderSavedMarkdown(name: string, spike: SpikeRef): Promise<string> {
  const [problem, persona, journey, decisions] = await Promise.all([
    readOptional(path.join(spike.hunchDir, "problem.md")),
    readOptional(path.join(spike.hunchDir, "persona.md")),
    readOptional(path.join(spike.hunchDir, "journey.md")),
    readOptional(path.join(spike.hunchDir, "decisions.md")),
  ]);

  return [
    `# ${name}`,
    "",
    `Source spike: ${spike.name}`,
    "",
    "## Run It",
    "",
    "```sh",
    "cd app",
    "npm install",
    "npm run dev",
    "```",
    "",
    "## Problem",
    "",
    problem.trim() || "Not recorded.",
    "",
    "## Persona",
    "",
    persona.trim() || "Not recorded.",
    "",
    "## Journey",
    "",
    journey.trim() || "Not recorded.",
    "",
    "## Decisions",
    "",
    decisions.trim() || "No decisions recorded.",
    "",
  ].join("\n");
}

async function readOptional(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }

    throw error;
  }
}
