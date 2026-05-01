import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentProviderClient } from "../../src/agent/client.js";
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

  it("routes a one-shot message through the local provider when requested", async () => {
    const { homeDir } = await setupActiveSpike();
    const client = fakeClient("local");
    const resolveClient = vi.fn().mockResolvedValue({ client, provider: "local" });
    const runAgent = vi.fn().mockResolvedValue(undefined);
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await askCommand("hello", {
      homeDir,
      cwd: "/repo",
      local: true,
      resolveClient,
      runAgent,
    });

    expect(resolveClient).toHaveBeenCalledWith(
      expect.objectContaining({ preference: "local" }),
    );
    expect(runAgent).toHaveBeenCalledWith(
      expect.objectContaining({ client, message: "hello" }),
    );
    expect(stdout).toHaveBeenCalledWith("\n");
  });

  it("routes a one-shot message through the cloud provider when requested", async () => {
    const { homeDir } = await setupActiveSpike();
    const client = fakeClient("anthropic");
    const resolveClient = vi
      .fn()
      .mockResolvedValue({ client, provider: "anthropic" });

    await askCommand("hello", {
      homeDir,
      cwd: "/repo",
      cloud: true,
      resolveClient,
      runAgent: vi.fn().mockResolvedValue(undefined),
    });

    expect(resolveClient).toHaveBeenCalledWith(
      expect.objectContaining({ preference: "cloud" }),
    );
  });

  it("routes a one-shot message through OpenAI when requested", async () => {
    const { homeDir } = await setupActiveSpike();
    const client = fakeClient("openai");
    const resolveClient = vi.fn().mockResolvedValue({ client, provider: "openai" });

    await askCommand("hello", {
      homeDir,
      cwd: "/repo",
      openai: true,
      resolveClient,
      runAgent: vi.fn().mockResolvedValue(undefined),
    });

    expect(resolveClient).toHaveBeenCalledWith(
      expect.objectContaining({ preference: "openai" }),
    );
  });

  it("routes a one-shot message through Anthropic when requested", async () => {
    const { homeDir } = await setupActiveSpike();
    const client = fakeClient("anthropic");
    const resolveClient = vi
      .fn()
      .mockResolvedValue({ client, provider: "anthropic" });

    await askCommand("hello", {
      homeDir,
      cwd: "/repo",
      anthropic: true,
      resolveClient,
      runAgent: vi.fn().mockResolvedValue(undefined),
    });

    expect(resolveClient).toHaveBeenCalledWith(
      expect.objectContaining({ preference: "anthropic" }),
    );
  });

  it("passes max tool iterations through to the agent", async () => {
    const { homeDir } = await setupActiveSpike();
    const client = fakeClient("openai");
    const resolveClient = vi.fn().mockResolvedValue({ client, provider: "openai" });
    const runAgent = vi.fn().mockResolvedValue(undefined);

    await askCommand("hello", {
      homeDir,
      cwd: "/repo",
      openai: true,
      maxToolIterations: 80,
      resolveClient,
      runAgent,
    });

    expect(runAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        client,
        message: "hello",
        progress: true,
        maxToolIterations: 80,
      }),
    );
  });

  it("rejects conflicting provider flags", async () => {
    const { homeDir } = await setupActiveSpike();

    await expect(
      askCommand("hello", { homeDir, cwd: "/repo", local: true, cloud: true }),
    ).rejects.toThrow(/Choose only one provider flag/);
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

async function setupActiveSpike(): Promise<{ homeDir: string }> {
  const homeDir = await makeHome();
  const spikeDir = join(homeDir, "spikes");
  const hunchDir = join(spikeDir, "2026-04-25-ask", ".hunch");
  await writeConfig(homeDir, spikeDir);
  await mkdir(hunchDir, { recursive: true });
  await writeFile(join(homeDir, ".hunch", "active"), "2026-04-25-ask\n");
  return { homeDir };
}

function fakeClient(
  provider: AgentProviderClient["provider"],
): AgentProviderClient {
  return {
    provider,
    model:
      provider === "local"
        ? "hunch-lite"
        : provider === "openai"
          ? "gpt-5.4-mini"
          : "claude-3-5-sonnet-latest",
    messages: {
      create: vi.fn(),
    },
  };
}
