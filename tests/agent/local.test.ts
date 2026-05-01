import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  createLocalClient,
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

describe("createLocalClient", () => {
  it("generates text with a node-llama-cpp compatible runtime", async () => {
    const dir = await makeDir();
    const prompt = vi.fn().mockResolvedValue("local answer");
    const loadModel = vi.fn().mockResolvedValue({
      createContext: vi.fn().mockResolvedValue({
        getSequence: vi.fn(() => "sequence"),
      }),
    });
    const client = createLocalClient(makeConfig(join(dir, "model.gguf")), {
      importRuntime: async () => ({
        getLlama: async () => ({ loadModel }),
        LlamaChatSession: class {
          prompt = prompt;
          constructor(readonly options: { contextSequence: unknown }) {}
        },
      }),
    });

    await expect(
      client.messages.create({
        model: "hunch-lite",
        max_tokens: 128,
        system: "Stay focused.",
        messages: [{ role: "user", content: "Hello" }],
      }),
    ).resolves.toEqual({
      content: [{ type: "text", text: "local answer" }],
      stop_reason: "end_turn",
    });

    expect(loadModel).toHaveBeenCalledWith({
      modelPath: join(dir, "model.gguf"),
    });
    expect(prompt).toHaveBeenCalledWith(
      expect.stringContaining("USER:\nHello"),
      { maxTokens: 128 },
    );
  });

  it("converts tagged local tool calls into provider tool use blocks", async () => {
    const dir = await makeDir();
    const prompt = vi
      .fn()
      .mockResolvedValue(
        '<tool_call>{"name":"read_file","input":{"path":"src/App.tsx"}}</tool_call>',
      );
    const client = createLocalClient(makeConfig(join(dir, "model.gguf")), {
      importRuntime: async () => ({
        getLlama: async () => ({
          loadModel: async () => ({
            createContext: async () => ({ getSequence: () => "sequence" }),
          }),
        }),
        LlamaChatSession: class {
          prompt = prompt;
          constructor(readonly options: { contextSequence: unknown }) {}
        },
      }),
    });

    await expect(
      client.messages.create({
        model: "hunch-lite",
        max_tokens: 128,
        tools: [{ name: "read_file" }],
        messages: [{ role: "user", content: "Read App" }],
      }),
    ).resolves.toMatchObject({
      content: [
        {
          type: "tool_use",
          name: "read_file",
          input: { path: "src/App.tsx" },
        },
      ],
      stop_reason: "tool_use",
    });

    expect(prompt).toHaveBeenCalledWith(
      expect.stringContaining("<tool_call>"),
      expect.any(Object),
    );
  });

  it("explains how to install the local runtime when it is missing", async () => {
    const dir = await makeDir();
    const client = createLocalClient(makeConfig(join(dir, "model.gguf")), {
      importRuntime: async () => {
        throw new Error("Cannot find package");
      },
    });

    await expect(
      client.messages.create({
        model: "hunch-lite",
        max_tokens: 128,
        messages: [{ role: "user", content: "Hello" }],
      }),
    ).rejects.toThrow(/node-llama-cpp/);
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
    openai: {
      model: "gpt-5.4-mini",
      apiKeyEnv: "OPENAI_API_KEY",
    },
    pushBackOnScopeCreep: true,
    logDecisions: true,
  };
}
