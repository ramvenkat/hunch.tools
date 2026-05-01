import type {
  ContentBlockParam,
  MessageParam,
  ToolResultBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages/messages";
import path from "node:path";

import type { SpikeRef } from "../state/spike.js";
import { toolDefinitions } from "../tools/definitions.js";
import {
  editFileTool,
  listFilesTool,
  readFileTool,
  writeFileTool,
  type EditFileToolInput,
  type ListFilesToolInput,
  type ReadFileToolInput,
  type WriteFileToolInput,
} from "../tools/file-tools.js";
import { runShellTool, type RunShellToolInput } from "../tools/shell.js";
import { appendDecision, type DecisionInput } from "../tools/ux-decisions.js";
import { HunchError } from "../utils/errors.js";
import type { AgentProviderClient } from "./client.js";
import { timestamp } from "../utils/time.js";
import { loadSpikeContext } from "./context.js";
import { loadPrompt } from "./prompts.js";
import { appendSessionEvent, readRecentSession } from "./session.js";
import type { SessionEvent } from "./types.js";

export interface RunAgentLoopOptions {
  client: AgentProviderClient;
  spike: SpikeRef;
  message: string;
  verbose?: boolean;
  progress?: boolean;
  maxToolIterations?: number;
}

interface ToolRunResult {
  content: string;
  isError: boolean;
  rawResult?: unknown;
}

const DEFAULT_MAX_TOOL_ITERATIONS = 50;
const MAX_REPEATED_TOOL_FAILURES = 3;

export async function runAgentLoop(
  options: RunAgentLoopOptions,
): Promise<string> {
  const context = await loadSpikeContext(options.spike);
  const system = await loadPrompt("main", {
    problem: context.problem,
    persona: context.persona,
    journey: context.journey,
    decisions: context.decisions,
    fileTree: context.fileTree,
  });
  const sessionFile = path.join(options.spike.hunchDir, "session.jsonl");
  const priorEvents = await readRecentSession(sessionFile);
  const userEvent = sessionEvent("user", options.message);

  await appendSessionEvent(sessionFile, userEvent);

  const messages = [
    ...sessionEventsToMessages(priorEvents),
    { role: "user", content: options.message } satisfies MessageParam,
  ];
  let finalText = "";
  let toolIterations = 0;
  const repeatedToolFailures = new Map<string, number>();
  const maxToolIterations =
    options.maxToolIterations ?? DEFAULT_MAX_TOOL_ITERATIONS;

  while (true) {
    writeProgress(
      options,
      `Thinking with ${providerLabel(options.client.provider)} ${options.client.model}...`,
    );
    const response = await createMessage(options.client, {
      model: options.client.model,
      system,
      messages,
    });
    const toolUses: ToolUseBlock[] = [];

    messages.push({
      role: "assistant",
      content: response.content,
    });
    await appendSessionEvent(
      sessionFile,
      assistantSessionEvent(response.content),
    );

    for (const block of response.content) {
      if (block.type === "text") {
        finalText += block.text;
        process.stdout.write(block.text);
        continue;
      }

      if (block.type === "tool_use") {
        toolUses.push(block);
      }
    }

    if (response.stop_reason !== "tool_use") {
      if (finalText.length === 0 && toolUses.length === 0) {
        writeProgress(
          options,
          "The model returned no text or tool calls. Try again, or rerun with --verbose if this keeps happening.",
        );
      }
      break;
    }

    toolIterations += 1;

    if (toolUses.length === 0) {
      throw new HunchError(
        "Anthropic requested tool use without a tool_use block.",
      );
    }

    const toolResults: ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      writeProgress(options, `Running ${describeToolUse(toolUse)}...`);
      const result = await runTool(options.spike, toolUse);
      await appendSessionEvent(sessionFile, {
        ...sessionEvent("tool", result.content),
        isError: result.isError,
        toolUseId: toolUse.id,
        toolName: toolUse.name,
        toolInput: toolUse.input,
        toolResult: result.rawResult ?? result.content,
      });
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: result.content,
        ...(result.isError ? { is_error: true } : {}),
      });

      if (options.verbose) {
        process.stderr.write(
          `[hunch] ${toolUse.name}: ${result.content}\n`,
        );
      } else {
        writeProgress(
          options,
          result.isError
            ? `${toolUse.name} failed: ${result.content}`
            : `${toolUse.name} finished.`,
        );
      }

      trackRepeatedToolFailure(repeatedToolFailures, toolUse, result);
    }

    messages.push({
      role: "user",
      content: toolResults,
    });

    if (toolIterations >= maxToolIterations) {
      throw new HunchError(
        `Agent exceeded maximum tool iterations of ${maxToolIterations}. Retry with --max-tool-iterations ${maxToolIterations * 2} if this is an intentionally large prototype pass.`,
      );
    }
  }

  return finalText;
}

