import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { statusCommand } from "../../src/commands/status.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("statusCommand", () => {
  it("prints the active spike path, app file health, and last activity", async () => {
    const { homeDir, spikeDir, spikeName } = await setupActiveSpike();
    await writeFile(
      join(spikeDir, spikeName, ".hunch", "session.jsonl"),
      [
        JSON.stringify({
          role: "user",
          content: "Make it real",
          ts: "2026-04-30T20:00:00.000Z",
        }),
        JSON.stringify({
          role: "tool",
          content: "Wrote app/src/App.tsx",
          ts: "2026-04-30T20:01:00.000Z",
          toolName: "write_file",
        }),
      ].join("\n") + "\n",
      "utf8",
    );
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const status = await statusCommand({ homeDir, cwd: "/repo" });

    expect(status.name).toBe(spikeName);
    expect(status.files.app).toBe(true);
    expect(status.files.styles).toBe(true);
    expect(status.files.demoData).toBe(true);
    expect(log).toHaveBeenCalledWith(`Active spike: ${spikeName}`);
    expect(log).toHaveBeenCalledWith(`Path: ${join(spikeDir, spikeName)}`);
    expect(log).toHaveBeenCalledWith("App.tsx: present");
    expect(log).toHaveBeenCalledWith("index.css: present");
    expect(log).toHaveBeenCalledWith("demo-data.ts: present");
    expect(log).toHaveBeenCalledWith("Last activity: tool write_file - Wrote app/src/App.tsx");
    expect(log).toHaveBeenCalledWith("Next: run `hunch doctor` to verify build health, or `hunch run` to view it.");
  });
});

async function setupActiveSpike(): Promise<{
  homeDir: string;
  spikeDir: string;
  spikeName: string;
}> {
  const homeDir = await mkdtemp(join(tmpdir(), "hunch-status-test-"));
  const spikeDir = join(homeDir, "spikes");
  const spikeName = "2026-04-30-status";
  const hunchDir = join(spikeDir, spikeName, ".hunch");
  const srcDir = join(spikeDir, spikeName, "app", "src");

  await mkdir(join(homeDir, ".hunch"), { recursive: true });
  await mkdir(join(srcDir, "lib"), { recursive: true });
  await writeFile(join(homeDir, ".hunch", "config.yaml"), `spike_dir: ${spikeDir}\n`);
  await writeFile(join(homeDir, ".hunch", "active"), `${spikeName}\n`);
  await mkdir(hunchDir, { recursive: true });
  await writeFile(join(hunchDir, "problem.md"), "Scheduling infusions\n");
  await writeFile(join(hunchDir, "persona.md"), "Scheduler\n");
  await writeFile(join(hunchDir, "journey.md"), "Book a slot\n");
  await writeFile(join(hunchDir, "decisions.md"), "");
  await writeFile(join(srcDir, "App.tsx"), "export default function App() { return null; }\n");
  await writeFile(join(srcDir, "index.css"), "@tailwind base;\n");
  await writeFile(join(srcDir, "lib", "demo-data.ts"), "export const patients = [];\n");

  return { homeDir, spikeDir, spikeName };
}
