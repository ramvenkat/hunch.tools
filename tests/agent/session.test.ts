import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  appendSessionEvent,
  readRecentSession,
} from "../../src/agent/session.js";
import type { SessionEvent } from "../../src/agent/types.js";

async function makeSpikeDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "hunch-session-test-"));
  await mkdir(join(dir, ".hunch"), { recursive: true });
  return dir;
}

describe("session events", () => {
  it("appends events and reads the most recent limit", async () => {
    const dir = await makeSpikeDir();
    const sessionFile = join(dir, ".hunch", "session.jsonl");
    const userEvent: SessionEvent = {
      role: "user",
      content: "Build a dashboard",
      ts: "2026-04-25T12:00:00.000Z",
    };
    const assistantEvent: SessionEvent = {
      role: "assistant",
      content: "I'll inspect the app first.",
      ts: "2026-04-25T12:00:01.000Z",
    };

    await appendSessionEvent(sessionFile, userEvent);
    await appendSessionEvent(sessionFile, assistantEvent);

    await expect(readRecentSession(sessionFile, 1)).resolves.toEqual([
      assistantEvent,
    ]);
  });

  it("returns an empty list when the session file is missing", async () => {
    const dir = await makeSpikeDir();

    await expect(
      readRecentSession(join(dir, ".hunch", "missing.jsonl")),
    ).resolves.toEqual([]);
  });

  it("wraps malformed session JSON with context", async () => {
    const dir = await makeSpikeDir();
    const sessionFile = join(dir, ".hunch", "session.jsonl");
    await writeFile(sessionFile, "{\"role\":\"user\"}\nnot-json\n", "utf8");

    await expect(readRecentSession(sessionFile)).rejects.toThrow(
      /Malformed session JSON on line 2/,
    );
  });
});
