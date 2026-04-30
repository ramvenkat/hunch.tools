import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import type {
  AgentMessageCreateParams,
  AgentMessageResponse,
  AgentProviderClient,
} from "./client.js";
import type { HunchConfig } from "../state/config.js";
import { HunchError } from "../utils/errors.js";

export interface LocalModelStatus {
  enabled: boolean;
  model: string;
  modelPath: string;
  modelUrl: string;
  exists: boolean;
  sizeBytes: number | null;
  ready: boolean;
}

export interface LocalModelDeps {
  stat?: typeof fs.stat;
  mkdir?: typeof fs.mkdir;
  rename?: typeof fs.rename;
  unlink?: typeof fs.unlink;
  downloadFile?: (url: string, destinationPath: string) => Promise<void>;
}

export interface LocalRuntimeDeps {
  importRuntime?: () => Promise<LocalLlamaRuntime>;
}

interface LocalLlamaRuntime {
  getLlama: () => Promise<{
    loadModel: (options: { modelPath: string }) => Promise<{
      createContext: () => Promise<{
        getSequence: () => unknown;
      }>;
    }>;
  }>;
  LlamaChatSession: new (options: { contextSequence: unknown }) => {
    prompt: (
      prompt: string,
      options?: { maxTokens?: number },
    ) => Promise<string>;
  };
}

