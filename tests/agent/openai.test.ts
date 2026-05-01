import { beforeEach, describe, expect, it, vi } from "vitest";

import { createOpenAIClient } from "../../src/agent/openai.js";
import { HunchError } from "../../src/utils/errors.js";

const createMock = vi.fn();

vi.mock("openai", () => ({
  default: class {
    chat = {
      completions: {
        create: createMock,
      },
    };
    constructor(readonly options: { apiKey?: string }) {}
  },
}));

beforeEach(() => {
  createMock.mockReset();
});

describe("createOpenAIClient", () => {
  it("requires an API key", () => {
    expect(() => createOpenAIClient({ model: "gpt-5.4-mini" })).toThrow(
      new HunchError(
        "Missing OpenAI API key. Set OPENAI_API_KEY or configure openai.api_key_env.",
      ),
    );
  });

  it("converts text responses into agent text blocks", async () => {
    createMock.mockResolvedValueOnce({
      choices: [
        {
          finish_reason: "stop",
          message: { role: "assistant", content: "Done." },
        },
      ],
    });
    const client = createOpenAIClient({
      apiKey: "test-key",
      model: "gpt-5.4-mini",
    });

    await expect(
      client.messages.create({
        model: "gpt-5.4-mini",
        max_tokens: 256,
        system: [{ type: "text", text: "System", cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: "Hello" }],
      }),
    ).resolves.toEqual({
      content: [{ type: "text", text: "Done." }],
      stop_reason: "end_turn",
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.4-mini",
        max_completion_tokens: 256,
        messages: [
          { role: "system", content: "System" },
          { role: "user", content: "Hello" },
        ],
      }),
    );
  });

  it("maps tool calls into agent tool_use blocks", async () => {
    createMock.mockResolvedValueOnce({
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: {
                  name: "read_file",
                  arguments: '{"path":"app/src/App.tsx"}',
                },
              },
            ],
          },
        },
      ],
    });
    const client = createOpenAIClient({
      apiKey: "test-key",
      model: "gpt-5.4-mini",
    });

    await expect(
      client.messages.create({
        model: "gpt-5.4-mini",
        max_tokens: 256,
        tools: [
          {
            name: "read_file",
            description: "Read a file",
            input_schema: {
              type: "object",
              properties: { path: { type: "string" } },
              required: ["path"],
            },
          },
        ],
        messages: [{ role: "user", content: "Read App" }],
      }),
    ).resolves.toEqual({
      content: [
        {
          type: "tool_use",
          id: "call_1",
          name: "read_file",
          input: { path: "app/src/App.tsx" },
        },
      ],
      stop_reason: "tool_use",
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [
          {
            type: "function",
            function: {
              name: "read_file",
              description: "Read a file",
              parameters: {
                type: "object",
                properties: { path: { type: "string" } },
                required: ["path"],
              },
            },
          },
        ],
      }),
    );
  });

  it("treats any response with tool calls as a tool-use turn", async () => {
    createMock.mockResolvedValueOnce({
      choices: [
        {
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: {
                  name: "write_file",
                  arguments: '{"path":"app/src/App.tsx","content":"export default function App() { return null; }"}',
                },
              },
            ],
          },
        },
      ],
    });
    const client = createOpenAIClient({
      apiKey: "test-key",
      model: "gpt-5.4-mini",
    });

    await expect(
      client.messages.create({
        model: "gpt-5.4-mini",
        max_tokens: 256,
        messages: [{ role: "user", content: "Write App" }],
      }),
    ).resolves.toEqual({
      content: [
        {
          type: "tool_use",
          id: "call_1",
          name: "write_file",
          input: {
            path: "app/src/App.tsx",
            content: "export default function App() { return null; }",
          },
        },
      ],
      stop_reason: "tool_use",
    });
  });
});
