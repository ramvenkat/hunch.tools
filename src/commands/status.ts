import { access, readFile } from "node:fs/promises";
import path from "node:path";

import type { PathResolverOptions } from "../state/paths.js";
import { getActiveSpike, type SpikeRef } from "../state/spike.js";
import { out } from "../ui/output.js";

export interface SpikeStatus {
  name: string;
  dir: string;
  appDir: string;
  files: {
    app: boolean;
    styles: boolean;
    demoData: boolean;
  };
  lastActivity: string | null;
}

export async function statusCommand(
  options: PathResolverOptions = {},
): Promise<SpikeStatus> {
  const spike = await getActiveSpike(options);
  const status: SpikeStatus = {
    name: spike.name,
    dir: spike.dir,
    appDir: spike.appDir,
    files: {
      app: await exists(path.join(spike.appDir, "src", "App.tsx")),
      styles: await exists(path.join(spike.appDir, "src", "index.css")),
      demoData: await exists(path.join(spike.appDir, "src", "lib", "demo-data.ts")),
    },
    lastActivity: await readLastActivity(spike),
  };

  out.info(`Active spike: ${status.name}`);
  out.info(`Path: ${status.dir}`);
  out.info(`App: ${status.appDir}`);
  out.info(`App.tsx: ${present(status.files.app)}`);
  out.info(`index.css: ${present(status.files.styles)}`);
  out.info(`demo-data.ts: ${present(status.files.demoData)}`);
  out.info(`Last activity: ${status.lastActivity ?? "none"}`);
  out.info("Next: run `hunch doctor` to verify build health, or `hunch run` to view it.");

  return status;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function readLastActivity(spike: SpikeRef): Promise<string | null> {
  let content: string;
  try {
    content = await readFile(path.join(spike.hunchDir, "session.jsonl"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }

  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const line = lines.at(-1);
  if (line === undefined) {
    return null;
  }

  try {
    const event = JSON.parse(line) as {
      role?: unknown;
      content?: unknown;
      toolName?: unknown;
    };
    if (event.role === "tool" && typeof event.toolName === "string") {
      return `tool ${event.toolName} - ${String(event.content ?? "")}`;
    }
    return `${String(event.role ?? "event")} - ${String(event.content ?? "")}`;
  } catch {
    return "session log is malformed";
  }
}

function present(value: boolean): string {
  return value ? "present" : "missing";
}
