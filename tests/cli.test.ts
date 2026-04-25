import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildCli, runCli } from "../src/cli.js";

const originalExitCode = process.exitCode;

afterEach(() => {
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

describe("buildCli", () => {
  it("builds the hunch CLI with spike commands", () => {
    const cli = buildCli();

    expect(cli.name()).toBe("hunch");
    expect(cli.commands.map((command) => command.name())).toEqual(
      expect.arrayContaining(["new", "list", "open", "run", "ask", "decide"]),
    );
  });
});

describe("runCli", () => {
  it("uses injected path options for command config", async () => {
    const homeDir = await makeHome();
    const spikeDir = join(homeDir, "spikes");
    await writeConfig(homeDir, spikeDir);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runCli(["node", "hunch", "list"], { homeDir, cwd: "/repo" });

    expect(log).toHaveBeenCalledWith(
      `No spikes found in ${spikeDir}. Run \`hunch new\` to create one.`,
    );
  });

  it("prints HunchError messages without throwing", async () => {
    const homeDir = await makeHome();
    const spikeDir = join(homeDir, "spikes");
    await writeConfig(homeDir, spikeDir);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      runCli(["node", "hunch", "open", "missing"], { homeDir, cwd: "/repo" }),
    ).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("Spike not found: missing"),
    );
    expect(process.exitCode).toBe(1);
  });
});

async function makeHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), "hunch-cli-test-"));
}

async function writeConfig(homeDir: string, spikeDir: string): Promise<void> {
  await mkdir(join(homeDir, ".hunch"), { recursive: true });
  await writeFile(
    join(homeDir, ".hunch", "config.yaml"),
    `spike_dir: ${spikeDir}\n`,
  );
}
