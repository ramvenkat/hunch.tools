import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { assertInside } from "../state/paths.js";
import { HunchError } from "../utils/errors.js";

export interface ReadFileToolInput {
  path: string;
}

export interface WriteFileToolInput {
  path: string;
  content: string;
}

export interface EditFileToolInput {
  path: string;
  old_str: string;
  new_str: string;
}

export interface ListFilesToolInput {
  path?: string;
  depth?: number;
}

const PROTECTED_PATH_SEGMENTS = new Set(["node_modules", "dist"]);
const PROTECTED_FILENAMES = new Set([
  ".npmrc",
  "bun.lock",
  "bun.lockb",
  "package-lock.json",
  "package.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.cjs",
  "vite.config.ts",
  "vite.config.mts",
  "vite.config.cts",
  "yarn.lock",
]);
const DEFAULT_LIST_DEPTH = 2;
const MAX_LIST_DEPTH = 10;
const MAX_LIST_ENTRIES = 1000;

function comparePath(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function assertNoSymlinks(
  root: string,
  candidate: string,
  allowMissingLeaf: boolean,
): Promise<void> {
  const relative = path.relative(path.resolve(root), candidate);
  const parts = relative === "" ? [] : relative.split(path.sep);
  let currentPath = path.resolve(root);

  for (let index = 0; index < parts.length; index += 1) {
    currentPath = path.join(currentPath, parts[index] ?? "");
    const isLeaf = index === parts.length - 1;

    if (!(await pathExists(currentPath))) {
      if (allowMissingLeaf && isLeaf) {
        return;
      }
      if (allowMissingLeaf && !(await pathExists(path.dirname(currentPath)))) {
        return;
      }
      continue;
    }

    const stats = await lstat(currentPath);
    if (stats.isSymbolicLink()) {
      throw new HunchError(
        `Symlinks are not allowed: ${toRelativePath(root, currentPath)}`,
      );
    }
  }
}

async function resolveInside(
  root: string,
  requestedPath: string,
  options: { allowMissingLeaf?: boolean } = {},
): Promise<string> {
  if (path.isAbsolute(requestedPath)) {
    throw new HunchError(`Tool paths must be relative: ${requestedPath}`);
  }

  const resolved = assertInside(root, path.resolve(root, requestedPath));
  assertToolPathAllowed(root, resolved);
  await assertNoSymlinks(root, resolved, options.allowMissingLeaf ?? false);
  return resolved;
}

function assertToolPathAllowed(root: string, filePath: string): void {
  const relative = toRelativePath(root, filePath);
  if (relative === "") {
    return;
  }

  const parts = relative.split("/");
  const blockedSegment = parts.find((part) => PROTECTED_PATH_SEGMENTS.has(part));
  if (blockedSegment !== undefined) {
    throw new HunchError(
      `Tool paths must not target generated directory: ${blockedSegment}`,
    );
  }

  const filename = parts.at(-1) ?? "";
  if (PROTECTED_FILENAMES.has(filename)) {
    throw new HunchError(
      `Tool paths must not target executable package surface: ${filename}`,
    );
  }
}

function toRelativePath(root: string, filePath: string): string {
  return path.relative(path.resolve(root), filePath).split(path.sep).join("/");
}

function countOccurrences(content: string, needle: string): number {
  if (needle.length === 0) {
    return 0;
  }

  let matches = 0;
  let index = content.indexOf(needle);

  while (index !== -1) {
    matches += 1;
    index = content.indexOf(needle, index + needle.length);
  }

  return matches;
}

export async function readFileTool(
  root: string,
  input: ReadFileToolInput,
): Promise<string> {
  const filePath = await resolveInside(root, input.path);
  return readFile(filePath, "utf8");
}

export async function writeFileTool(
  root: string,
  input: WriteFileToolInput,
): Promise<string> {
  const filePath = await resolveInside(root, input.path, {
    allowMissingLeaf: true,
  });
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, input.content, "utf8");
  return `Wrote ${input.path}`;
}

export async function editFileTool(
  root: string,
  input: EditFileToolInput,
): Promise<string> {
  const filePath = await resolveInside(root, input.path);
  const content = await readFile(filePath, "utf8");
  const matches = countOccurrences(content, input.old_str);

  if (matches !== 1) {
    throw new HunchError(
      `edit_file expected exactly one match for old_str, found ${matches}.`,
    );
  }

  await writeFile(filePath, content.replace(input.old_str, input.new_str), "utf8");
  return `Edited ${input.path}`;
}

export async function listFilesTool(
  root: string,
  input: ListFilesToolInput,
): Promise<string[]> {
  if (
    input.depth !== undefined &&
    (!Number.isInteger(input.depth) || input.depth < 0)
  ) {
    throw new HunchError("list_files depth must be a non-negative integer.");
  }
  if (input.depth !== undefined && input.depth > MAX_LIST_DEPTH) {
    throw new HunchError(`list_files depth must be ${MAX_LIST_DEPTH} or less.`);
  }

  const startPath = await resolveInside(root, input.path ?? ".");
  const maxDepth = input.depth ?? DEFAULT_LIST_DEPTH;
  const files: string[] = [];

  async function visit(currentPath: string, remainingDepth: number): Promise<void> {
    assertInside(root, currentPath);
    const entries = await readdir(currentPath, { withFileTypes: true });

    for (const entry of entries.sort((a, b) => comparePath(a.name, b.name))) {
      if (entry.isDirectory() && PROTECTED_PATH_SEGMENTS.has(entry.name)) {
        continue;
      }

      const childPath = assertInside(root, path.join(currentPath, entry.name));

      if (entry.isFile()) {
        files.push(toRelativePath(root, childPath));
        if (files.length > MAX_LIST_ENTRIES) {
          throw new HunchError(
            `list_files exceeded maximum entry count of ${MAX_LIST_ENTRIES}.`,
          );
        }
        continue;
      }

      if (entry.isDirectory() && remainingDepth > 1) {
        await visit(childPath, remainingDepth - 1);
      }
    }
  }

  await visit(startPath, maxDepth);

  return files.sort(comparePath);
}
