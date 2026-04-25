import type Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runAgentLoop } from "../../src/agent/loop.js";
import type { SpikeRef } from "../../src/state/spike.js";
import { HunchError } from "../../src/utils/errors.js";

vi.mock("../../src/state/config.js", () => ({
  loadConfig: vi.fn(async () => ({
    provider: "anthropic",
    model: "claude-test",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    spikeDir: "/unused",
    pushBackOnScopeCreep: true,
    logDecisions: true,
  })),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runAgentLoop", () => {
  it("returns final text and appends user and assistant session events", async () => {
    const spike = await makeSpike();
    const client = fakeClient([
      messageResponse({
        content: [{ type: "text", text: "Build the narrow version first." }],
        stopReason: "end_turn",
      }),
    ]);
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const result = await runAgentLoop({
      client,
      spike,
      message: "What should I build?",
    });

    expect(result).toBe("Build the narrow version first.");
    expect(stdout).toHaveBeenCalledWith("Build the narrow version first.");
    expect(client.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-test",
        max_tokens: 4096,
        system: expect.stringContaining("Problem"),
        tools: expect.any(Array),
        messages: [{ role: "user", content: "What should I build?" }],
      }),
    );
    await expect(readSession(spike)).resolves.toEqual([
      expect.objectContaining({
        role: "user",
        content: "What should I build?",
      }),
      expect.objectContaining({
        role: "assistant",
        content: "Build the narrow version first.",
      }),
    ]);
  });

  it("dispatches tool use, records the tool event, and continues with tool_result", async () => {
    const spike = await makeSpike();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const client = fakeClient([
      messageResponse({
        content: [
          {
            type: "tool_use",
            id: "toolu_1",
            name: "write_file",
            input: { path: "notes.txt", content: "hello" },
          },
        ],
        stopReason: "tool_use",
      }),
      messageResponse({
        content: [{ type: "text", text: "I wrote the notes." }],
        stopReason: "end_turn",
      }),
    ]);

    const result = await runAgentLoop({
      client,
      spike,
      message: "Write a note",
    });

    expect(result).toBe("I wrote the notes.");
    await expect(readFile(join(spike.dir, "notes.txt"), "utf8")).resolves.toBe(
      "hello",
    );
    expect(client.messages.create).toHaveBeenCalledTimes(2);
    expect(client.messages.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ role: "assistant" }),
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "toolu_1",
                content: "Wrote notes.txt",
              },
            ],
          },
        ]),
      }),
    );
    await expect(readSession(spike)).resolves.toEqual([
      expect.objectContaining({ role: "user", content: "Write a note" }),
      expect.objectContaining({
        role: "tool",
        content: "Wrote notes.txt",
        toolName: "write_file",
        toolInput: { path: "notes.txt", content: "hello" },
        toolResult: "Wrote notes.txt",
      }),
      expect.objectContaining({
        role: "assistant",
        content: "I wrote the notes.",
      }),
    ]);
  });

  it("throws HunchError for unknown tools", async () => {
    const spike = await makeSpike();
    const client = fakeClient([
      messageResponse({
        content: [
          {
            type: "tool_use",
            id: "toolu_unknown",
            name: "mystery_tool",
            input: {},
          },
        ],
        stopReason: "tool_use",
      }),
    ]);

    await expect(
      runAgentLoop({ client, spike, message: "Use a mystery tool" }),
    ).rejects.toEqual(new HunchError("Unknown tool: mystery_tool"));
  });
});

function fakeClient(responses: Message[]): Anthropic {
  return {
    messages: {
      create: vi.fn(async () => {
        const response = responses.shift();
        if (!response) {
          throw new Error("No fake Anthropic response queued.");
        }
        return response;
      }),
    },
  } as unknown as Anthropic;
}

function messageResponse(options: {
  content: Message["content"];
  stopReason: Message["stop_reason"];
}): Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-test",
    content: options.content,
    stop_reason: options.stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: 1,
      output_tokens: 1,
    },
  };
}

async function makeSpike(): Promise<SpikeRef> {
  const dir = await mkdtemp(join(tmpdir(), "hunch-loop-test-"));
  const appDir = join(dir, "app");
  const hunchDir = join(dir, ".hunch");
  await mkdir(appDir, { recursive: true });
  await mkdir(hunchDir, { recursive: true });
  await writeFile(join(hunchDir, "problem.md"), "Problem\n", "utf8");
  await writeFile(join(hunchDir, "persona.md"), "Persona\n", "utf8");
  await writeFile(join(hunchDir, "journey.md"), "Journey\n", "utf8");
  await writeFile(join(hunchDir, "decisions.md"), "Decisions\n", "utf8");

  return {
    name: "2026-04-25-loop",
    dir,
    appDir,
    hunchDir,
  };
}

async function readSession(spike: SpikeRef): Promise<unknown[]> {
  const contents = await readFile(join(spike.hunchDir, "session.jsonl"), "utf8");
  return contents
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as unknown);
}
