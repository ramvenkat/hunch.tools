import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
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

const SKIPPED_DIRS = new Set(["node_modules", "dist"]);

function comparePath(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

function resolveInside(root: string, requestedPath: string): string {
  return assertInside(root, path.resolve(root, requestedPath));
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
  const filePath = resolveInside(root, input.path);
  return readFile(filePath, "utf8");
}

export async function writeFileTool(
  root: string,
  input: WriteFileToolInput,
): Promise<string> {
  const filePath = resolveInside(root, input.path);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, input.content, "utf8");
  return `Wrote ${input.path}`;
}

export async function editFileTool(
  root: string,
  input: EditFileToolInput,
): Promise<string> {
  const filePath = resolveInside(root, input.path);
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
  const startPath = resolveInside(root, input.path ?? ".");
  const maxDepth = input.depth ?? Number.POSITIVE_INFINITY;
  const files: string[] = [];

  async function visit(currentPath: string, remainingDepth: number): Promise<void> {
    assertInside(root, currentPath);
    const entries = await readdir(currentPath, { withFileTypes: true });

    for (const entry of entries.sort((a, b) => comparePath(a.name, b.name))) {
      if (entry.isDirectory() && SKIPPED_DIRS.has(entry.name)) {
        continue;
      }

      const childPath = assertInside(root, path.join(currentPath, entry.name));

      if (entry.isFile()) {
        files.push(toRelativePath(root, childPath));
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
