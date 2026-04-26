import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  extractText,
  showCommand,
  writeShowFilesAtomically,
} from "../../src/commands/show.js";
import { HunchError } from "../../src/utils/errors.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("showCommand", () => {
  it("writes generated materials and seed data, then stops the demo server after confirmation", async () => {
    const { homeDir, showDir, appDir } = await setupActiveSpike();
    const client = fakeClient([
      { content: [{ type: "text", text: "## Walkthrough\n\n1. Open app" }] },
      { content: [{ type: "text", text: "- What changed?" }] },
      {
        content: [
          {
            type: "text",
            text: '{"items":[{"title":"Pilot workspace","body":"A realistic scenario for the demo."}]}',
          },
        ],
      },
    ]);
    const input = vi.fn().mockResolvedValue("");
    const server = {
      stop: vi.fn(),
      wait: Promise.resolve(undefined),
    };
    const startDevServer = vi.fn().mockResolvedValue(server);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await showCommand({
      homeDir,
      cwd: "/repo",
      client,
      env: { ANTHROPIC_API_KEY: "test-key" },
      input,
      startDevServer,
    });

    await expect(readFile(join(showDir, "script.md"), "utf8")).resolves.toBe(
      "## Walkthrough\n\n1. Open app\n",
    );
    await expect(readFile(join(showDir, "questions.md"), "utf8")).resolves.toBe(
      "- What changed?\n",
    );
    await expect(
      readFile(join(appDir, "src", "seed-data.json"), "utf8"),
    ).resolves.toBe(
      `${JSON.stringify(
        {
          items: [
            {
              title: "Pilot workspace",
              body: "A realistic scenario for the demo.",
            },
          ],
        },
        null,
        2,
      )}\n`,
    );
    expect(client.messages.create).toHaveBeenCalledTimes(3);
    expect(client.messages.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({
                text: expect.stringContaining(
                  "Write a concise customer interview walkthrough script",
                ),
              }),
            ]),
          }),
        ],
      }),
    );
    expect(client.messages.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({
                text: expect.stringContaining("Write customer interview questions"),
              }),
            ]),
          }),
        ],
      }),
    );
    expect(client.messages.create).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({
                text: expect.stringContaining("Generate realistic demo data"),
              }),
            ]),
          }),
        ],
      }),
    );
    expect(startDevServer).toHaveBeenCalledWith({
      homeDir,
      cwd: "/repo",
      demo: true,
    });
    expect(log).toHaveBeenCalledWith("## Walkthrough\n\n1. Open app");
    expect(log).toHaveBeenCalledWith("- What changed?");
    expect(input).toHaveBeenCalledWith({
      message: "Press Return to stop the demo server",
    });
    expect(server.stop).toHaveBeenCalled();
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
        startDevServer: vi.fn(),
      }),
    ).rejects.toEqual(
      new HunchError("Failed to generate interview questions: rate limit"),
    );

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
        startDevServer: vi.fn(),
      }),
    ).rejects.toEqual(
      new HunchError("Show generation returned an empty response."),
    );
  });

  it("labels walkthrough script generation failures", async () => {
    const { homeDir } = await setupActiveSpike();
    const client = fakeClient([
      new Error("overloaded"),
      { content: [{ type: "text", text: "- Question" }] },
    ]);

    await expect(
      showCommand({
        homeDir,
        cwd: "/repo",
        client,
        env: { ANTHROPIC_API_KEY: "test-key" },
        input: vi.fn(),
        startDevServer: vi.fn(),
      }),
    ).rejects.toEqual(
      new HunchError("Failed to generate walkthrough script: overloaded"),
    );
    expect(client.messages.create).toHaveBeenCalledTimes(3);
  });

  it("throws HunchError when the configured Anthropic API key is missing", async () => {
    const { homeDir } = await setupActiveSpike();

    await expect(
      showCommand({
        homeDir,
        cwd: "/repo",
        env: { ANTHROPIC_API_KEY: "" },
        input: vi.fn(),
        startDevServer: vi.fn(),
      }),
    ).rejects.toEqual(
      new HunchError(
        "Missing Anthropic API key. Set ANTHROPIC_API_KEY or configure api_key_env.",
      ),
    );
  });
});

describe("extractText", () => {
  it("joins text blocks and ignores non-text blocks", () => {
    expect(
      extractText([
        { type: "text", text: "First" },
        { type: "tool_use", text: "ignored" },
        { type: "text", text: "Second" },
      ]),
    ).toBe("First\nSecond");
  });
});

describe("writeShowFilesAtomically", () => {
  it("rolls back final outputs and cleans temporary files when a rename fails", async () => {
    const showDir = await mkdtemp(join(tmpdir(), "hunch-show-atomic-test-"));
    await writeFile(join(showDir, "script.md"), "old script\n");
    await writeFile(join(showDir, "questions.md"), "old questions\n");
    const fs = {
      mkdir: vi.fn(mkdir),
      writeFile: vi.fn(writeFile),
      rename: vi
        .fn((from: string, to: string) => rename(from, to))
        .mockImplementationOnce((from: string, to: string) => rename(from, to))
        .mockImplementationOnce(async () => {
          throw new Error("rename failed");
        }),
      rm: vi.fn((path: string) => rm(path, { force: true, recursive: true })),
    };

    await expect(
      writeShowFilesAtomically(showDir, "new script", "new questions", fs),
    ).rejects.toThrow("rename failed");

    await expect(readFile(join(showDir, "script.md"), "utf8")).resolves.toBe(
      "old script\n",
    );
    await expect(readFile(join(showDir, "questions.md"), "utf8")).resolves.toBe(
      "old questions\n",
    );
    await expect(readdir(showDir)).resolves.toEqual(["questions.md", "script.md"]);
  });
});

async function setupActiveSpike(): Promise<{
  homeDir: string;
  showDir: string;
  appDir: string;
}> {
  const homeDir = await mkdtemp(join(tmpdir(), "hunch-show-test-"));
  const spikeDir = join(homeDir, "spikes");
  const hunchDir = join(spikeDir, "2026-04-25-show", ".hunch");
  await mkdir(hunchDir, { recursive: true });
  const appDir = join(spikeDir, "2026-04-25-show", "app");
  await mkdir(appDir, { recursive: true });
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

  return { homeDir, showDir: join(hunchDir, "show"), appDir };
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
