import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { showCommand } from "../../src/commands/show.js";
import { HunchError } from "../../src/utils/errors.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("showCommand", () => {
  it("writes generated interview materials and starts the demo server after confirmation", async () => {
    const { homeDir, showDir } = await setupActiveSpike();
    const client = fakeClient([
      { content: [{ type: "text", text: "## Walkthrough\n\n1. Open app" }] },
      { content: [{ type: "text", text: "- What changed?" }] },
    ]);
    const input = vi.fn().mockResolvedValue("");
    const run = vi.fn().mockResolvedValue(undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await showCommand({
      homeDir,
      cwd: "/repo",
      client,
      env: { ANTHROPIC_API_KEY: "test-key" },
      input,
      run,
    });

    await expect(readFile(join(showDir, "script.md"), "utf8")).resolves.toBe(
      "## Walkthrough\n\n1. Open app\n",
    );
    await expect(readFile(join(showDir, "questions.md"), "utf8")).resolves.toBe(
      "- What changed?\n",
    );
    expect(log).toHaveBeenCalledWith("## Walkthrough\n\n1. Open app");
    expect(log).toHaveBeenCalledWith("- What changed?");
    expect(input).toHaveBeenCalledWith({
      message: "Press Return to start the demo server",
    });
    expect(run).toHaveBeenCalledWith({ homeDir, cwd: "/repo", demo: true });
  });

  it("does not write partial files when the second API request fails", async () => {
    const { homeDir, showDir } = await setupActiveSpike();
    const client = fakeClient([
      { content: [{ type: "text", text: "script" }] },
      new Error("rate limit"),
    ]);

    await expect(
      showCommand({
        homeDir,
        cwd: "/repo",
        client,
        env: { ANTHROPIC_API_KEY: "test-key" },
        input: vi.fn(),
        run: vi.fn(),
      }),
    ).rejects.toEqual(new HunchError("Show generation failed: rate limit"));

    await expect(
      readFile(join(showDir, "script.md"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      readFile(join(showDir, "questions.md"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("throws HunchError when generated text is empty", async () => {
    const { homeDir } = await setupActiveSpike();
    const client = fakeClient([
      { content: [{ type: "text", text: "   " }] },
      { content: [{ type: "text", text: "- Question" }] },
    ]);

    await expect(
      showCommand({
        homeDir,
        cwd: "/repo",
        client,
        env: { ANTHROPIC_API_KEY: "test-key" },
        input: vi.fn(),
        run: vi.fn(),
      }),
    ).rejects.toEqual(
      new HunchError("Show generation returned an empty response."),
    );
  });

  it("throws HunchError when the configured Anthropic API key is missing", async () => {
    const { homeDir } = await setupActiveSpike();

    await expect(
      showCommand({
        homeDir,
        cwd: "/repo",
        env: { ANTHROPIC_API_KEY: "" },
        input: vi.fn(),
        run: vi.fn(),
      }),
    ).rejects.toEqual(
      new HunchError(
        "Missing Anthropic API key. Set ANTHROPIC_API_KEY or configure api_key_env.",
      ),
    );
  });
});

async function setupActiveSpike(): Promise<{
  homeDir: string;
  showDir: string;
}> {
  const homeDir = await mkdtemp(join(tmpdir(), "hunch-show-test-"));
  const spikeDir = join(homeDir, "spikes");
  const hunchDir = join(spikeDir, "2026-04-25-show", ".hunch");
  await mkdir(hunchDir, { recursive: true });
  await mkdir(join(spikeDir, "2026-04-25-show", "app"), { recursive: true });
  await mkdir(join(homeDir, ".hunch"), { recursive: true });
  await writeFile(
    join(homeDir, ".hunch", "config.yaml"),
    `spike_dir: ${spikeDir}\n`,
  );
  await writeFile(join(homeDir, ".hunch", "active"), "2026-04-25-show\n");
  await writeFile(join(hunchDir, "problem.md"), "Problem\n");
  await writeFile(join(hunchDir, "persona.md"), "Persona\n");
  await writeFile(join(hunchDir, "journey.md"), "Journey\n");
  await writeFile(join(hunchDir, "decisions.md"), "Decisions\n");

  return { homeDir, showDir: join(hunchDir, "show") };
}

function fakeClient(
  responses: Array<
    Error | { content: Array<{ type: string; text?: string }> }
  >,
) {
  return {
    messages: {
      create: vi.fn(async () => {
        const next = responses.shift();
        if (next instanceof Error) {
          throw next;
        }

        return next;
      }),
    },
  };
}
