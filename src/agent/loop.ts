import type Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  ToolResultBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages/messages";
import path from "node:path";

import { loadConfig } from "../state/config.js";
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
import { timestamp } from "../utils/time.js";
import { loadSpikeContext } from "./context.js";
import { loadPrompt } from "./prompts.js";
import { appendSessionEvent, readRecentSession } from "./session.js";
import type { SessionEvent } from "./types.js";

export interface RunAgentLoopOptions {
  client: Anthropic;
  spike: SpikeRef;
  message: string;
  verbose?: boolean;
}

export async function runAgentLoop(
  options: RunAgentLoopOptions,
): Promise<string> {
  const config = await loadConfig();
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

  while (true) {
    const response = await options.client.messages.create({
      model: config.model,
      max_tokens: 4096,
      system,
      tools: toolDefinitions,
      messages: [...messages],
    });
    const toolUses: ToolUseBlock[] = [];

    messages.push({
      role: "assistant",
      content: response.content,
    });

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
      break;
    }

    if (toolUses.length === 0) {
      throw new HunchError(
        "Anthropic requested tool use without a tool_use block.",
      );
    }

    const toolResults: ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      const result = await dispatchTool(options.spike, toolUse);
      await appendSessionEvent(sessionFile, {
        ...sessionEvent("tool", stringifyToolResult(result)),
        toolName: toolUse.name,
        toolInput: toolUse.input,
        toolResult: result,
      });
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: stringifyToolResult(result),
      });

      if (options.verbose) {
        process.stderr.write(
          `[hunch] ${toolUse.name}: ${stringifyToolResult(result)}\n`,
        );
      }
    }

    messages.push({
      role: "user",
      content: toolResults,
    });
  }

  await appendSessionEvent(sessionFile, sessionEvent("assistant", finalText));
  return finalText;
}

function sessionEventsToMessages(events: SessionEvent[]): MessageParam[] {
  return events.flatMap((event) => {
    if (event.role !== "user" && event.role !== "assistant") {
      return [];
    }

    return [{ role: event.role, content: event.content } satisfies MessageParam];
  });
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
