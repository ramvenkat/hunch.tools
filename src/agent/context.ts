import { readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import type { SpikeRef } from "../state/spike.js";
import type { SpikeContext } from "./types.js";

const EXCLUDED_TREE_NAMES = new Set(["node_modules", "dist"]);

export async function loadSpikeContext(spike: SpikeRef): Promise<SpikeContext> {
  const [problem, persona, journey, decisions, fileTree] = await Promise.all([
    readTrimmed(path.join(spike.hunchDir, "problem.md")),
    readTrimmed(path.join(spike.hunchDir, "persona.md")),
    readTrimmed(path.join(spike.hunchDir, "journey.md")),
    readTrimmed(path.join(spike.hunchDir, "decisions.md")),
    buildFileTree(spike.appDir),
  ]);

  return {
    problem,
    persona,
    journey,
    decisions,
    fileTree,
  };
}

async function readTrimmed(file: string): Promise<string> {
  return (await readFile(file, "utf8")).trim();
}

async function buildFileTree(appDir: string): Promise<string> {
  let root: string;

  try {
    root = await realpath(appDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }

    throw error;
  }

  const lines: string[] = [];
  await collectTreeEntries(root, root, 0, 2, lines);
  return lines.join("\n");
}

async function collectTreeEntries(
  root: string,
  dir: string,
  depth: number,
  maxDepth: number,
  lines: string[],
): Promise<void> {
  if (depth >= maxDepth) {
    return;
  }

  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries
    .filter((entry) => !EXCLUDED_TREE_NAMES.has(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink()) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(root, fullPath);

    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      lines.push(`${relativePath}/`);
      await collectTreeEntries(root, fullPath, depth + 1, maxDepth, lines);
      continue;
    }

    if (entry.isFile()) {
      lines.push(relativePath);
    }
  }
}
