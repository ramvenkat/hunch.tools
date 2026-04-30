import {
  getLocalModelStatus,
  setupLocalModel,
  type LocalModelDeps,
  type LocalModelStatus,
} from "../agent/local.js";
import { loadConfig } from "../state/config.js";
import type { PathResolverOptions } from "../state/paths.js";
import { out } from "../ui/output.js";

export interface LocalCommandOptions extends PathResolverOptions {
  localModelDeps?: LocalModelDeps;
}

export async function localStatusCommand(
  options: LocalCommandOptions = {},
): Promise<LocalModelStatus> {
  const config = await loadConfig(options);
  const status = await getLocalModelStatus(config, options.localModelDeps);
  printLocalStatus(status);
  return status;
}

export async function localSetupCommand(
  options: LocalCommandOptions = {},
): Promise<LocalModelStatus> {
  const config = await loadConfig(options);
  const status = await setupLocalModel(config, options.localModelDeps);

  if (status.ready) {
    out.success(`Local model ready: ${status.modelPath}`);
  }

  return status;
}

function printLocalStatus(status: LocalModelStatus): void {
  out.info(`Local model: ${status.model}`);
  out.info(`Enabled: ${status.enabled ? "yes" : "no"}`);
  out.info(`Path: ${status.modelPath}`);
  out.info(`Installed: ${status.exists ? "yes" : "no"}`);

  if (status.sizeBytes != null) {
    out.info(`Size: ${formatBytes(status.sizeBytes)}`);
  }

  if (status.modelUrl.length > 0) {
    out.info(`Setup source: ${status.modelUrl}`);
  }

  out.info(`Ready: ${status.ready ? "yes" : "no"}`);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(1)} ${units[unitIndex]}`;
}
