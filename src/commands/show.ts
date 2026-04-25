import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { input } from "@inquirer/prompts";

import { createAnthropicClient } from "../agent/anthropic.js";
import { loadSpikeContext } from "../agent/context.js";
import { loadPrompt } from "../agent/prompts.js";
import { loadConfig } from "../state/config.js";
import type { PathResolverOptions } from "../state/paths.js";
import { getActiveSpike } from "../state/spike.js";
import { out } from "../ui/output.js";
import { HunchError } from "../utils/errors.js";
import { runCommand, type RunCommandOptions } from "./run.js";

interface ShowClient {
  messages: {
    create: (params: {
      model: string;
      max_tokens: number;
      messages: Array<{ role: "user"; content: string }>;
    }) => Promise<{ content: Array<{ type: string; text?: string }> }>;
  };
}

export interface ShowCommandOptions extends PathResolverOptions {
  input?: typeof input;
  run?: (options: RunCommandOptions) => Promise<void>;
  client?: ShowClient;
  env?: NodeJS.ProcessEnv;
}

export async function showCommand(
  options: ShowCommandOptions = {},
): Promise<void> {
  const config = await loadConfig(options);
  const spike = await getActiveSpike(options);
  const context = await loadSpikeContext(spike);
  const client =
    options.client ??
    createAnthropicClient({
      apiKey: (options.env ?? process.env)[config.apiKeyEnv],
      model: config.model,
    });
  const promptValues = {
    problem: context.problem,
    persona: context.persona,
    journey: context.journey,
    decisions: context.decisions,
    fileTree: context.fileTree,
  };
  const scriptPrompt = await loadPrompt("show-script", promptValues);
  const questionsPrompt = await loadPrompt("show-questions", promptValues);

  const script = await generateShowText(client, config.model, scriptPrompt);
  const questions = await generateShowText(client, config.model, questionsPrompt);

  const showDir = path.join(spike.hunchDir, "show");
  await mkdir(showDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(showDir, "script.md"), `${script}\n`, "utf8"),
    writeFile(path.join(showDir, "questions.md"), `${questions}\n`, "utf8"),
  ]);

  out.info(script);
  out.info("");
  out.info(questions);

  await (options.input ?? input)({
    message: "Press Return to start the demo server",
  });
  await (options.run ?? runCommand)({
    homeDir: options.homeDir,
    cwd: options.cwd,
    demo: true,
  });
}

async function generateShowText(
  client: ShowClient,
  model: string,
  prompt: string,
): Promise<string> {
  let response: { content: Array<{ type: string; text?: string }> };

  try {
    response = await client.messages.create({
      model,
      max_tokens: 2_000,
      messages: [{ role: "user", content: prompt }],
    });
  } catch (error) {
    throw new HunchError(`Show generation failed: ${errorMessage(error)}`);
  }

  const text = extractText(response.content);
  if (!text) {
    throw new HunchError("Show generation returned an empty response.");
  }

  return text;
}

export function extractText(
  content: Array<{ type: string; text?: string }>,
): string {
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n")
    .trim();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
