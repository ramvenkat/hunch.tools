import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  resolveAgentClient,
  type ProviderPreference,
} from "../../src/agent/provider-router.js";
import type { AgentProviderClient } from "../../src/agent/client.js";
import type { HunchConfig } from "../../src/state/config.js";

describe("resolveAgentClient", () => {
  it("uses Anthropic when cloud is requested", async () => {
    const createAnthropicClient = vi.fn(() => fakeClient("anthropic"));

    await expect(
      resolveAgentClient({
        config: makeConfig({ provider: "auto" }),
        preference: "cloud",
        env: { ANTHROPIC_API_KEY: "key" },
        createAnthropicClient,
      }),
    ).resolves.toMatchObject({ provider: "anthropic" });

    expect(createAnthropicClient).toHaveBeenCalledWith({
      apiKey: "key",
      model: "claude-3-5-sonnet-latest",
    });
  });

  it("uses local when local is requested and ready", async () => {
    const modelPath = await writeModel();
    const createLocalClient = vi.fn(() => fakeClient("local"));

    await expect(
      resolveAgentClient({
        config: makeConfig({ provider: "auto", modelPath }),
        preference: "local",
        createLocalClient,
      }),
    ).resolves.toMatchObject({ provider: "local" });

    expect(createLocalClient).toHaveBeenCalledOnce();
  });

  it("rejects local when the model is missing", async () => {
    await expect(
      resolveAgentClient({
        config: makeConfig({ modelPath: "/missing/model.gguf" }),
        preference: "local",
        createLocalClient: () => fakeClient("local"),
      }),
    ).rejects.toThrow(/local model is not installed/);
  });

  it("prefers ready local in auto mode", async () => {
    const modelPath = await writeModel();

    await expect(
      resolveAgentClient({
        config: makeConfig({ provider: "auto", modelPath }),
        env: { ANTHROPIC_API_KEY: "key" },
        createLocalClient: () => fakeClient("local"),
        createAnthropicClient: () => fakeClient("anthropic"),
      }),
    ).resolves.toMatchObject({ provider: "local" });
  });

  it("falls back to Anthropic in auto mode when local is missing", async () => {
    const createAnthropicClient = vi.fn(() => fakeClient("anthropic"));

    await expect(
      resolveAgentClient({
        config: makeConfig({ provider: "auto", modelPath: "/missing/model.gguf" }),
        env: { ANTHROPIC_API_KEY: "key" },
        createAnthropicClient,
      }),
    ).resolves.toMatchObject({
      provider: "anthropic",
      fallbackReason: "local model is not installed",
    });

    expect(createAnthropicClient).toHaveBeenCalledOnce();
  });

  it("falls back to Anthropic in auto mode when local is disabled", async () => {
    await expect(
      resolveAgentClient({
        config: makeConfig({ provider: "auto", localEnabled: false }),
        env: { ANTHROPIC_API_KEY: "key" },
        createAnthropicClient: () => fakeClient("anthropic"),
      }),
    ).resolves.toMatchObject({
      provider: "anthropic",
      fallbackReason: "local model is disabled",
    });
  });
});

async function writeModel(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "hunch-router-test-"));
  const modelPath = join(dir, "model.gguf");
  await writeFile(modelPath, "tiny");
  return modelPath;
}

function makeConfig(
  options: {
    provider?: ProviderPreference;
    modelPath?: string;
    localEnabled?: boolean;
  } = {},
): HunchConfig {
  return {
    provider: options.provider === "cloud" ? "auto" : (options.provider ?? "auto"),
    fallbackProvider: "anthropic",
    model: "claude-3-5-sonnet-latest",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    spikeDir: "/spikes",
    local: {
      enabled: options.localEnabled ?? true,
      modelPath: options.modelPath ?? "/missing/model.gguf",
      modelUrl: "",
      model: "hunch-lite",
    },
    pushBackOnScopeCreep: true,
    logDecisions: true,
  };
}

function fakeClient(
  provider: AgentProviderClient["provider"],
): AgentProviderClient {
  return {
    provider,
    model: provider === "local" ? "hunch-lite" : "claude-3-5-sonnet-latest",
    messages: {
      create: vi.fn(),
    },
  };
}
