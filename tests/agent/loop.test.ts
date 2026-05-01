import type { Message } from "@anthropic-ai/sdk/resources/messages/messages";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentProviderClient } from "../../src/agent/client.js";
import { runAgentLoop } from "../../src/agent/loop.js";
import type { SpikeRef } from "../../src/state/spike.js";
import { HunchError } from "../../src/utils/errors.js";

vi.mock("../../src/state/config.js", () => ({
  loadConfig: vi.fn(async () => ({
    provider: "anthropic",
    fallbackProvider: "anthropic",
    model: "claude-test",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    spikeDir: "/unused",
    local: {
      enabled: true,
      modelPath: "/unused/model.gguf",
      modelUrl: "",
      model: "hunch-lite",
    },
    openai: {
      model: "gpt-5.4-mini",
      apiKeyEnv: "OPENAI_API_KEY",
    },
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
        system: expect.arrayContaining([
          expect.objectContaining({
            type: "text",
            text: expect.stringContaining("Problem"),
            cache_control: { type: "ephemeral" },
          }),
        ]),
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
        role: "assistant",
        content: "",
        contentBlocks: [
          {
            type: "tool_use",
            id: "toolu_1",
            name: "write_file",
            input: { path: "notes.txt", content: "hello" },
          },
        ],
      }),
      expect.objectContaining({
        role: "tool",
        content: "Wrote notes.txt",
        toolUseId: "toolu_1",
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

  it("returns tool errors to Anthropic and lets the model recover", async () => {
    const spike = await makeSpike();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const client = fakeClient([
      messageResponse({
        content: [
          {
            type: "tool_use",
            id: "toolu_missing",
            name: "read_file",
            input: { path: "missing.txt" },
          },
        ],
        stopReason: "tool_use",
      }),
      messageResponse({
        content: [{ type: "text", text: "I could not read that file." }],
        stopReason: "end_turn",
      }),
    ]);

    const result = await runAgentLoop({
      client,
      spike,
      message: "Read a missing file",
    });

    expect(result).toBe("I could not read that file.");
    expect(client.messages.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        messages: expect.arrayContaining([
          {
            role: "user",
            content: [
              expect.objectContaining({
                type: "tool_result",
                tool_use_id: "toolu_missing",
                is_error: true,
                content: expect.stringContaining("read_file failed:"),
              }),
            ],
          },
        ]),
      }),
    );
    await expect(readSession(spike)).resolves.toEqual([
      expect.objectContaining({ role: "user", content: "Read a missing file" }),
      expect.objectContaining({
        role: "assistant",
        content: "",
        contentBlocks: [
          {
            type: "tool_use",
            id: "toolu_missing",
            name: "read_file",
            input: { path: "missing.txt" },
          },
        ],
      }),
      expect.objectContaining({
        role: "tool",
        toolUseId: "toolu_missing",
        toolName: "read_file",
        isError: true,
        content: expect.stringContaining("read_file failed:"),
      }),
      expect.objectContaining({
        role: "assistant",
        content: "I could not read that file.",
      }),
    ]);
  });

  it("returns malformed tool input as an error tool_result", async () => {
    const spike = await makeSpike();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const client = fakeClient([
      messageResponse({
        content: [
          {
            type: "tool_use",
            id: "toolu_bad",
            name: "write_file",
            input: { path: "notes.txt" },
          },
        ],
        stopReason: "tool_use",
      }),
      messageResponse({
        content: [{ type: "text", text: "I need file content before writing." }],
        stopReason: "end_turn",
      }),
    ]);

    const result = await runAgentLoop({
      client,
      spike,
      message: "Write an invalid note",
    });

    expect(result).toBe("I need file content before writing.");
    expect(client.messages.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        messages: expect.arrayContaining([
          {
            role: "user",
            content: [
              expect.objectContaining({
                type: "tool_result",
                tool_use_id: "toolu_bad",
                is_error: true,
                content: "write_file failed: write_file.content must be a string.",
              }),
            ],
          },
        ]),
      }),
    );
  });

  it("stops after the configured maximum tool iterations", async () => {
    const spike = await makeSpike();
    const client = fakeClient([
      messageResponse({
        content: [
          {
            type: "tool_use",
            id: "toolu_1",
            name: "list_files",
            input: {},
          },
        ],
        stopReason: "tool_use",
      }),
      messageResponse({
        content: [
          {
            type: "tool_use",
            id: "toolu_2",
            name: "list_files",
            input: {},
          },
        ],
        stopReason: "tool_use",
      }),
    ]);

    await expect(
      runAgentLoop({
        client,
        spike,
        message: "Loop tools",
        maxToolIterations: 1,
      }),
    ).rejects.toEqual(
      new HunchError("Agent exceeded maximum tool iterations of 1."),
    );
    expect(client.messages.create).toHaveBeenCalledTimes(1);
  });

  it("wraps Anthropic failures and still persists the user event", async () => {
    const spike = await makeSpike();
    const client = {
      provider: "anthropic",
      model: "claude-test",
      messages: {
        create: vi.fn(async () => {
          throw new Error("connection reset");
        }),
      },
    } as unknown as AgentProviderClient;

    await expect(
      runAgentLoop({ client, spike, message: "Hello?" }),
    ).rejects.toEqual(
      new HunchError("Anthropic request failed: connection reset"),
    );

    await expect(readSession(spike)).resolves.toEqual([
      expect.objectContaining({ role: "user", content: "Hello?" }),
    ]);
  });

  it("returns unknown tools as error tool_results", async () => {
    const spike = await makeSpike();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
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
      messageResponse({
        content: [{ type: "text", text: "That tool is not available." }],
        stopReason: "end_turn",
      }),
    ]);

    const result = await runAgentLoop({
      client,
      spike,
      message: "Use a mystery tool",
    });

    expect(result).toBe("That tool is not available.");
    expect(client.messages.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        messages: expect.arrayContaining([
          {
            role: "user",
            content: [
              expect.objectContaining({
                type: "tool_result",
                tool_use_id: "toolu_unknown",
                is_error: true,
                content: "mystery_tool failed: Unknown tool: mystery_tool",
              }),
            ],
          },
        ]),
      }),
    );
  });

  it("replays parallel tool results in one user message", async () => {
    const spike = await makeSpike();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await writeFile(
      join(spike.hunchDir, "session.jsonl"),
      [
        JSON.stringify({
          role: "user",
          content: "Inspect the app",
          ts: "2026-04-25T12:00:00.000Z",
        }),
        JSON.stringify({
          role: "assistant",
          content: "",
          ts: "2026-04-25T12:00:01.000Z",
          contentBlocks: [
            {
              type: "tool_use",
              id: "toolu_1",
              name: "read_file",
              input: { path: "a.txt" },
            },
            {
              type: "tool_use",
              id: "toolu_2",
              name: "read_file",
              input: { path: "b.txt" },
            },
          ],
        }),
        JSON.stringify({
          role: "tool",
          content: "A",
          ts: "2026-04-25T12:00:02.000Z",
          toolUseId: "toolu_1",
          toolName: "read_file",
        }),
        JSON.stringify({
          role: "tool",
          content: "B",
          ts: "2026-04-25T12:00:03.000Z",
          toolUseId: "toolu_2",
          toolName: "read_file",
        }),
      ].join("\n") + "\n",
      "utf8",
    );
    const client = fakeClient([
      messageResponse({
        content: [{ type: "text", text: "Continuing." }],
        stopReason: "end_turn",
      }),
    ]);

    await runAgentLoop({
      client,
      spike,
      message: "Continue",
    });

    expect(client.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: "user", content: "Inspect the app" },
          expect.objectContaining({ role: "assistant" }),
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "toolu_1",
                content: "A",
              },
              {
                type: "tool_result",
                tool_use_id: "toolu_2",
                content: "B",
              },
            ],
          },
          { role: "user", content: "Continue" },
        ],
      }),
    );
  });
});

function fakeClient(responses: Message[]): AgentProviderClient {
  return {
    provider: "anthropic",
    model: "claude-test",
    messages: {
      create: vi.fn(async () => {
        const response = responses.shift();
        if (!response) {
          throw new Error("No fake Anthropic response queued.");
        }
        return response;
      }),
    },
  } as unknown as AgentProviderClient;
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
