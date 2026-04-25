import { spawn } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { confirm, input } from "@inquirer/prompts";
import ora from "ora";

import { createAnthropicClient } from "../agent/anthropic.js";
import { runAgentLoop } from "../agent/loop.js";
import { loadConfig } from "../state/config.js";
import type { PathResolverOptions } from "../state/paths.js";
import {
  buildSpikeName,
  setActiveSpike,
  spikeRef,
  type SpikeRef,
} from "../state/spike.js";
import { out } from "../ui/output.js";
import { HunchError } from "../utils/errors.js";
import { slugifyProblem } from "../utils/slug.js";

export interface NewSpikeAnswers {
  problem: string;
  persona: string;
  journey: string;
  slug: string;
}

export interface InitialGenerationOptions {
  spike: SpikeRef;
  apiKey: string;
  model: string;
}

export type InitialGenerationRunner = (
  options: InitialGenerationOptions,
) => Promise<void>;

export interface CreateSpikeOptions extends PathResolverOptions {
  install?: boolean;
  generate?: boolean;
  date?: Date;
  installTimeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  initialGenerationRunner?: InitialGenerationRunner;
}

export async function newCommand(
  options: CreateSpikeOptions = {},
): Promise<void> {
  const problem = await input({
    message: "What's the customer problem? (one or two sentences)",
    validate: validateRequired,
  });
  const persona = await input({
    message: "Who's this for?",
    validate: validateRequired,
  });
  const journey = await input({
    message: "What's the one thing they should do in this prototype?",
    validate: validateRequired,
  });

  const defaultSlug = slugifyProblem(problem);
  const slugOk = await confirm({
    message: `Naming this spike "${defaultSlug}". OK?`,
    default: true,
  });
  const slug = slugOk
    ? defaultSlug
    : await input({
        message: "Spike slug",
        default: defaultSlug,
        validate: validateRequired,
      });

  const spinner = ora("Setting up spike...").start();
  try {
    const spike = await createSpike(
      { problem, persona, journey, slug },
      { ...options, install: options.install ?? true },
    );
    spinner.succeed(`Created ${spike.name}`);
    out.success("Run `hunch run` to see it.");
  } catch (error) {
    spinner.fail("Could not create spike.");
    throw error;
  }
}

export async function createSpike(
  answers: NewSpikeAnswers,
  options: CreateSpikeOptions = {},
): Promise<SpikeRef> {
  const config = await loadConfig(options);
  const name = buildSpikeName(answers.slug.trim(), options.date);
  const spike = spikeRef(config.spikeDir, name);
  await failIfFinalSpikeExists(spike.dir, name);
  await mkdir(config.spikeDir, { recursive: true });
  const stagingDir = await mkdtemp(path.join(config.spikeDir, `.${name}-`));
  const stagingSpike: SpikeRef = {
    name,
    dir: stagingDir,
    appDir: path.join(stagingDir, "app"),
    hunchDir: path.join(stagingDir, ".hunch"),
  };
  let renamed = false;

  try {
    await writeSpikeFiles(stagingSpike, name, answers);

    if (options.install) {
      await npmInstall(stagingSpike.appDir, options.installTimeoutMs);
    }

    if (options.generate !== false) {
      const env = options.env ?? process.env;
      const apiKey = env[config.apiKeyEnv];
      if (apiKey) {
        await (options.initialGenerationRunner ?? runInitialGeneration)({
          spike: stagingSpike,
          apiKey,
          model: config.model,
        });
      }
    }

    await rename(stagingSpike.dir, spike.dir);
    renamed = true;
    await setActiveSpike(name, options);
  } catch (error) {
    await rm(renamed ? spike.dir : stagingSpike.dir, {
      recursive: true,
      force: true,
    });
    throw error;
  }

  return spike;
}

async function failIfFinalSpikeExists(dir: string, name: string): Promise<void> {
  const existing = await stat(dir).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  });

  if (existing) {
    throw new HunchError(`Spike already exists: ${name}`);
  }
}

async function writeSpikeFiles(
  spike: SpikeRef,
  name: string,
  answers: NewSpikeAnswers,
): Promise<void> {
  await cp(resolveTemplatePath(), spike.appDir, {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  await mkdir(spike.hunchDir, { recursive: true });

  await writeFile(
    path.join(spike.hunchDir, "problem.md"),
    `${answers.problem.trim()}\n`,
    "utf8",
  );
  await writeFile(
    path.join(spike.hunchDir, "persona.md"),
    `${answers.persona.trim()}\n`,
    "utf8",
  );
  await writeFile(
    path.join(spike.hunchDir, "journey.md"),
    `${answers.journey.trim()}\n`,
    "utf8",
  );
  await writeFile(
    path.join(spike.hunchDir, "decisions.md"),
    "# UX Decisions\n\n",
  );
  await writeFile(path.join(spike.hunchDir, "session.jsonl"), "");
  await writeFile(
    path.join(spike.hunchDir, "config.yaml"),
    "model: claude-3-5-sonnet-latest\n",
  );
  await writeFile(
    path.join(spike.dir, "README.md"),
    [
      `# ${name}`,
      "",
      "## Problem",
      answers.problem.trim(),
      "",
      "## Persona",
      answers.persona.trim(),
      "",
      "## Journey",
      answers.journey.trim(),
      "",
    ].join("\n"),
    "utf8",
  );
}

function resolveTemplatePath(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(moduleDir, "../../templates/app");
}

function validateRequired(value: string): true | string {
  return value.trim().length > 0 ? true : "Required";
}

async function runInitialGeneration(
  options: InitialGenerationOptions,
): Promise<void> {
  const client = createAnthropicClient({
    apiKey: options.apiKey,
    model: options.model,
  });
  await runAgentLoop({
    client,
    spike: options.spike,
    message:
      "Generate the initial prototype for this spike. Replace the starter app with a focused, clickable flow that tests the journey.",
  });
}

async function npmInstall(cwd: string, timeoutMs = 120_000): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const child = spawn("npm", ["install"], {
      cwd,
      stdio: "inherit",
    });
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      child.kill();
      reject(new HunchError(`npm install timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    function finish(error?: Error): void {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      if (error) {
        reject(error);
        return;
      }

      resolve();
    }

    child.on("error", (error) => {
      finish(new HunchError(`Failed to run npm install: ${error.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        finish();
        return;
      }

      finish(new HunchError(`npm install failed with exit code ${code}.`));
    });
  });
}
