import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { loadConfig } from "../../src/state/config.js";

async function makeHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), "hunch-config-test-"));
}

describe("loadConfig", () => {
  it("uses defaults when config is absent", async () => {
    const homeDir = await makeHome();

    await expect(loadConfig({ homeDir, cwd: "/repo" })).resolves.toEqual({
      provider: "anthropic",
      model: "claude-3-5-sonnet-latest",
      apiKeyEnv: "ANTHROPIC_API_KEY",
      spikeDir: join(homeDir, "hunches"),
      pushBackOnScopeCreep: true,
      logDecisions: true,
    });
  });

  it("reads YAML overrides from the Hunch config path", async () => {
    const homeDir = await makeHome();
    await mkdir(join(homeDir, ".hunch"));
    await writeFile(
      join(homeDir, ".hunch", "config.yaml"),
      [
        "provider: anthropic",
        "model: claude-sonnet-4-5",
        "api_key_env: CUSTOM_ANTHROPIC_KEY",
        "spike_dir: /tmp/my-hunches",
        "push_back_on_scope_creep: false",
        "log_decisions: false",
        "",
      ].join("\n"),
    );

    await expect(loadConfig({ homeDir, cwd: "/repo" })).resolves.toEqual({
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      apiKeyEnv: "CUSTOM_ANTHROPIC_KEY",
      spikeDir: "/tmp/my-hunches",
      pushBackOnScopeCreep: false,
      logDecisions: false,
    });
  });

  it("expands home-relative spike directories", async () => {
    const homeDir = await makeHome();
    await mkdir(join(homeDir, ".hunch"));
    await writeFile(
      join(homeDir, ".hunch", "config.yaml"),
      "spike_dir: ~/research-spikes\n",
    );

    const config = await loadConfig({ homeDir, cwd: "/repo" });

    expect(config.spikeDir).toBe(join(homeDir, "research-spikes"));
  });

  it("reads nested agent options", async () => {
    const homeDir = await makeHome();
    await mkdir(join(homeDir, ".hunch"));
    await writeFile(
      join(homeDir, ".hunch", "config.yaml"),
      [
        "agent:",
        "  push_back_on_scope_creep: false",
        "  log_decisions: false",
        "",
      ].join("\n"),
    );

    const config = await loadConfig({ homeDir, cwd: "/repo" });

    expect(config.pushBackOnScopeCreep).toBe(false);
    expect(config.logDecisions).toBe(false);
  });

  it("rejects unsupported providers", async () => {
    const homeDir = await makeHome();
    await mkdir(join(homeDir, ".hunch"));
    await writeFile(join(homeDir, ".hunch", "config.yaml"), "provider: openai\n");

    await expect(loadConfig({ homeDir, cwd: "/repo" })).rejects.toThrow(
      /Invalid Hunch config: provider/,
    );
  });

  it("rejects invalid boolean agent flags", async () => {
    const homeDir = await makeHome();
    await mkdir(join(homeDir, ".hunch"));
    await writeFile(
      join(homeDir, ".hunch", "config.yaml"),
      ["agent:", "  log_decisions: sometimes", ""].join("\n"),
    );

    await expect(loadConfig({ homeDir, cwd: "/repo" })).rejects.toThrow(
      /Invalid Hunch config: agent.log_decisions/,
    );
  });

  it("rejects non-string scalar overrides", async () => {
    const homeDir = await makeHome();
    await mkdir(join(homeDir, ".hunch"));
    await writeFile(join(homeDir, ".hunch", "config.yaml"), "model: 123\n");

    await expect(loadConfig({ homeDir, cwd: "/repo" })).rejects.toThrow(
      /Invalid Hunch config: model/,
    );
  });

  it("rejects non-object agent config", async () => {
    const homeDir = await makeHome();
    await mkdir(join(homeDir, ".hunch"));
    await writeFile(join(homeDir, ".hunch", "config.yaml"), "agent: false\n");

    await expect(loadConfig({ homeDir, cwd: "/repo" })).rejects.toThrow(
      /Invalid Hunch config: agent/,
    );
  });
});
