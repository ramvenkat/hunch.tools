import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  localSetupCommand,
  localStatusCommand,
} from "../../src/commands/local.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("localStatusCommand", () => {
  it("prints local model readiness", async () => {
    const homeDir = await makeHome();
    const modelPath = join(homeDir, ".hunch", "models", "hunch-lite.gguf");
    await mkdir(join(homeDir, ".hunch", "models"), { recursive: true });
    await writeFile(modelPath, "tiny");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(localStatusCommand({ homeDir, cwd: "/repo" })).resolves.toMatchObject(
      {
        ready: true,
        exists: true,
      },
    );

    expect(log).toHaveBeenCalledWith("Local model: hunch-lite");
    expect(log).toHaveBeenCalledWith(`Path: ${modelPath}`);
    expect(log).toHaveBeenCalledWith("Installed: yes");
    expect(log).toHaveBeenCalledWith("Ready: yes");
  });
});

describe("localSetupCommand", () => {
  it("installs the configured local model", async () => {
    const homeDir = await makeHome();
    const modelPath = join(homeDir, "models", "tiny.gguf");
    await writeConfig(
      homeDir,
      [
        "provider: auto",
        "local:",
        `  model_path: ${modelPath}`,
        "  model_url: https://example.com/tiny.gguf",
        "",
      ].join("\n"),
    );
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(
      localSetupCommand({
        homeDir,
        cwd: "/repo",
        localModelDeps: {
          downloadFile: (_url, destinationPath) =>
            writeFile(destinationPath, "downloaded"),
        },
      }),
    ).resolves.toMatchObject({
      ready: true,
      exists: true,
    });

    await expect(readFile(modelPath, "utf8")).resolves.toBe("downloaded");
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(`Local model ready: ${modelPath}`),
    );
  });
});

async function makeHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), "hunch-local-command-test-"));
}

async function writeConfig(homeDir: string, config: string): Promise<void> {
  await mkdir(join(homeDir, ".hunch"), { recursive: true });
  await writeFile(join(homeDir, ".hunch", "config.yaml"), config);
}