function trackRepeatedToolFailure(
  repeatedToolFailures: Map<string, number>,
  toolUse: ToolUseBlock,
  result: ToolRunResult,
): void {
  if (!result.isError) {
    repeatedToolFailures.clear();
    return;
  }

  const key = toolFailureKey(toolUse, result);
  const count = (repeatedToolFailures.get(key) ?? 0) + 1;
  repeatedToolFailures.set(key, count);

  if (count >= MAX_REPEATED_TOOL_FAILURES) {
    throw new HunchError(
      `Agent repeated the same failing ${toolUse.name} call ${count} times: ${result.content}`,
    );
  }
}

function toolFailureKey(toolUse: ToolUseBlock, result: ToolRunResult): string {
  return JSON.stringify({
    name: toolUse.name,
    input: toolUse.input,
    error: result.content,
  });
}

function writeProgress(
  options: Pick<RunAgentLoopOptions, "progress">,
  message: string,
): void {
  if (options.progress !== true) {
    return;
  }

  process.stderr.write(`[hunch] ${message}\n`);
}

function describeToolUse(toolUse: ToolUseBlock): string {
  const input = isRecord(toolUse.input) ? toolUse.input : {};
  const pathValue = typeof input.path === "string" ? input.path : undefined;

  switch (toolUse.name) {
    case "read_file":
      return `read_file ${pathValue ?? ""}`.trim();
    case "write_file":
      return `write_file ${pathValue ?? ""}`.trim();
    case "edit_file":
      return `edit_file ${pathValue ?? ""}`.trim();
    case "list_files":
      return `list_files ${pathValue ?? "."}`.trim();
    case "run_shell":
      return typeof input.command === "string"
        ? `run_shell ${input.command}`
        : "run_shell";
    case "decide":
      return "decide";
    case "generate_seed_data":
      return "generate_seed_data";
    case "push_back":
      return "push_back";
    default:
      return toolUse.name;
  }
}

function sessionEventsToMessages(events: SessionEvent[]): MessageParam[] {
  const messages: MessageParam[] = [];
  let toolResults: ToolResultBlockParam[] = [];

  const flushToolResults = (): void => {
    if (toolResults.length === 0) {
      return;
    }

    messages.push({
      role: "user",
      content: toolResults,
    });
    toolResults = [];
  };

  for (const event of events) {
    if (event.role === "tool") {
      if (event.toolUseId === undefined) {
        continue;
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: event.toolUseId,
        content: event.content,
        ...(event.isError ? { is_error: true } : {}),
      });
      continue;
    }

    if (event.role !== "user" && event.role !== "assistant") {
      continue;
    }

    flushToolResults();
    messages.push({
      role: event.role,
      content: Array.isArray(event.contentBlocks)
        ? (event.contentBlocks as ContentBlockParam[])
        : event.content,
    });
  }

  flushToolResults();
  return messages;
}

function sessionEvent(
  role: SessionEvent["role"],
  content: string,
): SessionEvent {
  return {
    role,
    content,
    ts: timestamp(),
  };
}

async function createMessage(
  client: AgentProviderClient,
  input: { model: string; system: string; messages: MessageParam[] },
) {
  try {
    return await client.messages.create({
      model: input.model,
      max_tokens: 4096,
      system: [{ type: "text", text: input.system, cache_control: { type: "ephemeral" } }],
      tools: toolDefinitions,
      messages: [...input.messages],
    });
  } catch (error) {
    throw new HunchError(
      `${providerLabel(client.provider)} request failed: ${errorMessage(error)}`,
    );
  }
}

function providerLabel(provider: AgentProviderClient["provider"]): string {
  if (provider === "anthropic") {
    return "Anthropic";
  }

  if (provider === "openai") {
    return "OpenAI";
  }

  return "Local";
}

