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
    await writeFile(
      sessionFile,
      `${JSON.stringify({
        role: "user",
        content: "Hello",
        ts: "2026-04-25T12:00:00.000Z",
      })}\nnot-json\n`,
      "utf8",
    );

    await expect(readRecentSession(sessionFile)).rejects.toThrow(
      /Malformed session JSON on line 2/,
    );
  });

  it("rejects valid JSON with an invalid event shape", async () => {
    const dir = await makeSpikeDir();
    const sessionFile = join(dir, ".hunch", "session.jsonl");
    await writeFile(
      sessionFile,
      `${JSON.stringify({
        role: "system",
        content: "Not a session event",
        ts: "2026-04-25T12:00:00.000Z",
      })}\n`,
      "utf8",
    );

    await expect(readRecentSession(sessionFile)).rejects.toThrow(
      new RegExp(
        `Invalid session event in ${sessionFile} on line 1: role must be user\\|assistant\\|tool`,
      ),
    );
  });

  it("rejects non-string content, ts, and toolName fields", async () => {
    const dir = await makeSpikeDir();
    const cases = [
      {
        event: { role: "user", content: 123, ts: "2026-04-25T12:00:00.000Z" },
        error: "content must be a string",
      },
      {
        event: { role: "tool", content: "ok", ts: 123 },
        error: "ts must be a string",
      },
      {
        event: {
          role: "tool",
          content: "ok",
          ts: "2026-04-25T12:00:00.000Z",
          toolName: 123,
        },
        error: "toolName must be a string when present",
      },
    ];

    for (const [index, testCase] of cases.entries()) {
      const sessionFile = join(dir, ".hunch", `invalid-${index}.jsonl`);
      await writeFile(sessionFile, `${JSON.stringify(testCase.event)}\n`, "utf8");

      await expect(readRecentSession(sessionFile)).rejects.toThrow(
        testCase.error,
      );
    }
  });
});
