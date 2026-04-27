import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  getLocalModelStatus,
  setupLocalModel,
} from "../../src/agent/local.js";
import type { HunchConfig } from "../../src/state/config.js";

describe("getLocalModelStatus", () => {
  it("reports a missing local model as not ready", async () => {
    const dir = await makeDir();
    const config = makeConfig(join(dir, "model.gguf"));

    await expect(getLocalModelStatus(config)).resolves.toMatchObject({
      exists: false,
      ready: false,
      sizeBytes: null,
    });
  });

  it("reports an installed local model as ready", async () => {
    const dir = await makeDir();
    const modelPath = join(dir, "model.gguf");
    await writeFile(modelPath, "tiny");

    await expect(getLocalModelStatus(makeConfig(modelPath))).resolves.toMatchObject(
      {
        exists: true,
        ready: true,
        sizeBytes: 4,
      },
    );
  });
});

describe("setupLocalModel", () => {
  it("keeps an existing model", async () => {
    const dir = await makeDir();
    const modelPath = join(dir, "model.gguf");
    await writeFile(modelPath, "already here");
    const downloadFile = vi.fn();

    await expect(
      setupLocalModel(makeConfig(modelPath), { downloadFile }),
    ).resolves.toMatchObject({
      exists: true,
      ready: true,
    });

    expect(downloadFile).not.toHaveBeenCalled();
  });

  it("downloads the configured local model", async () => {
    const dir = await makeDir();
    const modelPath = join(dir, "nested", "model.gguf");
    const downloadFile = vi
      .fn()
      .mockImplementation((_: string, destinationPath: string) =>
        writeFile(destinationPath, "downloaded"),
      );

    await expect(
      setupLocalModel(makeConfig(modelPath, "https://example.com/model.gguf"), {
        downloadFile,
      }),
    ).resolves.toMatchObject({
      exists: true,
      ready: true,
      sizeBytes: 10,
    });

    expect(downloadFile).toHaveBeenCalledWith(
      "https://example.com/model.gguf",
      expect.stringContaining("model.gguf"),
    );
    await expect(readFile(modelPath, "utf8")).resolves.toBe("downloaded");
  });

  it("requires a configured model URL when the model is missing", async () => {
    const dir = await makeDir();

    await expect(
      setupLocalModel(makeConfig(join(dir, "model.gguf"))),
    ).rejects.toThrow(/no local.model_url is configured/);
  });

  it("rejects setup when local is disabled", async () => {
    const dir = await makeDir();
    const config = makeConfig(join(dir, "model.gguf"));
    config.local.enabled = false;

    await expect(setupLocalModel(config)).rejects.toThrow(/disabled/);
  });
});

async function makeDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "hunch-local-test-"));
  await mkdir(dir, { recursive: true });
  return dir;
}

function makeConfig(modelPath: string, modelUrl = ""): HunchConfig {
  return {
    provider: "auto",
    fallbackProvider: "anthropic",
    model: "claude-3-5-sonnet-latest",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    spikeDir: "/spikes",
    local: {
      enabled: true,
      modelPath,
      modelUrl,
      model: "hunch-lite",
    },
    pushBackOnScopeCreep: true,
    logDecisions: true,
  };
}