function assistantSessionEvent(contentBlocks: ContentBlockParam[]): SessionEvent {
  return {
    ...sessionEvent("assistant", textFromContentBlocks(contentBlocks)),
    contentBlocks,
  };
}

function textFromContentBlocks(contentBlocks: ContentBlockParam[]): string {
  return contentBlocks
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("");
}

async function runTool(
  spike: SpikeRef,
  toolUse: ToolUseBlock,
): Promise<ToolRunResult> {
  try {
    const result = await dispatchTool(spike, {
      ...toolUse,
      input: validateToolInput(toolUse.name, toolUse.input),
    });
    return {
      content: stringifyToolResult(result),
      isError: false,
      rawResult: result,
    };
  } catch (error) {
    return {
      content: `${toolUse.name} failed: ${errorMessage(error)}`,
      isError: true,
    };
  }
}

async function dispatchTool(
  spike: SpikeRef,
  toolUse: ToolUseBlock,
): Promise<unknown> {
  switch (toolUse.name) {
    case "read_file":
      return readFileTool(spike.dir, toolUse.input as ReadFileToolInput);
    case "write_file":
      return writeFileTool(spike.dir, toolUse.input as WriteFileToolInput);
    case "edit_file":
      return editFileTool(spike.dir, toolUse.input as EditFileToolInput);
    case "list_files":
      return listFilesTool(spike.dir, toolUse.input as ListFilesToolInput);
    case "run_shell":
      return runShellTool(spike.appDir, toolUse.input as RunShellToolInput);
    case "decide":
      return appendDecision(path.join(spike.hunchDir, "decisions.md"), {
        ...(toolUse.input as Omit<DecisionInput, "ts">),
        ts: timestamp(),
      });
    case "generate_seed_data":
      return "Seed data generation is available through `hunch show`.";
    case "push_back":
      return "Use the persona and journey to decide whether to proceed or ask a scope question.";
    default:
      throw new HunchError(`Unknown tool: ${toolUse.name}`);
  }
}

function stringifyToolResult(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }

  return JSON.stringify(result);
}

function validateToolInput(name: string, input: unknown): unknown {
  const record = requireRecord(input, name);

  switch (name) {
    case "read_file":
      return {
        path: requireString(record, "path", name),
      } satisfies ReadFileToolInput;
    case "write_file":
      return {
        path: requireString(record, "path", name),
        content: requireString(record, "content", name),
      } satisfies WriteFileToolInput;
    case "edit_file":
      return {
        path: requireString(record, "path", name),
        old_str: requireString(record, "old_str", name),
        new_str: requireString(record, "new_str", name),
      } satisfies EditFileToolInput;
    case "list_files": {
      const depth = optionalNumber(record, "depth", name);
      return {
        ...(record.path === undefined
          ? {}
          : { path: requireString(record, "path", name) }),
        ...(depth === undefined ? {} : { depth }),
      } satisfies ListFilesToolInput;
    }
    case "run_shell":
      return {
        command: requireString(record, "command", name),
      } satisfies RunShellToolInput;
    case "decide":
      return {
        decision: requireString(record, "decision", name),
        rationale: requireString(record, "rationale", name),
      } satisfies Omit<DecisionInput, "ts">;
    case "generate_seed_data":
      requireString(record, "purpose", name);
      return record;
    case "push_back":
      requireString(record, "request", name);
      return record;
    default:
      throw new HunchError(`Unknown tool: ${name}`);
  }
}

function requireRecord(value: unknown, toolName: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HunchError(`${toolName}.input must be an object.`);
  }

  return value as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(
  record: Record<string, unknown>,
  key: string,
  toolName: string,
): string {
  if (typeof record[key] !== "string") {
    throw new HunchError(`${toolName}.${key} must be a string.`);
  }

  if (record[key].length === 0) {
    throw new HunchError(`${toolName}.${key} must not be blank.`);
  }

  return record[key];
}

function optionalNumber(
  record: Record<string, unknown>,
  key: string,
  toolName: string,
): number | undefined {
  if (record[key] === undefined) {
    return undefined;
  }

  if (typeof record[key] !== "number") {
    throw new HunchError(`${toolName}.${key} must be a number.`);
  }

  return record[key];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
