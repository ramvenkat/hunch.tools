import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  appendDecision,
  markDecision,
} from "../../src/tools/ux-decisions.js";

async function makeDecisionFile(): Promise<string> {
  const hunchDir = await mkdtemp(join(tmpdir(), "hunch-ux-decisions-test-"));
  return join(hunchDir, "decisions.md");
}

describe("appendDecision", () => {
  it("appends a pending markdown decision", async () => {
    const file = await makeDecisionFile();

    await expect(
      appendDecision(file, {
        decision: "Use cards",
        rationale: "They invite comparison.",
        ts: "2026-04-25T00:00:00.000Z",
      }),
    ).resolves.toBe("Logged decision: Use cards");

    await expect(readFile(file, "utf8")).resolves.toBe(
      [
        "## Use cards",
        "",
        "Status: pending",
        "Time: 2026-04-25T00:00:00.000Z",
        "",
        "They invite comparison.",
        "",
        "",
      ].join("\n"),
    );
  });
});

describe("markDecision", () => {
  it("marks a pending decision by title", async () => {
    const file = await makeDecisionFile();
    await appendDecision(file, {
      decision: "Use cards",
      rationale: "They invite comparison.",
      ts: "2026-04-25T00:00:00.000Z",
    });

    await expect(markDecision(file, "Use cards", "approved")).resolves.toBe(
      "Marked decision approved: Use cards",
    );

    const content = await readFile(file, "utf8");
    expect(content).toContain("Status: approved");
    expect(content).toContain("Use cards");
  });

  it("preserves existing entries when marking one decision", async () => {
    const file = await makeDecisionFile();
    await appendDecision(file, {
      decision: "Use cards",
      rationale: "They invite comparison.",
      ts: "2026-04-25T00:00:00.000Z",
    });
    await appendDecision(file, {
      decision: "Use tabs",
      rationale: "They separate flows.",
      ts: "2026-04-25T01:00:00.000Z",
    });

    await markDecision(file, "Use cards", "superseded");

    await expect(readFile(file, "utf8")).resolves.toContain(
      [
        "## Use tabs",
        "",
        "Status: pending",
        "Time: 2026-04-25T01:00:00.000Z",
        "",
        "They separate flows.",
      ].join("\n"),
    );
  });

  it("rejects missing decisions", async () => {
    const file = await makeDecisionFile();
    await writeFile(file, "", "utf8");

    await expect(markDecision(file, "Use cards", "approved")).rejects.toThrow(
      "Decision not found: Use cards",
    );
  });

  it("rejects decisions that are already resolved", async () => {
    const file = await makeDecisionFile();
    await appendDecision(file, {
      decision: "Use cards",
      rationale: "They invite comparison.",
      ts: "2026-04-25T00:00:00.000Z",
    });
    await markDecision(file, "Use cards", "approved");

    await expect(markDecision(file, "Use cards", "removed")).rejects.toThrow(
      "Decision is not pending: Use cards",
    );
  });
});