export async function getLocalModelStatus(
  config: HunchConfig,
  deps: LocalModelDeps = {},
): Promise<LocalModelStatus> {
  const stat = deps.stat ?? fs.stat;
  let exists = false;
  let sizeBytes: number | null = null;

  try {
    const modelStat = await stat(config.local.modelPath);
    exists = modelStat.isFile();
    sizeBytes = exists ? modelStat.size : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  return {
    enabled: config.local.enabled,
    model: config.local.model,
    modelPath: config.local.modelPath,
    modelUrl: config.local.modelUrl,
    exists,
    sizeBytes,
    ready: config.local.enabled && exists,
  };
}

export async function setupLocalModel(
  config: HunchConfig,
  deps: LocalModelDeps = {},
): Promise<LocalModelStatus> {
  if (!config.local.enabled) {
    throw new HunchError("Local model is disabled in Hunch config.");
  }

  const before = await getLocalModelStatus(config, deps);
  if (before.exists) {
    return before;
  }

  if (config.local.modelUrl.length === 0) {
    throw new HunchError(
      [
        "Local model is not installed and no local.model_url is configured.",
        `Expected model path: ${config.local.modelPath}`,
      ].join("\n"),
    );
  }

  const mkdir = deps.mkdir ?? fs.mkdir;
  const rename = deps.rename ?? fs.rename;
  const unlink = deps.unlink ?? fs.unlink;
  const downloadFile = deps.downloadFile ?? downloadModelFile;
  const modelDir = path.dirname(config.local.modelPath);
  const tempPath = path.join(
    modelDir,
    `.${path.basename(config.local.modelPath)}.${process.pid}.tmp`,
  );

  await mkdir(modelDir, { recursive: true });

  try {
    await downloadFile(config.local.modelUrl, tempPath);
    await rename(tempPath, config.local.modelPath);
  } catch (error) {
    try {
      await unlink(tempPath);
    } catch (unlinkError) {
      if ((unlinkError as NodeJS.ErrnoException).code !== "ENOENT") {
        throw unlinkError;
      }
    }
    throw error;
  }

  return getLocalModelStatus(config, deps);
}

export function createLocalClient(
  config: HunchConfig,
  deps: LocalRuntimeDeps = {},
): AgentProviderClient {
  let sessionPromise: Promise<Awaited<ReturnType<typeof createLocalSession>>> | null =
    null;

  return {
    provider: "local",
    model: config.local.model,
    messages: {
      create: async (params) => {
        sessionPromise ??= createLocalSession(config, deps);
        const session = await sessionPromise;
        const text = await session.prompt(renderLocalPrompt(params), {
          maxTokens: params.max_tokens,
        });

        return localTextToResponse(text);
      },
    },
  };
}

async function createLocalSession(
  config: HunchConfig,
  deps: LocalRuntimeDeps,
): Promise<{
  prompt: (prompt: string, options?: { maxTokens?: number }) => Promise<string>;
}> {
  const runtime = await loadLocalRuntime(deps);
  const llama = await runtime.getLlama();
  const model = await llama.loadModel({ modelPath: config.local.modelPath });
  const context = await model.createContext();
  return new runtime.LlamaChatSession({
    contextSequence: context.getSequence(),
  });
}

async function loadLocalRuntime(
  deps: LocalRuntimeDeps,
): Promise<LocalLlamaRuntime> {
  try {
    return await (deps.importRuntime ?? importNodeLlamaCpp)();
  } catch (error) {
    throw new HunchError(
      [
        "Local model runtime requires node-llama-cpp.",
        "Install it with `npm install node-llama-cpp`, then run `hunch local setup`.",
        `Runtime error: ${errorMessage(error)}`,
      ].join("\n"),
    );
  }
}

function renderLocalPrompt(params: AgentMessageCreateParams): string {
  const parts = [
    params.system ? `SYSTEM:\n${renderLocalSystem(params.system)}` : "",
    params.tools && params.tools.length > 0
      ? [
          "TOOLS:",
          "When you need to use a tool, respond with exactly one tool call wrapped in <tool_call> tags.",
          'Example: <tool_call>{"name":"read_file","input":{"path":"src/App.tsx"}}</tool_call>',
          JSON.stringify(params.tools),
        ].join("\n")
      : "",
    ...params.messages.map(
      (message) => `${message.role.toUpperCase()}:\n${renderLocalContent(message.content)}`,
    ),
    "ASSISTANT:",
  ].filter((part) => part.length > 0);

  return parts.join("\n\n");
}

function renderLocalSystem(
  system: AgentMessageCreateParams["system"],
): string {
  if (typeof system === "string") {
    return system;
  }

  return (system ?? []).map((block) => block.text).join("\n");
}

function renderLocalContent(
  content: AgentMessageCreateParams["messages"][number]["content"],
): string {
  if (typeof content === "string") {
    return content;
  }

  return content
    .map((block) => {
      if (block.type === "text") {
        return block.text;
      }

      if (block.type === "tool_result") {
        return `Tool result ${block.tool_use_id}: ${block.content}`;
      }

      return JSON.stringify(block);
    })
    .join("\n");
}

function localTextToResponse(text: string): AgentMessageResponse {
  const toolCall = parseLocalToolCall(text);
  if (!toolCall) {
    return {
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
    };
  }

  const content: AgentMessageResponse["content"] = [];
  if (toolCall.textBefore.length > 0) {
    content.push({ type: "text", text: toolCall.textBefore });
  }

  content.push({
    type: "tool_use",
    id: `local_${randomUUID()}`,
    name: toolCall.name,
    input: toolCall.input,
  });

  return {
    content,
    stop_reason: "tool_use",
  };
}

function parseLocalToolCall(text: string):
  | {
      textBefore: string;
      name: string;
      input: Record<string, unknown>;
    }
  | undefined {
  const match = text.match(/<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/);
  if (!match) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1] ?? "");
  } catch {
    return undefined;
  }

  if (!isToolCall(parsed)) {
    return undefined;
  }

  return {
    textBefore: text.slice(0, match.index).trim(),
    name: parsed.name,
    input: parsed.input,
  };
}

function isToolCall(
  value: unknown,
): value is { name: string; input: Record<string, unknown> } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "name" in value &&
    typeof value.name === "string" &&
    "input" in value &&
    typeof value.input === "object" &&
    value.input !== null &&
    !Array.isArray(value.input)
  );
}

async function importNodeLlamaCpp(): Promise<LocalLlamaRuntime> {
  const dynamicImport = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<LocalLlamaRuntime>;

  return dynamicImport("node-llama-cpp");
}

async function downloadModelFile(
  url: string,
  destinationPath: string,
): Promise<void> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new HunchError(
      `Failed to download local model from ${url}: HTTP ${response.status}`,
    );
  }

  if (!response.body) {
    throw new HunchError(`Failed to download local model from ${url}: empty body`);
  }

  await pipeline(
    Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
    createWriteStream(destinationPath),
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
