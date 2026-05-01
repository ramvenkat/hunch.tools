import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { doctorCommand, type BuildCheckResult } from "../../src/commands/doctor.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("doctorCommand", () => {
  it("checks active spike, provider keys, local model readiness, and build health", async () => {
    const { homeDir, spikeName } = await setupActiveSpike();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const buildRunner = vi.fn(async (): Promise<BuildCheckResult> => ({
      ok: true,
      output: "built",
    }));

    const result = await doctorCommand({
      homeDir,
      cwd: "/repo",
      env: { OPENAI_API_KEY: "set", ANTHROPIC_API_KEY: "" },
      buildRunner,
      localModelDeps: {
        stat: vi.fn(async () => ({
          isFile: () => true,
          size: 1024,
        })) as never,
      },
    });

    expect(result.activeSpike?.name).toBe(spikeName);
    expect(result.keys.openai).toBe(true);
    expect(result.keys.anthropic).toBe(false);
    expect(result.local.ready).toBe(true);
    expect(result.build.ok).toBe(true);
    expect(buildRunner).toHaveBeenCalledWith(join(homeDir, "spikes", spikeName, "app"));
    expect(log).toHaveBeenCalledWith(`Active spike: ${spikeName}`);
    expect(log).toHaveBeenCalledWith("OpenAI API key: set");
    expect(log).toHaveBeenCalledWith("Anthropic API key: missing");
    expect(log).toHaveBeenCalledWith("Local model: ready");
    expect(log).toHaveBeenCalledWith("Build: pass");
  });

  it("reports build failures without throwing", async () => {
    const { homeDir } = await setupActiveSpike();
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = await doctorCommand({
      homeDir,
      cwd: "/repo",
      buildRunner: async () => ({
        ok: false,
        output: "src/App.tsx(1,1): error TS1005",
      }),
    });

    expect(result.build).toEqual({
      ok: false,
      output: "src/App.tsx(1,1): error TS1005",
    });
  });
});

async function setupActiveSpike(): Promise<{ homeDir: string; spikeName: string }> {
  const homeDir = await mkdtemp(join(tmpdir(), "hunch-doctor-test-"));
  const spikeDir = join(homeDir, "spikes");
  const spikeName = "2026-04-30-doctor";
  const hunchDir = join(spikeDir, spikeName, ".hunch");
  const appDir = join(spikeDir, spikeName, "app");
  const srcDir = join(appDir, "src");

  await mkdir(join(homeDir, ".hunch"), { recursive: true });
  await mkdir(join(srcDir, "lib"), { recursive: true });
  await writeFile(
    join(homeDir, ".hunch", "config.yaml"),
    [
      `spike_dir: ${spikeDir}`,
      "local:",
      "  model_path: ~/.hunch/models/test.gguf",
    ].join("\n"),
  );
  await writeFile(join(homeDir, ".hunch", "active"), `${spikeName}\n`);
  await mkdir(hunchDir, { recursive: true });
  await writeFile(join(hunchDir, "problem.md"), "Scheduling infusions\n");
  await writeFile(join(hunchDir, "persona.md"), "Schedulers\n");
  await writeFile(join(hunchDir, "journey.md"), "Book a slot\n");
  await writeFile(join(hunchDir, "decisions.md"), "");
  await writeFile(join(appDir, "package.json"), "{\"scripts\":{\"build\":\"vite build\"}}\n");
  await writeFile(join(srcDir, "App.tsx"), "export default function App() { return null; }\n");

  return { homeDir, spikeName };
}
