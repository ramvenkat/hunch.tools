import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { saveCommand } from "../../src/commands/save.js";
import { HunchError } from "../../src/utils/errors.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("saveCommand", () => {
  it("copies the active spike into a durable save folder with a summary", async () => {
    const { homeDir, spikeName } = await setupActiveSpike();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = await saveCommand("infusion-demo", { homeDir, cwd: "/repo" });

    expect(result.destination).toBe(join(homeDir, "hunch-saves", "infusion-demo"));
    await expect(
      readFile(join(result.destination, "app", "src", "App.tsx"), "utf8"),
    ).resolves.toContain("Infusion");
    await expect(readFile(join(result.destination, "SAVED.md"), "utf8")).resolves.toContain(
      "# infusion-demo",
    );
    await expect(readFile(join(result.destination, "SAVED.md"), "utf8")).resolves.toContain(
      "Source spike: 2026-04-30-save",
    );
    await expect(readFile(join(result.destination, "SAVED.md"), "utf8")).resolves.toContain(
      "npm run dev",
    );
    expect(log).toHaveBeenCalledWith(`Saved ${spikeName} to ${result.destination}`);
  });

  it("refuses to overwrite an existing save unless force is true", async () => {
    const { homeDir } = await setupActiveSpike();
    await mkdir(join(homeDir, "hunch-saves", "keeper"), { recursive: true });
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(saveCommand("keeper", { homeDir, cwd: "/repo" })).rejects.toEqual(
      new HunchError("Saved prototype already exists: keeper. Use --force to overwrite."),
    );

    await expect(
      saveCommand("keeper", { homeDir, cwd: "/repo", force: true }),
    ).resolves.toEqual(
      expect.objectContaining({
        destination: join(homeDir, "hunch-saves", "keeper"),
      }),
    );
  });
});

async function setupActiveSpike(): Promise<{ homeDir: string; spikeName: string }> {
  const homeDir = await mkdtemp(join(tmpdir(), "hunch-save-test-"));
  const spikeDir = join(homeDir, "spikes");
  const spikeName = "2026-04-30-save";
  const hunchDir = join(spikeDir, spikeName, ".hunch");
  const srcDir = join(spikeDir, spikeName, "app", "src");

  await mkdir(join(homeDir, ".hunch"), { recursive: true });
  await mkdir(join(srcDir, "lib"), { recursive: true });
  await mkdir(hunchDir, { recursive: true });
  await writeFile(join(homeDir, ".hunch", "config.yaml"), `spike_dir: ${spikeDir}\n`);
  await writeFile(join(homeDir, ".hunch", "active"), `${spikeName}\n`);
  await writeFile(join(hunchDir, "problem.md"), "Scheduling infusions\n");
  await writeFile(join(hunchDir, "persona.md"), "Schedulers\n");
  await writeFile(join(hunchDir, "journey.md"), "Book a slot\n");
  await writeFile(join(hunchDir, "decisions.md"), "## Three panels\n\nStatus: pending\n");
  await writeFile(join(srcDir, "App.tsx"), "export default function Infusion() { return null; }\n");
  await writeFile(join(srcDir, "index.css"), "@tailwind base;\n");
  await writeFile(join(srcDir, "lib", "demo-data.ts"), "export const patients = [];\n");

  return { homeDir, spikeName };
}
