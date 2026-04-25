import os from "node:os";
import path from "node:path";

import { HunchError } from "../utils/errors.js";

export interface PathResolverOptions {
  homeDir?: string;
  cwd?: string;
}

export interface PathResolver {
  homeDir: string;
  repoRoot: string;
  hunchDir: string;
  configPath: string;
  activePath: string;
  defaultSpikeDir: string;
}

export function createPathResolver(
  options: PathResolverOptions = {},
): PathResolver {
  const homeDir = options.homeDir ?? os.homedir();
  const repoRoot = options.cwd ?? process.cwd();
  const hunchDir = path.join(homeDir, ".hunch");

  return {
    homeDir,
    repoRoot,
    hunchDir,
    configPath: path.join(hunchDir, "config.yaml"),
    activePath: path.join(hunchDir, "active"),
    defaultSpikeDir: path.join(homeDir, "hunches"),
  };
}

export function assertInside(root: string, candidate: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);

  if (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  ) {
    return resolvedCandidate;
  }

  throw new HunchError(`Path escapes allowed root: ${candidate}`);
}
