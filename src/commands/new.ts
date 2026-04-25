import { spawn } from "node:child_process";
import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { confirm, input } from "@inquirer/prompts";
import ora from "ora";

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

export interface CreateSpikeOptions extends PathResolverOptions {
  install?: boolean;
  generate?: boolean;
  date?: Date;
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
      { ...options, install: options.install ?? true, generate: false },
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

  await setActiveSpike(name, options);

  if (options.install) {
    await npmInstall(spike.appDir);
  }

  return spike;
}

function resolveTemplatePath(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(moduleDir, "../../templates/app");
}

function validateRequired(value: string): true | string {
  return value.trim().length > 0 ? true : "Required";
}

async function npmInstall(cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("npm", ["install"], {
      cwd,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new HunchError(`npm install failed with exit code ${code}.`));
    });
  });
}
