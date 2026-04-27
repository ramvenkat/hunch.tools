import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import type { AgentProviderClient } from "./client.js";
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

export function createLocalClient(config: HunchConfig): AgentProviderClient {
  return {
    provider: "local",
    model: config.local.model,
    messages: {
      create: async () => {
        throw new HunchError(
          "Local model runtime is not available yet. Use `--cloud` or set provider: anthropic.",
        );
      },
    },
  };
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
