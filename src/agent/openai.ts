import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

import { HunchError } from "../utils/errors.js";
import type {
  AgentMessageCreateParams,
  AgentMessageResponse,
  AgentProviderClient,
  AgentSystemTextBlock,
} from "./client.js";

export interface OpenAIClientOptions {
  apiKey?: string;
  model: string;
}

export function createOpenAIClient(
  options: OpenAIClientOptions,
): AgentProviderClient {
  if (!options.apiKey) {
    throw new HunchError(
      "Missing OpenAI API key. Set OPENAI_API_KEY or configure openai.api_key_env.",
    );
  }

  const client = new OpenAI({ apiKey: options.apiKey });
  return {
    provider: "openai",
    model: options.model,
    messages: {
      create: async (params) => {
        const response = await client.chat.completions.create({
          model: params.model,
          max_completion_tokens: params.max_tokens,
          messages: toOpenAIMessages(params),
          tools: toOpenAITools(params.tools),
        });
        const choice = response.choices[0];
        if (!choice) {
          return { content: [], stop_reason: "end_turn" };
        }

        return {
          content: toAgentContent(choice.message),
          stop_reason: hasToolCalls(choice.message) ? "tool_use" : "end_turn",
        };
      },
    },
  };
}

function toOpenAIMessages(
  params: AgentMessageCreateParams,
): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [];

  if (params.system) {
    messages.push({ role: "system", content: renderSystem(params.system) });
  }

  for (const message of params.messages) {
    if (typeof message.content === "string") {
      messages.push({ role: message.role, content: message.content });
      continue;
    }

    if (message.role === "assistant") {
      messages.push(toOpenAIAssistantMessage(message.content));
      continue;
    }

    const text = message.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("\n");
    if (text.length > 0) {
      messages.push({ role: "user", content: text });
    }

    for (const block of message.content) {
      if (block.type !== "tool_result") {
        continue;
      }

      messages.push({
        role: "tool",
        tool_call_id: block.tool_use_id,
        content: stringifyToolResultContent(block.content),
      });
    }
  }

  return messages;
}

function toOpenAIAssistantMessage(
  content: AgentMessageCreateParams["messages"][number]["content"],
): ChatCompletionMessageParam {
  const blocks = Array.isArray(content) ? content : [];
  const text = blocks
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("\n");
  const toolCalls = blocks.flatMap((block) => {
    if (block.type !== "tool_use") {
      return [];
    }

    return [
      {
        id: block.id,
        type: "function" as const,
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input ?? {}),
        },
      },
    ];
  });

  return {
    role: "assistant",
    content: text.length > 0 ? text : null,
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  };
}

function toOpenAITools(tools: unknown[] | undefined): ChatCompletionTool[] {
  return (tools ?? []).flatMap((tool) => {
    if (!isAnthropicTool(tool)) {
      return [];
    }

    return [
      {
        type: "function" as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema,
        },
      },
    ];
  });
}

function toAgentContent(
  message: OpenAI.Chat.Completions.ChatCompletionMessage,
): AgentMessageResponse["content"] {
  const content: AgentMessageResponse["content"] = [];
  if (message.content && message.content.length > 0) {
    content.push({ type: "text", text: message.content });
  }

  for (const toolCall of message.tool_calls ?? []) {
    if (toolCall.type !== "function") {
      continue;
    }

    content.push({
      type: "tool_use",
      id: toolCall.id,
      name: toolCall.function.name,
      input: parseToolArguments(toolCall.function.arguments),
    });
  }

  return content;
}

function hasToolCalls(
  message: OpenAI.Chat.Completions.ChatCompletionMessage,
): boolean {
  return (message.tool_calls ?? []).length > 0;
}

function parseToolArguments(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fall through to empty input. Tool validation will return a useful error.
  }

  return {};
}

function renderSystem(system: string | AgentSystemTextBlock[]): string {
  if (typeof system === "string") {
    return system;
  }

  return system.map((block) => block.text).join("\n");
}

function stringifyToolResultContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  return JSON.stringify(content);
}

function isAnthropicTool(value: unknown): value is {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "name" in value &&
    typeof value.name === "string" &&
    "input_schema" in value &&
    typeof value.input_schema === "object" &&
    value.input_schema !== null &&
    !Array.isArray(value.input_schema)
  );
}
