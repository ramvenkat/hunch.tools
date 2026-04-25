import {
  mkdir,
  mkdtemp,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildSpikeName,
  getActiveSpike,
  listSpikes,
  setActiveSpike,
  spikeRef,
} from "../../src/state/spike.js";

async function makeHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), "hunch-spike-test-"));
}

async function writeConfig(homeDir: string, spikeDir: string): Promise<void> {
  await mkdir(join(homeDir, ".hunch"), { recursive: true });
  await writeFile(
    join(homeDir, ".hunch", "config.yaml"),
    `spike_dir: ${spikeDir}\n`,
  );
}

describe("listSpikes", () => {
  it("returns an empty list when the spike directory is absent", async () => {
    const homeDir = await makeHome();
    const spikeDir = join(homeDir, "missing-spikes");
    await writeConfig(homeDir, spikeDir);

    await expect(listSpikes({ homeDir, cwd: "/repo" })).resolves.toEqual([]);
  });

  it("returns directories sorted newest first by name", async () => {
    const homeDir = await makeHome();
    const spikeDir = join(homeDir, "spikes");
    await writeConfig(homeDir, spikeDir);
    await mkdir(join(spikeDir, "2026-04-24-one"), { recursive: true });
    await mkdir(join(spikeDir, "2026-04-25-two"));
    await writeFile(join(spikeDir, "2026-04-26-note.txt"), "");

    const spikes = await listSpikes({ homeDir, cwd: "/repo" });

    expect(spikes.map((spike) => spike.name)).toEqual([
      "2026-04-25-two",
      "2026-04-24-one",
    ]);
  });
});

describe("active spike", () => {
  it("persists and reads the active spike", async () => {
    const homeDir = await makeHome();
    const spikeDir = join(homeDir, "spikes");
    await writeConfig(homeDir, spikeDir);

    await setActiveSpike("2026-04-25-test", { homeDir, cwd: "/repo" });

    await expect(getActiveSpike({ homeDir, cwd: "/repo" })).resolves.toEqual(
      spikeRef(spikeDir, "2026-04-25-test"),
    );
  });

  it("throws when the active file is missing", async () => {
    const homeDir = await makeHome();

    await expect(getActiveSpike({ homeDir, cwd: "/repo" })).rejects.toThrow(
      "No active spike. Run `hunch list` or `hunch open <name>`.",
    );
  });

  it("throws when the active file is blank", async () => {
    const homeDir = await makeHome();
    await mkdir(join(homeDir, ".hunch"), { recursive: true });
    await writeFile(join(homeDir, ".hunch", "active"), "\n");

    await expect(getActiveSpike({ homeDir, cwd: "/repo" })).rejects.toThrow(
      "No active spike. Run `hunch open <name>`.",
    );
  });

  it("rejects traversal in active spike names", async () => {
    const homeDir = await makeHome();

    await expect(
      setActiveSpike("../outside", { homeDir, cwd: "/repo" }),
    ).rejects.toThrow(/Invalid spike name/);
  });

  it("rejects traversal read from the active file", async () => {
    const homeDir = await makeHome();
    await mkdir(join(homeDir, ".hunch"), { recursive: true });
    await writeFile(join(homeDir, ".hunch", "active"), "../outside\n");

    await expect(getActiveSpike({ homeDir, cwd: "/repo" })).rejects.toThrow(
      /Invalid spike name/,
    );
  });
});

describe("spikeRef", () => {
  it("rejects names that escape the spike directory", () => {
    expect(() => spikeRef("/tmp/hunches", "../outside")).toThrow(
      /Invalid spike name/,
    );
  });
});

describe("buildSpikeName", () => {
  it("prefixes slugs with the ISO date stamp", () => {
    expect(
      buildSpikeName("first-time-users", new Date("2026-04-25T12:34:56.000Z")),
    ).toBe("2026-04-25-first-time-users");
  });
});
