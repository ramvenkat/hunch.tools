import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { askCommand } from "../../src/commands/ask.js";
import { HunchError } from "../../src/utils/errors.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("askCommand", () => {
  it("throws HunchError when the configured Anthropic API key is missing", async () => {
    const homeDir = await makeHome();
    const spikeDir = join(homeDir, "spikes");
    const hunchDir = join(spikeDir, "2026-04-25-ask", ".hunch");
    await writeConfig(homeDir, spikeDir);
    await mkdir(hunchDir, { recursive: true });
    await writeFile(join(homeDir, ".hunch", "active"), "2026-04-25-ask\n");
    vi.stubEnv("ANTHROPIC_API_KEY", "");

    await expect(
      askCommand("hello", { homeDir, cwd: "/repo" }),
    ).rejects.toEqual(
      new HunchError(
        "Missing Anthropic API key. Set ANTHROPIC_API_KEY or configure api_key_env.",
      ),
    );
  });
});

async function makeHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), "hunch-ask-test-"));
}

async function writeConfig(homeDir: string, spikeDir: string): Promise<void> {
  await mkdir(join(homeDir, ".hunch"), { recursive: true });
  await writeFile(
    join(homeDir, ".hunch", "config.yaml"),
    `spike_dir: ${spikeDir}\n`,
  );
}
