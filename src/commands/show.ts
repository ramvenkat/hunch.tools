import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { input } from "@inquirer/prompts";

import { createAnthropicClient } from "../agent/anthropic.js";
import { loadSpikeContext } from "../agent/context.js";
import { loadPrompt } from "../agent/prompts.js";
import { loadConfig } from "../state/config.js";
import type { PathResolverOptions } from "../state/paths.js";
import { getActiveSpike } from "../state/spike.js";
import { parseSeedDataJson, type SeedData } from "../tools/seed-data.js";
import { out } from "../ui/output.js";
import { HunchError } from "../utils/errors.js";
import {
  startDevServer,
  type DevServerHandle,
  type RunCommandOptions,
} from "./run.js";

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
  startDevServer?: (options: RunCommandOptions) => Promise<DevServerHandle>;
  client?: ShowClient;
  env?: NodeJS.ProcessEnv;
}

interface ShowFs {
  mkdir: typeof mkdir;
  writeFile: typeof writeFile;
  rename: typeof rename;
  rm: typeof rm;
}

const defaultShowFs: ShowFs = { mkdir, writeFile, rename, rm };

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
  const seedDataPrompt = await loadPrompt("seed-data", promptValues);

  const [script, questions, seedData] = await Promise.all([
    generateShowText(
      client,
      config.model,
      scriptPrompt,
      "walkthrough script",
    ),
    generateShowText(
      client,
      config.model,
      questionsPrompt,
      "interview questions",
    ),
    generateSeedData(client, config.model, seedDataPrompt),
  ]);

  const showDir = path.join(spike.hunchDir, "show");
  await writeShowFilesAtomically(showDir, script, questions);
  await writeSeedDataAtomically(
    path.join(spike.appDir, "src", "seed-data.json"),
    seedData,
  );

  const server = await (options.startDevServer ?? startDevServer)({
    homeDir: options.homeDir,
    cwd: options.cwd,
    demo: true,
  });
  try {
    out.info(script);
    out.info("");
    out.info(questions);

    await (options.input ?? input)({
      message: "Press Return to stop the demo server",
    });
  } finally {
    server.stop();
    await server.wait;
  }
}

async function generateShowText(
  client: ShowClient,
  model: string,
  prompt: string,
  label: string,
): Promise<string> {
  let response: { content: Array<{ type: string; text?: string }> };

  try {
    response = await client.messages.create({
      model,
      max_tokens: 2_000,
      messages: [{ role: "user", content: prompt }],
    });
  } catch (error) {
    throw new HunchError(`Failed to generate ${label}: ${errorMessage(error)}`);
  }

  const text = extractText(response.content);
  if (!text) {
    throw new HunchError("Show generation returned an empty response.");
  }

  return text;
}

export async function writeShowFilesAtomically(
  showDir: string,
  script: string,
  questions: string,
  fs: ShowFs = defaultShowFs,
): Promise<void> {
  await fs.mkdir(showDir, { recursive: true });

  const suffix = `${process.pid}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
  const files = [
    {
      finalPath: path.join(showDir, "script.md"),
      tempPath: path.join(showDir, `.script.md.${suffix}.tmp`),
      backupPath: path.join(showDir, `.script.md.${suffix}.bak`),
      content: `${script}\n`,
      backedUp: false,
      installed: false,
    },
    {
      finalPath: path.join(showDir, "questions.md"),
      tempPath: path.join(showDir, `.questions.md.${suffix}.tmp`),
      backupPath: path.join(showDir, `.questions.md.${suffix}.bak`),
      content: `${questions}\n`,
      backedUp: false,
      installed: false,
    },
  ];

  try {
    await Promise.all(
      files.map((file) => fs.writeFile(file.tempPath, file.content, "utf8")),
    );

    try {
      for (const file of files) {
        try {
          await fs.rename(file.finalPath, file.backupPath);
          file.backedUp = true;
        } catch (error) {
          if (!isMissingFile(error)) {
            throw error;
          }
        }
      }

      for (const file of files) {
        await fs.rename(file.tempPath, file.finalPath);
        file.installed = true;
      }
    } catch (error) {
      await rollbackShowFiles(files, fs);
      throw error;
    }

    await Promise.all(files.map((file) => cleanup(file.backupPath, fs)));
  } finally {
    await Promise.all(files.map((file) => cleanup(file.tempPath, fs)));
  }
}

export async function writeSeedDataAtomically(
  file: string,
  seedData: SeedData,
  fs: ShowFs = defaultShowFs,
): Promise<void> {
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });

  const tempPath = path.join(
    dir,
    `.seed-data.json.${process.pid}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.tmp`,
  );

  try {
    await fs.writeFile(
      tempPath,
      `${JSON.stringify(seedData, null, 2)}\n`,
      "utf8",
    );
    await fs.rename(tempPath, file);
  } finally {
    await cleanup(tempPath, fs);
  }
}

async function rollbackShowFiles(
  files: Array<{
    finalPath: string;
    backupPath: string;
    backedUp: boolean;
    installed: boolean;
  }>,
  fs: ShowFs,
): Promise<void> {
  for (const file of files) {
    if (file.installed) {
      await cleanup(file.finalPath, fs);
    }
  }

  for (const file of files) {
    if (file.backedUp) {
      await fs.rename(file.backupPath, file.finalPath);
      file.backedUp = false;
    }
  }
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

async function generateSeedData(
  client: ShowClient,
  model: string,
  prompt: string,
): Promise<SeedData> {
  const text = await generateShowText(client, model, prompt, "seed data");

  try {
    return parseSeedDataJson(text);
  } catch (error) {
    if (error instanceof HunchError) {
      throw error;
    }

    throw new HunchError(`Invalid seed data: ${errorMessage(error)}`);
  }
}

function isMissingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

async function cleanup(file: string, fs: ShowFs): Promise<void> {
  await fs.rm(file, { force: true, recursive: true });
}
