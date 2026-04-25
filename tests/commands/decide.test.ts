import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { decideCommand } from "../../src/commands/decide.js";
import { HunchError } from "../../src/utils/errors.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("decideCommand", () => {
  it("prints a no-decisions message when decisions.md is missing", async () => {
    const { homeDir } = await setupActiveSpike();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const select = vi.fn();

    await decideCommand({ homeDir, cwd: "/repo", select });

    expect(log).toHaveBeenCalledWith("No UX decisions logged yet.");
    expect(select).not.toHaveBeenCalled();
  });

  it("marks a pending decision approved", async () => {
    const { homeDir, decisionsFile } = await setupActiveSpike();
    await writeDecisionFile(decisionsFile, [
      decisionSection("Use cards", "pending", "They invite comparison."),
    ]);
    const select = vi.fn().mockResolvedValue("approved");
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await decideCommand({ homeDir, cwd: "/repo", select });

    await expect(readFile(decisionsFile, "utf8")).resolves.toContain(
      "Status: approved",
    );
    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Use cards" }),
    );
  });

  it("leaves a pending decision unchanged when skipped", async () => {
    const { homeDir, decisionsFile } = await setupActiveSpike();
    const original = [decisionSection("Use cards", "pending", "Rationale.")].join(
      "\n",
    );
    await writeFile(decisionsFile, original, "utf8");
    const select = vi.fn().mockResolvedValue("skip");
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await decideCommand({ homeDir, cwd: "/repo", select });

    await expect(readFile(decisionsFile, "utf8")).resolves.toBe(original);
  });

  it("does not prompt rationale headings as decisions", async () => {
    const { homeDir, decisionsFile } = await setupActiveSpike();
    await writeDecisionFile(decisionsFile, [
      decisionSection(
        "Use cards",
        "pending",
        "They invite comparison.\n\n## Fake heading\n\nMore rationale.",
      ),
    ]);
    const select = vi.fn().mockResolvedValue("skip");
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await decideCommand({ homeDir, cwd: "/repo", select });

    expect(select).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Use cards" }),
    );
  });

  it("prints a no-pending message when all decisions are resolved", async () => {
    const { homeDir, decisionsFile } = await setupActiveSpike();
    await writeDecisionFile(decisionsFile, [
      decisionSection("Use cards", "approved", "Rationale."),
    ]);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const select = vi.fn();

    await decideCommand({ homeDir, cwd: "/repo", select });

    expect(log).toHaveBeenCalledWith("No pending UX decisions.");
    expect(select).not.toHaveBeenCalled();
  });

  it("throws HunchError when decisions.md has malformed decision sections", async () => {
    const { homeDir, decisionsFile } = await setupActiveSpike();
    await writeFile(decisionsFile, "## Broken\n\nMissing metadata.\n", "utf8");
    const select = vi.fn();

    await expect(
      decideCommand({ homeDir, cwd: "/repo", select }),
    ).rejects.toEqual(
      new HunchError(
        "Malformed UX decision entry: Broken. Expected Status and Time metadata after the heading.",
      ),
    );
    expect(select).not.toHaveBeenCalled();
  });

  it("reviews multiple pending decisions and preserves skipped entries", async () => {
    const { homeDir, decisionsFile } = await setupActiveSpike();
    await writeDecisionFile(decisionsFile, [
      decisionSection("Use cards", "pending", "They invite comparison."),
      decisionSection("Use tabs", "pending", "They separate flows."),
    ]);
    const select = vi
      .fn()
      .mockResolvedValueOnce("skip")
      .mockResolvedValueOnce("approved");
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await decideCommand({ homeDir, cwd: "/repo", select });

    const content = await readFile(decisionsFile, "utf8");
    expect(content).toContain(
      [
        "## Use cards",
        "",
        "Status: pending",
        "Time: 2026-04-25T00:00:00.000Z",
      ].join("\n"),
    );
    expect(content).toContain(
      [
        "## Use tabs",
        "",
        "Status: approved",
        "Time: 2026-04-25T00:00:00.000Z",
      ].join("\n"),
    );
    expect(select).toHaveBeenCalledTimes(2);
  });
});

async function setupActiveSpike(): Promise<{
  homeDir: string;
  decisionsFile: string;
}> {
  const homeDir = await mkdtemp(join(tmpdir(), "hunch-decide-test-"));
  const spikeDir = join(homeDir, "spikes");
  const hunchDir = join(spikeDir, "2026-04-25-decide", ".hunch");
  await mkdir(join(homeDir, ".hunch"), { recursive: true });
  await mkdir(hunchDir, { recursive: true });
  await writeFile(
    join(homeDir, ".hunch", "config.yaml"),
    `spike_dir: ${spikeDir}\n`,
  );
  await writeFile(join(homeDir, ".hunch", "active"), "2026-04-25-decide\n");

  return { homeDir, decisionsFile: join(hunchDir, "decisions.md") };
}

async function writeDecisionFile(file: string, sections: string[]): Promise<void> {
  await writeFile(file, sections.join("\n"), "utf8");
}

function decisionSection(
  title: string,
  status: "pending" | "approved" | "superseded" | "removed",
  rationale: string,
): string {
  return [
    `## ${title}`,
    "",
    `Status: ${status}`,
    "Time: 2026-04-25T00:00:00.000Z",
    "",
    rationale,
    "",
  ].join("\n");
}
