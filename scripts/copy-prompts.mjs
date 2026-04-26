import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

const sourceDir = join(process.cwd(), "src", "prompts");
const targetDir = join(process.cwd(), "dist", "prompts");

await rm(targetDir, { force: true, recursive: true });
await mkdir(targetDir, { recursive: true });

const entries = await readdir(sourceDir, { withFileTypes: true });

await Promise.all(
  entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) =>
      cp(join(sourceDir, entry.name), join(targetDir, entry.name)),
    ),
);
