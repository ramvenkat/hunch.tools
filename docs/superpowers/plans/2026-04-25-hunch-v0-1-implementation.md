# Hunch v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Hunch v0.1 CLI loop: `new -> run -> ask -> decide -> show`.

**Architecture:** Hunch is a standalone TypeScript npm CLI. Commands stay thin and delegate to focused modules for config/state, spike filesystem operations, template copying, dev server management, Anthropic agent streaming, and scoped tool execution.

**Tech Stack:** Node 20+, TypeScript, commander, @inquirer/prompts, @anthropic-ai/sdk, yaml, chalk, ora, open, Vitest, Vite, React, Tailwind.

---

## Scope Check

The design includes multiple modules, but they form one sequential CLI product rather than independent products. This single plan covers the full v0.1 with milestone-gated tasks; each task leaves the repo buildable or moves a testable command forward.

## File Structure

Create this structure:

```text
bin/
  hunch.js
src/
  cli.ts
  index.ts
  commands/
    ask.ts
    decide.ts
    list.ts
    new.ts
    open.ts
    run.ts
    show.ts
  agent/
    anthropic.ts
    context.ts
    loop.ts
    prompts.ts
    session.ts
    types.ts
  state/
    config.ts
    paths.ts
    spike.ts
  tools/
    definitions.ts
    file-tools.ts
    seed-data.ts
    shell.ts
    ux-decisions.ts
  ui/
    output.ts
  utils/
    errors.ts
    slug.ts
    time.ts
templates/
  app/
tests/
  agent/
  state/
  tools/
  utils/
docs/
  superpowers/
    specs/
    plans/
```

Responsibilities:

- `src/cli.ts`: command registration only.
- `src/commands/*`: one command per file, terminal I/O plus orchestration.
- `src/state/*`: config, global state, active spike, safe paths, spike layout.
- `src/agent/*`: Anthropic wrapper, prompt rendering, context loading, session JSONL, tool loop.
- `src/tools/*`: tool schemas and implementations scoped to the active spike.
- `templates/app`: copied into each spike's `app/`.
- `tests/*`: Vitest coverage for deterministic behavior.

## Task 1: Package Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `bin/hunch.js`
- Create: `src/index.ts`
- Create: `src/cli.ts`
- Create: `.gitignore`

- [ ] **Step 1: Create package metadata**

Create `package.json`:

```json
{
  "name": "hunch-cli",
  "version": "0.1.0",
  "description": "A CLI for PMs who code to turn customer problems into disposable prototypes.",
  "type": "module",
  "bin": {
    "hunch": "./bin/hunch.js"
  },
  "files": [
    "bin",
    "dist",
    "templates",
    "README.md"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx src/cli.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "@inquirer/prompts": "^7.3.2",
    "chalk": "^5.4.1",
    "commander": "^13.1.0",
    "open": "^10.1.0",
    "ora": "^8.2.0",
    "yaml": "^2.7.0"
  },
  "devDependencies": {
    "@types/node": "^22.13.5",
    "tsx": "^4.19.3",
    "typescript": "^5.7.3",
    "vitest": "^3.0.5"
  }
}
```

- [ ] **Step 2: Create TypeScript and test config**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["dist", "node_modules", "templates"]
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Create CLI entry points**

Create `bin/hunch.js`:

```js
#!/usr/bin/env node
import "../dist/cli.js";
```

Create `src/index.ts`:

```ts
export { buildCli } from "./cli.js";
```

Create `src/cli.ts`:

```ts
import { Command } from "commander";

export function buildCli(): Command {
  const program = new Command();

  program
    .name("hunch")
    .description("Turn a customer problem into a disposable prototype.")
    .version("0.1.0");

  program.command("list").description("List spikes.").action(() => {
    console.log("No spikes yet.");
  });

  return program;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await buildCli().parseAsync(process.argv);
}
```

Create `.gitignore`:

```gitignore
node_modules/
dist/
.DS_Store
coverage/
*.log
.env
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`

Expected: dependencies install and `package-lock.json` is created.

- [ ] **Step 5: Verify scaffold**

Run: `npm run typecheck`

Expected: PASS with no TypeScript errors.

Run: `npm run build`

Expected: PASS and `dist/cli.js` exists.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts bin/hunch.js src/index.ts src/cli.ts .gitignore
git commit -m "chore: scaffold Hunch CLI package"
```

## Task 2: Core Types, Paths, Config, and Time

**Files:**
- Create: `src/state/paths.ts`
- Create: `src/state/config.ts`
- Create: `src/state/spike.ts`
- Create: `src/utils/errors.ts`
- Create: `src/utils/slug.ts`
- Create: `src/utils/time.ts`
- Test: `tests/state/paths.test.ts`
- Test: `tests/state/config.test.ts`
- Test: `tests/utils/slug.test.ts`

- [ ] **Step 1: Write failing tests for slugging**

Create `tests/utils/slug.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { slugifyProblem } from "../../src/utils/slug.js";

describe("slugifyProblem", () => {
  it("creates a short lowercase slug", () => {
    expect(slugifyProblem("First-time users don't know what to type!")).toBe("first-time-users-dont-know");
  });

  it("falls back for empty input", () => {
    expect(slugifyProblem("!!!")).toBe("untitled-spike");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/utils/slug.test.ts`

Expected: FAIL because `src/utils/slug.ts` does not exist.

- [ ] **Step 3: Implement slug utility**

Create `src/utils/slug.ts`:

```ts
const STOP_WORDS = new Set(["a", "an", "and", "or", "the", "to", "of", "for", "in", "on"]);

export function slugifyProblem(input: string, maxWords = 5): string {
  const words = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0 && !STOP_WORDS.has(word))
    .slice(0, maxWords);

  return words.length > 0 ? words.join("-") : "untitled-spike";
}
```

- [ ] **Step 4: Run slug tests**

Run: `npm test -- tests/utils/slug.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing tests for paths and config**

Create `tests/state/paths.test.ts`:

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertInside, createPathResolver } from "../../src/state/paths.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "hunch-paths-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("assertInside", () => {
  it("allows descendants", () => {
    expect(assertInside(root, path.join(root, "app", "src.ts"))).toBe(path.join(root, "app", "src.ts"));
  });

  it("rejects traversal outside root", () => {
    expect(() => assertInside(root, path.join(root, "..", "escape.txt"))).toThrow("Path escapes");
  });
});

describe("createPathResolver", () => {
  it("uses injected home and cwd paths", () => {
    const resolver = createPathResolver({ homeDir: "/home/ram", cwd: "/repo" });
    expect(resolver.hunchDir).toBe("/home/ram/.hunch");
    expect(resolver.defaultSpikeDir).toBe("/home/ram/hunches");
    expect(resolver.repoRoot).toBe("/repo");
  });
});
```

Create `tests/state/config.test.ts`:

```ts
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/state/config.js";

let home: string;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), "hunch-config-"));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("loadConfig", () => {
  it("returns defaults when config is absent", async () => {
    const config = await loadConfig({ homeDir: home, cwd: "/repo" });
    expect(config.provider).toBe("anthropic");
    expect(config.apiKeyEnv).toBe("ANTHROPIC_API_KEY");
    expect(config.spikeDir).toBe(path.join(home, "hunches"));
  });

  it("reads yaml config overrides", async () => {
    await writeFile(
      path.join(home, ".hunch", "config.yaml"),
      "model: claude-sonnet-4-5\nspike_dir: /tmp/my-hunches\n"
    ).catch(async () => {
      await import("node:fs/promises").then((fs) => fs.mkdir(path.join(home, ".hunch"), { recursive: true }));
      await writeFile(path.join(home, ".hunch", "config.yaml"), "model: claude-sonnet-4-5\nspike_dir: /tmp/my-hunches\n");
    });

    const config = await loadConfig({ homeDir: home, cwd: "/repo" });
    expect(config.model).toBe("claude-sonnet-4-5");
    expect(config.spikeDir).toBe("/tmp/my-hunches");
  });
});
```

- [ ] **Step 6: Run state tests to verify they fail**

Run: `npm test -- tests/state/paths.test.ts tests/state/config.test.ts`

Expected: FAIL because state modules do not exist.

- [ ] **Step 7: Implement path, config, spike, error, and time helpers**

Create `src/utils/errors.ts`:

```ts
export class HunchError extends Error {
  constructor(message: string, public readonly exitCode = 1) {
    super(message);
    this.name = "HunchError";
  }
}
```

Create `src/utils/time.ts`:

```ts
export function todayStamp(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function timestamp(date = new Date()): string {
  return date.toISOString();
}
```

Create `src/state/paths.ts`:

```ts
import os from "node:os";
import path from "node:path";
import { HunchError } from "../utils/errors.js";

export interface PathResolverOptions {
  homeDir?: string;
  cwd?: string;
}

export interface PathResolver {
  homeDir: string;
  repoRoot: string;
  hunchDir: string;
  configPath: string;
  activePath: string;
  defaultSpikeDir: string;
}

export function createPathResolver(options: PathResolverOptions = {}): PathResolver {
  const homeDir = options.homeDir ?? os.homedir();
  const repoRoot = options.cwd ?? process.cwd();
  const hunchDir = path.join(homeDir, ".hunch");

  return {
    homeDir,
    repoRoot,
    hunchDir,
    configPath: path.join(hunchDir, "config.yaml"),
    activePath: path.join(hunchDir, "active"),
    defaultSpikeDir: path.join(homeDir, "hunches"),
  };
}

export function assertInside(root: string, candidate: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);

  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return resolvedCandidate;
  }

  throw new HunchError(`Path escapes allowed root: ${candidate}`);
}
```

Create `src/state/config.ts`:

```ts
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { createPathResolver, type PathResolverOptions } from "./paths.js";

export interface HunchConfig {
  provider: "anthropic";
  model: string;
  apiKeyEnv: string;
  spikeDir: string;
  pushBackOnScopeCreep: boolean;
  logDecisions: boolean;
}

interface ConfigYaml {
  provider?: "anthropic";
  model?: string;
  api_key_env?: string;
  spike_dir?: string;
  agent?: {
    push_back_on_scope_creep?: boolean;
    log_decisions?: boolean;
  };
}

export async function ensureHunchDir(options: PathResolverOptions = {}): Promise<void> {
  const paths = createPathResolver(options);
  await mkdir(paths.hunchDir, { recursive: true });
}

export async function loadConfig(options: PathResolverOptions = {}): Promise<HunchConfig> {
  const paths = createPathResolver(options);
  await mkdir(paths.hunchDir, { recursive: true });

  let parsed: ConfigYaml = {};
  try {
    parsed = YAML.parse(await readFile(paths.configPath, "utf8")) ?? {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  return {
    provider: parsed.provider ?? "anthropic",
    model: parsed.model ?? "claude-3-5-sonnet-latest",
    apiKeyEnv: parsed.api_key_env ?? "ANTHROPIC_API_KEY",
    spikeDir: expandHome(parsed.spike_dir ?? paths.defaultSpikeDir, paths.homeDir),
    pushBackOnScopeCreep: parsed.agent?.push_back_on_scope_creep ?? true,
    logDecisions: parsed.agent?.log_decisions ?? true,
  };
}

function expandHome(value: string, homeDir: string): string {
  if (value === "~") return homeDir;
  if (value.startsWith("~/")) return path.join(homeDir, value.slice(2));
  return value;
}
```

Create `src/state/spike.ts`:

```ts
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { HunchError } from "../utils/errors.js";
import { todayStamp } from "../utils/time.js";
import { createPathResolver, type PathResolverOptions } from "./paths.js";
import { loadConfig } from "./config.js";

export interface SpikeRef {
  name: string;
  dir: string;
  appDir: string;
  hunchDir: string;
}

export async function listSpikes(options: PathResolverOptions = {}): Promise<SpikeRef[]> {
  const config = await loadConfig(options);
  const entries = await readdir(config.spikeDir, { withFileTypes: true }).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  });

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => spikeRef(config.spikeDir, entry.name))
    .sort((a, b) => b.name.localeCompare(a.name));
}

export async function setActiveSpike(name: string, options: PathResolverOptions = {}): Promise<void> {
  const paths = createPathResolver(options);
  await mkdir(paths.hunchDir, { recursive: true });
  await writeFile(paths.activePath, `${name}\n`, "utf8");
}

export async function getActiveSpike(options: PathResolverOptions = {}): Promise<SpikeRef> {
  const paths = createPathResolver(options);
  const config = await loadConfig(options);
  let active: string;
  try {
    active = (await readFile(paths.activePath, "utf8")).trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new HunchError("No active spike. Run `hunch list` or `hunch open <name>`.");
    }
    throw error;
  }

  if (!active) throw new HunchError("No active spike. Run `hunch open <name>`.");
  return spikeRef(config.spikeDir, active);
}

export function buildSpikeName(slug: string, date = new Date()): string {
  return `${todayStamp(date)}-${slug}`;
}

export function spikeRef(spikeDir: string, name: string): SpikeRef {
  const dir = path.join(spikeDir, name);
  return {
    name,
    dir,
    appDir: path.join(dir, "app"),
    hunchDir: path.join(dir, ".hunch"),
  };
}
```

- [ ] **Step 8: Run tests and typecheck**

Run: `npm test -- tests/utils/slug.test.ts tests/state/paths.test.ts tests/state/config.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/state src/utils tests/state tests/utils
git commit -m "feat: add Hunch state and path helpers"
```

## Task 3: CLI Output and `list` / `open`

**Files:**
- Create: `src/ui/output.ts`
- Create: `src/commands/list.ts`
- Create: `src/commands/open.ts`
- Modify: `src/cli.ts`
- Test: `tests/state/spike.test.ts`

- [ ] **Step 1: Add spike state tests**

Create `tests/state/spike.test.ts`:

```ts
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSpikeName, listSpikes, setActiveSpike, getActiveSpike } from "../../src/state/spike.js";

let home: string;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), "hunch-spike-"));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("spike state", () => {
  it("builds dated spike names", () => {
    expect(buildSpikeName("first-prompt", new Date("2026-04-25T12:00:00Z"))).toBe("2026-04-25-first-prompt");
  });

  it("lists spike directories newest first", async () => {
    await mkdir(path.join(home, "hunches", "2026-04-24-a"), { recursive: true });
    await mkdir(path.join(home, "hunches", "2026-04-25-b"), { recursive: true });

    const spikes = await listSpikes({ homeDir: home, cwd: "/repo" });
    expect(spikes.map((spike) => spike.name)).toEqual(["2026-04-25-b", "2026-04-24-a"]);
  });

  it("persists active spike", async () => {
    await setActiveSpike("2026-04-25-first", { homeDir: home, cwd: "/repo" });
    const active = await getActiveSpike({ homeDir: home, cwd: "/repo" });
    expect(active.name).toBe("2026-04-25-first");
  });
});
```

- [ ] **Step 2: Run test to verify it passes with existing helpers**

Run: `npm test -- tests/state/spike.test.ts`

Expected: PASS.

- [ ] **Step 3: Implement output helpers**

Create `src/ui/output.ts`:

```ts
import chalk from "chalk";

export const out = {
  info(message: string): void {
    console.log(message);
  },
  success(message: string): void {
    console.log(chalk.green(`✓ ${message}`));
  },
  warn(message: string): void {
    console.warn(chalk.yellow(message));
  },
  error(message: string): void {
    console.error(chalk.red(message));
  },
};
```

- [ ] **Step 4: Implement list and open commands**

Create `src/commands/list.ts`:

```ts
import { readFile } from "node:fs/promises";
import { loadConfig } from "../state/config.js";
import { createPathResolver } from "../state/paths.js";
import { listSpikes } from "../state/spike.js";
import { out } from "../ui/output.js";

export async function listCommand(): Promise<void> {
  const paths = createPathResolver();
  const config = await loadConfig();
  const spikes = await listSpikes();
  const active = await readFile(paths.activePath, "utf8").then((value) => value.trim()).catch(() => "");

  if (spikes.length === 0) {
    out.info(`No spikes found in ${config.spikeDir}. Run \`hunch new\` to create one.`);
    return;
  }

  for (const spike of spikes) {
    const marker = spike.name === active ? " [active]" : "";
    out.info(`${spike.name}${marker}`);
  }
}
```

Create `src/commands/open.ts`:

```ts
import { existsSync } from "node:fs";
import { loadConfig } from "../state/config.js";
import { setActiveSpike, spikeRef } from "../state/spike.js";
import { out } from "../ui/output.js";
import { HunchError } from "../utils/errors.js";

export async function openCommand(name: string): Promise<void> {
  const config = await loadConfig();
  const spike = spikeRef(config.spikeDir, name);

  if (!existsSync(spike.dir)) {
    throw new HunchError(`Spike not found: ${name}`);
  }

  await setActiveSpike(name);
  out.success(`Active spike: ${name}`);
}
```

- [ ] **Step 5: Wire commands and top-level error handling**

Modify `src/cli.ts`:

```ts
import { Command } from "commander";
import { listCommand } from "./commands/list.js";
import { openCommand } from "./commands/open.js";
import { out } from "./ui/output.js";
import { HunchError } from "./utils/errors.js";

export function buildCli(): Command {
  const program = new Command();

  program
    .name("hunch")
    .description("Turn a customer problem into a disposable prototype.")
    .version("0.1.0");

  program.command("list").description("List spikes.").action(wrap(listCommand));

  program
    .command("open")
    .description("Switch to an existing spike.")
    .argument("<name>", "Spike directory name")
    .action((name: string) => wrap(() => openCommand(name))());

  return program;
}

function wrap(fn: () => Promise<void>): () => Promise<void> {
  return async () => {
    try {
      await fn();
    } catch (error) {
      if (error instanceof HunchError) {
        out.error(error.message);
        process.exitCode = error.exitCode;
        return;
      }
      throw error;
    }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await buildCli().parseAsync(process.argv);
}
```

- [ ] **Step 6: Verify commands**

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run dev -- list`

Expected: prints no-spikes message.

- [ ] **Step 7: Commit**

```bash
git add src/cli.ts src/commands/list.ts src/commands/open.ts src/ui/output.ts tests/state/spike.test.ts
git commit -m "feat: add spike listing and activation commands"
```

## Task 4: Template App

**Files:**
- Create: `templates/app/package.json`
- Create: `templates/app/index.html`
- Create: `templates/app/vite.config.ts`
- Create: `templates/app/tsconfig.json`
- Create: `templates/app/tsconfig.node.json`
- Create: `templates/app/tailwind.config.ts`
- Create: `templates/app/postcss.config.js`
- Create: `templates/app/src/main.tsx`
- Create: `templates/app/src/App.tsx`
- Create: `templates/app/src/index.css`
- Create: `templates/app/src/lib/demo-data.ts`

- [ ] **Step 1: Create template package**

Create `templates/app/package.json`:

```json
{
  "name": "hunch-spike-app",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^6.1.0",
    "typescript": "^5.7.3",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tailwindcss": "^3.4.17",
    "postcss": "^8.5.2",
    "autoprefixer": "^10.4.20",
    "lucide-react": "^0.475.0"
  },
  "devDependencies": {}
}
```

- [ ] **Step 2: Create Vite and TypeScript config**

Create `templates/app/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Hunch Spike</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `templates/app/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
```

Create `templates/app/tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" }
  ],
  "compilerOptions": {
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src"]
}
```

Create `templates/app/tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 3: Create Tailwind config and base app**

Create `templates/app/tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Aptos", "ui-sans-serif", "system-ui"],
        display: ["Georgia", "serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
```

Create `templates/app/postcss.config.js`:

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

Create `templates/app/src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color: #15211b;
  background: #f7f5ef;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
}
```

Create `templates/app/src/lib/demo-data.ts`:

```ts
export interface DemoPrompt {
  title: string;
  body: string;
}

export const demoPrompts: DemoPrompt[] = [
  {
    title: "Show me the fastest path",
    body: "Turn the customer problem into one prototype flow.",
  },
  {
    title: "Make this feel real",
    body: "Swap generic copy for language this persona would recognize.",
  },
  {
    title: "Prep the interview",
    body: "Create the questions that reveal whether the hunch is true.",
  },
];
```

Create `templates/app/src/App.tsx`:

```tsx
import { ArrowRight } from "lucide-react";
import { demoPrompts } from "./lib/demo-data";

export default function App() {
  return (
    <main className="min-h-screen bg-[#f7f5ef] text-[#15211b]">
      <section className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-10">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-[#6f6a56]">Hunch spike</p>
        <h1 className="max-w-3xl font-display text-5xl leading-tight md:text-7xl">
          A rough prototype for learning fast.
        </h1>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {demoPrompts.map((prompt) => (
            <button
              key={prompt.title}
              className="group rounded-md border border-[#d8d0bd] bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#9c8f70]"
            >
              <span className="flex items-center justify-between gap-4 font-semibold">
                {prompt.title}
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </span>
              <span className="mt-3 block text-sm leading-6 text-[#5f665f]">{prompt.body}</span>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
```

Create `templates/app/src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 4: Verify template builds**

Run: `npm install --prefix templates/app`

Expected: template dependencies install.

Run: `npm run build --prefix templates/app`

Expected: PASS and `templates/app/dist` is created.

- [ ] **Step 5: Remove generated template build output**

Run: `rm -rf templates/app/node_modules templates/app/dist`

Expected: generated dependency/build directories are removed.

- [ ] **Step 6: Commit**

```bash
git add templates/app
git commit -m "feat: add spike app template"
```

## Task 5: Spike Creation and `hunch new`

**Files:**
- Create: `src/commands/new.ts`
- Modify: `src/cli.ts`
- Test: `tests/state/create-spike.test.ts`

- [ ] **Step 1: Write failing spike creation test**

Create `tests/state/create-spike.test.ts`:

```ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSpike } from "../../src/commands/new.js";

let home: string;
let repo: string;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), "hunch-new-home-"));
  repo = await mkdtemp(path.join(tmpdir(), "hunch-new-repo-"));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
  await rm(repo, { recursive: true, force: true });
});

describe("createSpike", () => {
  it("creates spike state and copies template", async () => {
    const result = await createSpike(
      {
        problem: "First-time users do not know what to type.",
        persona: "A skeptical PM with five minutes.",
        journey: "Click a suggested prompt and feel an aha moment.",
        slug: "first-prompt-aha",
      },
      { homeDir: home, cwd: process.cwd(), install: false, generate: false, date: new Date("2026-04-25T12:00:00Z") }
    );

    expect(result.name).toBe("2026-04-25-first-prompt-aha");
    await expect(readFile(path.join(result.hunchDir, "problem.md"), "utf8")).resolves.toContain("First-time users");
    await expect(readFile(path.join(result.appDir, "package.json"), "utf8")).resolves.toContain("hunch-spike-app");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/state/create-spike.test.ts`

Expected: FAIL because `createSpike` does not exist.

- [ ] **Step 3: Implement `createSpike` and command prompts**

Create `src/commands/new.ts`:

```ts
import { confirm, input } from "@inquirer/prompts";
import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import ora from "ora";
import { loadConfig } from "../state/config.js";
import { setActiveSpike, spikeRef, buildSpikeName, type SpikeRef } from "../state/spike.js";
import { out } from "../ui/output.js";
import { slugifyProblem } from "../utils/slug.js";

export interface NewSpikeAnswers {
  problem: string;
  persona: string;
  journey: string;
  slug: string;
}

export interface CreateSpikeOptions {
  homeDir?: string;
  cwd?: string;
  install?: boolean;
  generate?: boolean;
  date?: Date;
}

export async function newCommand(): Promise<void> {
  const problem = await input({ message: "What's the customer problem? (one or two sentences)" });
  const persona = await input({ message: "Who's this for?" });
  const journey = await input({ message: "What's the one thing they should do in this prototype?" });
  const defaultSlug = slugifyProblem(problem);
  const ok = await confirm({ message: `Naming this spike "${defaultSlug}". OK?`, default: true });
  const slug = ok ? defaultSlug : await input({ message: "Spike slug", default: defaultSlug });

  const spinner = ora("Setting up spike directory...").start();
  const spike = await createSpike({ problem, persona, journey, slug }, { install: true, generate: false });
  spinner.succeed(`Created ${spike.dir}`);
  out.info("Run `hunch run` to see it.");
}

export async function createSpike(answers: NewSpikeAnswers, options: CreateSpikeOptions = {}): Promise<SpikeRef> {
  const config = await loadConfig({ homeDir: options.homeDir, cwd: options.cwd });
  const name = buildSpikeName(answers.slug, options.date);
  const spike = spikeRef(config.spikeDir, name);
  const templateDir = path.join(process.cwd(), "templates", "app");

  await mkdir(spike.hunchDir, { recursive: true });
  await cp(templateDir, spike.appDir, { recursive: true });

  await writeFile(path.join(spike.hunchDir, "problem.md"), `${answers.problem.trim()}\n`, "utf8");
  await writeFile(path.join(spike.hunchDir, "persona.md"), `${answers.persona.trim()}\n`, "utf8");
  await writeFile(path.join(spike.hunchDir, "journey.md"), `${answers.journey.trim()}\n`, "utf8");
  await writeFile(path.join(spike.hunchDir, "decisions.md"), "# UX Decisions\n\n", "utf8");
  await writeFile(path.join(spike.hunchDir, "session.jsonl"), "", "utf8");
  await writeFile(path.join(spike.hunchDir, "config.yaml"), "model: claude-3-5-sonnet-latest\n", "utf8");
  await writeFile(
    path.join(spike.dir, "README.md"),
    `# ${name}\n\n## Problem\n\n${answers.problem.trim()}\n\n## Persona\n\n${answers.persona.trim()}\n\n## Journey\n\n${answers.journey.trim()}\n`,
    "utf8"
  );

  await setActiveSpike(name, { homeDir: options.homeDir, cwd: options.cwd });
  return spike;
}
```

- [ ] **Step 4: Wire `new` command**

Modify `src/cli.ts` to import and register:

```ts
import { newCommand } from "./commands/new.js";
```

Add inside `buildCli()`:

```ts
program.command("new").description("Start a new spike.").action(wrap(newCommand));
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -- tests/state/create-spike.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/commands/new.ts src/cli.ts tests/state/create-spike.test.ts
git commit -m "feat: create new Hunch spikes"
```

## Task 6: Dev Server Runner and `hunch run`

**Files:**
- Create: `src/commands/run.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Implement run command**

Create `src/commands/run.ts`:

```ts
import { spawn } from "node:child_process";
import open from "open";
import ora from "ora";
import { getActiveSpike } from "../state/spike.js";
import { out } from "../ui/output.js";

export async function runCommand(options: { demo?: boolean } = {}): Promise<void> {
  const spike = await getActiveSpike();
  const spinner = ora(`Starting dev server for ${spike.name}...`).start();
  const env = { ...process.env };
  if (options.demo) env.VITE_HUNCH_DEMO = "1";

  const child = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1"], {
    cwd: spike.appDir,
    env,
    stdio: ["inherit", "pipe", "pipe"],
  });

  let opened = false;
  const openWhenReady = async (chunk: Buffer) => {
    const text = chunk.toString();
    process.stdout.write(text);
    const match = text.match(/http:\/\/127\.0\.0\.1:\d+/);
    if (match && !opened) {
      opened = true;
      spinner.succeed(`Vite running at ${match[0]}`);
      await open(match[0]);
    }
  };

  child.stdout.on("data", (chunk: Buffer) => void openWhenReady(chunk));
  child.stderr.on("data", (chunk: Buffer) => {
    process.stderr.write(chunk);
  });

  child.on("error", (error) => {
    spinner.fail("Failed to start dev server.");
    out.error(error.message);
  });

  process.on("SIGINT", () => {
    child.kill("SIGINT");
  });

  await new Promise<void>((resolve) => {
    child.on("exit", () => resolve());
  });
}
```

- [ ] **Step 2: Wire `run` command**

Modify `src/cli.ts`:

```ts
import { runCommand } from "./commands/run.js";
```

Add inside `buildCli()`:

```ts
program
  .command("run")
  .description("Run the active spike.")
  .option("--demo", "Run with VITE_HUNCH_DEMO=1")
  .action((options: { demo?: boolean }) => wrap(() => runCommand(options))());
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/commands/run.ts src/cli.ts
git commit -m "feat: add spike dev server command"
```

## Task 7: Session and Agent Context

**Files:**
- Create: `src/agent/types.ts`
- Create: `src/agent/session.ts`
- Create: `src/agent/context.ts`
- Test: `tests/agent/session.test.ts`
- Test: `tests/agent/context.test.ts`

- [ ] **Step 1: Write session tests**

Create `tests/agent/session.test.ts`:

```ts
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendSessionEvent, readRecentSession } from "../../src/agent/session.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "hunch-session-"));
  await mkdir(path.join(dir, ".hunch"), { recursive: true });
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("session jsonl", () => {
  it("appends and reads recent events", async () => {
    const file = path.join(dir, ".hunch", "session.jsonl");
    await appendSessionEvent(file, { role: "user", content: "hello", ts: "2026-04-25T00:00:00.000Z" });
    await appendSessionEvent(file, { role: "assistant", content: "hi", ts: "2026-04-25T00:00:01.000Z" });

    const events = await readRecentSession(file, 1);
    expect(events).toEqual([{ role: "assistant", content: "hi", ts: "2026-04-25T00:00:01.000Z" }]);
  });
});
```

- [ ] **Step 2: Run session tests to verify failure**

Run: `npm test -- tests/agent/session.test.ts`

Expected: FAIL because session module does not exist.

- [ ] **Step 3: Implement session and types**

Create `src/agent/types.ts`:

```ts
export type SessionRole = "user" | "assistant" | "tool";

export interface SessionEvent {
  role: SessionRole;
  content: string;
  ts: string;
  toolName?: string;
  toolInput?: unknown;
  toolResult?: unknown;
}

export interface SpikeContext {
  problem: string;
  persona: string;
  journey: string;
  decisions: string;
  fileTree: string;
}
```

Create `src/agent/session.ts`:

```ts
import { appendFile, readFile } from "node:fs/promises";
import type { SessionEvent } from "./types.js";

export async function appendSessionEvent(file: string, event: SessionEvent): Promise<void> {
  await appendFile(file, `${JSON.stringify(event)}\n`, "utf8");
}

export async function readRecentSession(file: string, limit = 20): Promise<SessionEvent[]> {
  let text = "";
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SessionEvent)
    .slice(-limit);
}
```

- [ ] **Step 4: Write context tests**

Create `tests/agent/context.test.ts`:

```ts
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSpikeContext } from "../../src/agent/context.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "hunch-context-"));
  await mkdir(path.join(dir, ".hunch"), { recursive: true });
  await mkdir(path.join(dir, "app", "src"), { recursive: true });
  await writeFile(path.join(dir, ".hunch", "problem.md"), "Problem\n");
  await writeFile(path.join(dir, ".hunch", "persona.md"), "Persona\n");
  await writeFile(path.join(dir, ".hunch", "journey.md"), "Journey\n");
  await writeFile(path.join(dir, ".hunch", "decisions.md"), "# Decisions\n");
  await writeFile(path.join(dir, "app", "src", "App.tsx"), "export default function App() { return null; }\n");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("loadSpikeContext", () => {
  it("loads core hunch files and shallow tree", async () => {
    const context = await loadSpikeContext({
      name: "sample",
      dir,
      appDir: path.join(dir, "app"),
      hunchDir: path.join(dir, ".hunch"),
    });

    expect(context.problem).toBe("Problem");
    expect(context.persona).toBe("Persona");
    expect(context.fileTree).toContain("src/");
  });
});
```

- [ ] **Step 5: Implement context loader**

Create `src/agent/context.ts`:

```ts
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { SpikeRef } from "../state/spike.js";
import type { SpikeContext } from "./types.js";

export async function loadSpikeContext(spike: SpikeRef): Promise<SpikeContext> {
  const [problem, persona, journey, decisions, fileTree] = await Promise.all([
    readTrimmed(path.join(spike.hunchDir, "problem.md")),
    readTrimmed(path.join(spike.hunchDir, "persona.md")),
    readTrimmed(path.join(spike.hunchDir, "journey.md")),
    readTrimmed(path.join(spike.hunchDir, "decisions.md")),
    listTree(spike.appDir, 2),
  ]);

  return { problem, persona, journey, decisions, fileTree };
}

async function readTrimmed(file: string): Promise<string> {
  return (await readFile(file, "utf8")).trim();
}

async function listTree(root: string, depth: number, prefix = ""): Promise<string> {
  if (depth < 0) return "";
  const entries = await readdir(path.join(root, prefix), { withFileTypes: true }).catch(() => []);
  const lines: string[] = [];

  for (const entry of entries.filter((item) => item.name !== "node_modules" && item.name !== "dist")) {
    const relative = path.join(prefix, entry.name);
    lines.push(`${relative}${entry.isDirectory() ? "/" : ""}`);
    if (entry.isDirectory()) {
      const child = await listTree(root, depth - 1, relative);
      if (child) lines.push(child);
    }
  }

  return lines.join("\n");
}
```

- [ ] **Step 6: Run tests**

Run: `npm test -- tests/agent/session.test.ts tests/agent/context.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/agent/types.ts src/agent/session.ts src/agent/context.ts tests/agent
git commit -m "feat: load spike agent context"
```

## Task 8: Prompt Rendering and Anthropic Client

**Files:**
- Create: `src/prompts/main.md`
- Create: `src/prompts/seed-data.md`
- Create: `src/prompts/show-script.md`
- Create: `src/prompts/show-questions.md`
- Create: `src/prompts/push-back.md`
- Create: `src/agent/prompts.ts`
- Create: `src/agent/anthropic.ts`
- Test: `tests/agent/prompts.test.ts`

- [ ] **Step 1: Write prompt rendering test**

Create `tests/agent/prompts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { renderTemplate } from "../../src/agent/prompts.js";

describe("renderTemplate", () => {
  it("replaces all known template tokens", () => {
    const result = renderTemplate("Problem: {{problem}}\nPersona: {{persona}}", {
      problem: "Dropoff",
      persona: "PM",
    });
    expect(result).toBe("Problem: Dropoff\nPersona: PM");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- tests/agent/prompts.test.ts`

Expected: FAIL because prompt renderer does not exist.

- [ ] **Step 3: Create prompt files**

Create `src/prompts/main.md`:

```md
You are Hunch, a prototyping agent for product managers who code.

You are not a production coding agent. You are a research instrument. Your job is to help a PM build a disposable prototype that tests a specific hunch about a customer problem.

== This spike ==

Problem: {{problem}}

Persona: {{persona}}

What we're testing: {{journey}}

== Recent decisions you've made ==

{{decisions}}

== App file tree ==

{{fileTree}}

== Your principles ==

1. The persona and journey are sacred. Every UX choice must serve them.
2. This is a prototype, not a product. Skip production concerns unless the hunch requires them.
3. Have UX taste. Use real-feeling seed data, human copy, loading states, empty states, distinctive typography, and cohesive color.
4. Log meaningful decisions with the decide tool.
5. Be concise. Show work briefly and ship the change.
```

Create `src/prompts/seed-data.md`:

```md
Generate realistic demo data for this spike as strict JSON.

Problem: {{problem}}
Persona: {{persona}}
Journey: {{journey}}

Return:
{
  "items": [
    { "title": "...", "body": "..." }
  ]
}
```

Create `src/prompts/show-script.md`:

```md
Write a concise customer interview walkthrough script for this prototype.

Problem: {{problem}}
Persona: {{persona}}
Journey: {{journey}}

Return markdown with five numbered steps.
```

Create `src/prompts/show-questions.md`:

```md
Write customer interview questions for this prototype.

Problem: {{problem}}
Persona: {{persona}}
Journey: {{journey}}

Return markdown bullets. Focus on whether the hunch is true.
```

Create `src/prompts/push-back.md`:

```md
The user has asked for: {{request}}

This spike is testing: {{journey}}

Current app summary:
{{summary}}

Reply with exactly one:
- in_scope
- out_of_scope: <one sentence why>
- ambiguous: <one question to ask>
```

- [ ] **Step 4: Implement prompt renderer and Anthropic wrapper**

Create `src/agent/prompts.ts`:

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";

export function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? "");
}

export async function loadPrompt(name: string, values: Record<string, string>): Promise<string> {
  const file = path.join(process.cwd(), "src", "prompts", `${name}.md`);
  return renderTemplate(await readFile(file, "utf8"), values);
}
```

Create `src/agent/anthropic.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { HunchError } from "../utils/errors.js";

export interface AnthropicClientOptions {
  apiKey?: string;
  model: string;
}

export function createAnthropicClient(options: AnthropicClientOptions): Anthropic {
  if (!options.apiKey) {
    throw new HunchError("Missing Anthropic API key. Set ANTHROPIC_API_KEY or configure api_key_env.");
  }

  return new Anthropic({ apiKey: options.apiKey });
}
```

- [ ] **Step 5: Run tests**

Run: `npm test -- tests/agent/prompts.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/prompts src/agent/prompts.ts src/agent/anthropic.ts tests/agent/prompts.test.ts
git commit -m "feat: add agent prompts and Anthropic client"
```

## Task 9: Scoped File and Shell Tools

**Files:**
- Create: `src/tools/file-tools.ts`
- Create: `src/tools/shell.ts`
- Create: `src/tools/definitions.ts`
- Test: `tests/tools/file-tools.test.ts`
- Test: `tests/tools/shell.test.ts`

- [ ] **Step 1: Write file tool tests**

Create `tests/tools/file-tools.test.ts`:

```ts
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { editFileTool, readFileTool, writeFileTool } from "../../src/tools/file-tools.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "hunch-tools-"));
  await mkdir(path.join(root, "app"), { recursive: true });
  await writeFile(path.join(root, "app", "App.tsx"), "hello world");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("file tools", () => {
  it("reads within spike", async () => {
    await expect(readFileTool(root, { path: "app/App.tsx" })).resolves.toBe("hello world");
  });

  it("rejects escape paths", async () => {
    await expect(readFileTool(root, { path: "../secret" })).rejects.toThrow("Path escapes");
  });

  it("writes and edits files", async () => {
    await writeFileTool(root, { path: "app/New.tsx", content: "alpha beta" });
    await editFileTool(root, { path: "app/New.tsx", old_str: "alpha", new_str: "gamma" });
    await expect(readFile(path.join(root, "app", "New.tsx"), "utf8")).resolves.toBe("gamma beta");
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/tools/file-tools.test.ts`

Expected: FAIL because file tools do not exist.

- [ ] **Step 3: Implement file tools**

Create `src/tools/file-tools.ts`:

```ts
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertInside } from "../state/paths.js";
import { HunchError } from "../utils/errors.js";

export async function readFileTool(root: string, input: { path: string }): Promise<string> {
  return readFile(resolveToolPath(root, input.path), "utf8");
}

export async function writeFileTool(root: string, input: { path: string; content: string }): Promise<string> {
  const target = resolveToolPath(root, input.path);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, input.content, "utf8");
  return `Wrote ${input.path}`;
}

export async function editFileTool(root: string, input: { path: string; old_str: string; new_str: string }): Promise<string> {
  const target = resolveToolPath(root, input.path);
  const current = await readFile(target, "utf8");
  const matches = current.split(input.old_str).length - 1;
  if (matches !== 1) {
    throw new HunchError(`edit_file expected exactly one match for old_str, found ${matches}.`);
  }
  await writeFile(target, current.replace(input.old_str, input.new_str), "utf8");
  return `Edited ${input.path}`;
}

export async function listFilesTool(root: string, input: { path?: string; depth?: number }): Promise<string> {
  const start = resolveToolPath(root, input.path ?? ".");
  return listTree(start, input.depth ?? 2);
}

function resolveToolPath(root: string, requested: string): string {
  return assertInside(root, path.join(root, requested));
}

async function listTree(root: string, depth: number, prefix = ""): Promise<string> {
  if (depth < 0) return "";
  const entries = await readdir(path.join(root, prefix), { withFileTypes: true });
  const lines: string[] = [];
  for (const entry of entries.filter((item) => !["node_modules", "dist"].includes(item.name))) {
    const relative = path.join(prefix, entry.name);
    lines.push(`${relative}${entry.isDirectory() ? "/" : ""}`);
    if (entry.isDirectory()) {
      const child = await listTree(root, depth - 1, relative);
      if (child) lines.push(child);
    }
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Write and implement shell allowlist tests**

Create `tests/tools/shell.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isAllowedShellCommand } from "../../src/tools/shell.js";

describe("isAllowedShellCommand", () => {
  it("allows npm install and npm run scripts", () => {
    expect(isAllowedShellCommand("npm install")).toBe(true);
    expect(isAllowedShellCommand("npm run build")).toBe(true);
  });

  it("rejects arbitrary shell commands", () => {
    expect(isAllowedShellCommand("rm -rf /")).toBe(false);
    expect(isAllowedShellCommand("curl https://example.com")).toBe(false);
  });
});
```

Create `src/tools/shell.ts`:

```ts
import { spawn } from "node:child_process";
import { HunchError } from "../utils/errors.js";

export function isAllowedShellCommand(command: string): boolean {
  return /^npm install$/.test(command) || /^npm run [a-zA-Z0-9:_-]+$/.test(command) || /^npx shadcn@[^\s]+ add [a-zA-Z0-9:_-]+$/.test(command);
}

export async function runShellTool(cwd: string, input: { command: string }): Promise<string> {
  if (!isAllowedShellCommand(input.command)) {
    throw new HunchError(`Command is not allow-listed: ${input.command}`);
  }

  const [cmd, ...args] = input.command.split(" ");
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk.toString()));
    child.stderr.on("data", (chunk) => (output += chunk.toString()));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(output.trim());
      else reject(new HunchError(`Command failed with exit code ${code}: ${output}`));
    });
  });
}
```

Create `src/tools/definitions.ts`:

```ts
export const toolDefinitions = [
  {
    name: "read_file",
    description: "Read a file within the current spike.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write a file within the current spike.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
    },
  },
  {
    name: "edit_file",
    description: "Replace exactly one string in a file within the current spike.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" }, old_str: { type: "string" }, new_str: { type: "string" } },
      required: ["path", "old_str", "new_str"],
    },
  },
  {
    name: "list_files",
    description: "List files within the current spike.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" }, depth: { type: "number" } },
    },
  },
  {
    name: "run_shell",
    description: "Run an allow-listed command in the spike app directory.",
    input_schema: {
      type: "object",
      properties: { command: { type: "string" } },
      required: ["command"],
    },
  },
];
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -- tests/tools/file-tools.test.ts tests/tools/shell.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/tools tests/tools
git commit -m "feat: add scoped agent tools"
```

## Task 10: UX Decisions and Seed Data Tools

**Files:**
- Create: `src/tools/ux-decisions.ts`
- Create: `src/tools/seed-data.ts`
- Modify: `src/tools/definitions.ts`
- Test: `tests/tools/ux-decisions.test.ts`

- [ ] **Step 1: Write decision tool test**

Create `tests/tools/ux-decisions.test.ts`:

```ts
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendDecision, markDecision } from "../../src/tools/ux-decisions.js";

let hunchDir: string;

beforeEach(async () => {
  hunchDir = await mkdtemp(path.join(tmpdir(), "hunch-decisions-"));
  await mkdir(hunchDir, { recursive: true });
});

afterEach(async () => {
  await rm(hunchDir, { recursive: true, force: true });
});

describe("ux decisions", () => {
  it("appends and marks decisions", async () => {
    const file = path.join(hunchDir, "decisions.md");
    await appendDecision(file, { decision: "Use cards", rationale: "They invite comparison.", ts: "2026-04-25T00:00:00.000Z" });
    await markDecision(file, "Use cards", "approved");
    const text = await readFile(file, "utf8");
    expect(text).toContain("Status: approved");
    expect(text).toContain("Use cards");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- tests/tools/ux-decisions.test.ts`

Expected: FAIL because decisions tool does not exist.

- [ ] **Step 3: Implement decisions and seed data helpers**

Create `src/tools/ux-decisions.ts`:

```ts
import { appendFile, readFile, writeFile } from "node:fs/promises";

export type DecisionStatus = "approved" | "superseded" | "removed";

export interface DecisionInput {
  decision: string;
  rationale: string;
  ts: string;
}

export async function appendDecision(file: string, input: DecisionInput): Promise<string> {
  const entry = `## ${input.decision}\n\nStatus: pending\nTime: ${input.ts}\n\n${input.rationale}\n\n`;
  await appendFile(file, entry, "utf8");
  return `Logged decision: ${input.decision}`;
}

export async function markDecision(file: string, decision: string, status: DecisionStatus): Promise<string> {
  const current = await readFile(file, "utf8");
  const updated = current.replace(`## ${decision}\n\nStatus: pending`, `## ${decision}\n\nStatus: ${status}`);
  await writeFile(file, updated, "utf8");
  return `Marked decision ${status}: ${decision}`;
}
```

Create `src/tools/seed-data.ts`:

```ts
export interface SeedData {
  items: Array<{ title: string; body: string }>;
}

export function parseSeedDataJson(text: string): SeedData {
  const parsed = JSON.parse(text) as SeedData;
  if (!Array.isArray(parsed.items)) {
    throw new Error("Seed data must include an items array.");
  }
  return parsed;
}
```

- [ ] **Step 4: Add decision, seed, and pushback tool definitions**

Append to `toolDefinitions` in `src/tools/definitions.ts`:

```ts
  {
    name: "decide",
    description: "Log a meaningful UX decision with a one-sentence rationale.",
    input_schema: {
      type: "object",
      properties: { decision: { type: "string" }, rationale: { type: "string" } },
      required: ["decision", "rationale"],
    },
  },
  {
    name: "generate_seed_data",
    description: "Generate realistic demo content for the current spike.",
    input_schema: {
      type: "object",
      properties: { purpose: { type: "string" } },
      required: ["purpose"],
    },
  },
  {
    name: "push_back",
    description: "Classify whether a user request is in scope for the spike.",
    input_schema: {
      type: "object",
      properties: { request: { type: "string" } },
      required: ["request"],
    },
  }
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -- tests/tools/ux-decisions.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/tools/ux-decisions.ts src/tools/seed-data.ts src/tools/definitions.ts tests/tools/ux-decisions.test.ts
git commit -m "feat: add UX decision tools"
```

## Task 11: Agent Tool Loop and `hunch ask`

**Files:**
- Create: `src/agent/loop.ts`
- Create: `src/commands/ask.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Implement tool dispatch and agent loop**

Create `src/agent/loop.ts`:

```ts
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { loadConfig } from "../state/config.js";
import type { SpikeRef } from "../state/spike.js";
import { editFileTool, listFilesTool, readFileTool, writeFileTool } from "../tools/file-tools.js";
import { runShellTool } from "../tools/shell.js";
import { appendDecision } from "../tools/ux-decisions.js";
import { timestamp } from "../utils/time.js";
import { loadSpikeContext } from "./context.js";
import { loadPrompt } from "./prompts.js";
import { appendSessionEvent, readRecentSession } from "./session.js";
import { toolDefinitions } from "../tools/definitions.js";

export interface AgentLoopOptions {
  client: Anthropic;
  spike: SpikeRef;
  message: string;
  verbose?: boolean;
}

export async function runAgentLoop(options: AgentLoopOptions): Promise<string> {
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
  const history = await readRecentSession(sessionFile);

  await appendSessionEvent(sessionFile, { role: "user", content: options.message, ts: timestamp() });

  const messages: Anthropic.Messages.MessageParam[] = [
    ...history
      .filter((event) => event.role === "user" || event.role === "assistant")
      .map((event) => ({ role: event.role as "user" | "assistant", content: event.content })),
    { role: "user", content: options.message },
  ];

  let finalText = "";
  let response = await options.client.messages.create({
    model: config.model,
    max_tokens: 4096,
    system,
    tools: toolDefinitions,
    messages,
  });

  while (true) {
    const toolResults: Anthropic.Messages.MessageParam["content"] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        finalText += block.text;
        process.stdout.write(block.text);
      }
      if (block.type === "tool_use") {
        const result = await dispatchTool(options.spike, block.name, block.input);
        await appendSessionEvent(sessionFile, {
          role: "tool",
          content: String(result),
          ts: timestamp(),
          toolName: block.name,
          toolInput: block.input,
          toolResult: result,
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: String(result),
        });
      }
    }

    if (response.stop_reason !== "tool_use" || toolResults.length === 0) break;

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });
    response = await options.client.messages.create({
      model: config.model,
      max_tokens: 4096,
      system,
      tools: toolDefinitions,
      messages,
    });
  }

  await appendSessionEvent(sessionFile, { role: "assistant", content: finalText.trim(), ts: timestamp() });
  return finalText.trim();
}

async function dispatchTool(spike: SpikeRef, name: string, input: unknown): Promise<string> {
  if (name === "read_file") return readFileTool(spike.dir, input as { path: string });
  if (name === "write_file") return writeFileTool(spike.dir, input as { path: string; content: string });
  if (name === "edit_file") return editFileTool(spike.dir, input as { path: string; old_str: string; new_str: string });
  if (name === "list_files") return listFilesTool(spike.dir, input as { path?: string; depth?: number });
  if (name === "run_shell") return runShellTool(spike.appDir, input as { command: string });
  if (name === "decide") {
    const decision = input as { decision: string; rationale: string };
    return appendDecision(path.join(spike.hunchDir, "decisions.md"), { ...decision, ts: timestamp() });
  }
  if (name === "generate_seed_data") return "Seed data generation is available through `hunch show`.";
  if (name === "push_back") return "Use the persona and journey to decide whether to proceed or ask a scope question.";
  throw new Error(`Unknown tool: ${name}`);
}
```

- [ ] **Step 2: Implement ask command**

Create `src/commands/ask.ts`:

```ts
import { input } from "@inquirer/prompts";
import { createAnthropicClient } from "../agent/anthropic.js";
import { runAgentLoop } from "../agent/loop.js";
import { loadConfig } from "../state/config.js";
import { getActiveSpike } from "../state/spike.js";

export async function askCommand(message?: string, options: { verbose?: boolean } = {}): Promise<void> {
  const config = await loadConfig();
  const spike = await getActiveSpike();
  const client = createAnthropicClient({ apiKey: process.env[config.apiKeyEnv], model: config.model });

  if (message) {
    await runAgentLoop({ client, spike, message, verbose: options.verbose });
    process.stdout.write("\n");
    return;
  }

  while (true) {
    const next = await input({ message: "hunch" });
    if (!next.trim()) break;
    await runAgentLoop({ client, spike, message: next, verbose: options.verbose });
    process.stdout.write("\n");
  }
}
```

- [ ] **Step 3: Wire ask command**

Modify `src/cli.ts`:

```ts
import { askCommand } from "./commands/ask.js";
```

Add:

```ts
program
  .command("ask")
  .description("Talk to the agent in the active spike.")
  .argument("[message]", "Message to send")
  .option("--verbose", "Print verbose tool progress")
  .action((message: string | undefined, options: { verbose?: boolean }) => wrap(() => askCommand(message, options))());
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/agent/loop.ts src/commands/ask.ts src/cli.ts
git commit -m "feat: add Anthropic ask loop"
```

## Task 12: `hunch decide`

**Files:**
- Create: `src/commands/decide.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Implement decide command**

Create `src/commands/decide.ts`:

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { select } from "@inquirer/prompts";
import { getActiveSpike } from "../state/spike.js";
import { markDecision, type DecisionStatus } from "../tools/ux-decisions.js";
import { out } from "../ui/output.js";

export async function decideCommand(): Promise<void> {
  const spike = await getActiveSpike();
  const file = path.join(spike.hunchDir, "decisions.md");
  const text = await readFile(file, "utf8").catch(() => "# UX Decisions\n\n");
  const decisions = [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1]);

  if (decisions.length === 0) {
    out.info("No UX decisions logged yet.");
    return;
  }

  for (const decision of decisions) {
    const status = await select<DecisionStatus | "skip">({
      message: decision,
      choices: [
        { name: "Approve", value: "approved" },
        { name: "Mark superseded", value: "superseded" },
        { name: "Mark removed", value: "removed" },
        { name: "Skip", value: "skip" },
      ],
    });

    if (status !== "skip") {
      await markDecision(file, decision, status);
    }
  }

  out.success("Decision review complete.");
}
```

- [ ] **Step 2: Wire decide command**

Modify `src/cli.ts`:

```ts
import { decideCommand } from "./commands/decide.js";
```

Add:

```ts
program.command("decide").description("Review UX decisions for the active spike.").action(wrap(decideCommand));
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/commands/decide.ts src/cli.ts
git commit -m "feat: add UX decision review command"
```

## Task 13: `hunch show`

**Files:**
- Create: `src/commands/show.ts`
- Modify: `src/cli.ts`

- [ ] **Step 1: Implement show command**

Create `src/commands/show.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { input } from "@inquirer/prompts";
import ora from "ora";
import { createAnthropicClient } from "../agent/anthropic.js";
import { loadSpikeContext } from "../agent/context.js";
import { loadPrompt } from "../agent/prompts.js";
import { loadConfig } from "../state/config.js";
import { getActiveSpike } from "../state/spike.js";
import { out } from "../ui/output.js";
import { runCommand } from "./run.js";

export async function showCommand(): Promise<void> {
  const config = await loadConfig();
  const spike = await getActiveSpike();
  const context = await loadSpikeContext(spike);
  const client = createAnthropicClient({ apiKey: process.env[config.apiKeyEnv], model: config.model });
  const showDir = path.join(spike.hunchDir, "show");

  await mkdir(showDir, { recursive: true });

  const spinner = ora(`Preparing ${spike.name} for a customer interview...`).start();
  const values = { problem: context.problem, persona: context.persona, journey: context.journey };
  const [scriptResponse, questionsResponse] = await Promise.all([
    client.messages.create({ model: config.model, max_tokens: 1200, messages: [{ role: "user", content: await loadPrompt("show-script", values) }] }),
    client.messages.create({ model: config.model, max_tokens: 1200, messages: [{ role: "user", content: await loadPrompt("show-questions", values) }] }),
  ]);

  const script = extractText(scriptResponse.content);
  const questions = extractText(questionsResponse.content);
  await writeFile(path.join(showDir, "script.md"), script, "utf8");
  await writeFile(path.join(showDir, "questions.md"), questions, "utf8");

  spinner.succeed("Prepared interview materials.");
  out.info("\nWalkthrough script:\n");
  out.info(script);
  out.info("\nInterview questions:\n");
  out.info(questions);
  out.info("\nStarting demo server. Press Ctrl-C to stop.");
  await input({ message: "Press Return to start the demo server" });
  await runCommand({ demo: true });
}

function extractText(content: Array<{ type: string; text?: string }>): string {
  return content.filter((block) => block.type === "text").map((block) => block.text ?? "").join("\n").trim();
}
```

- [ ] **Step 2: Wire show command**

Modify `src/cli.ts`:

```ts
import { showCommand } from "./commands/show.js";
```

Add:

```ts
program.command("show").description("Prepare the active spike for a customer interview.").action(wrap(showCommand));
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/commands/show.ts src/cli.ts
git commit -m "feat: add customer interview show command"
```

## Task 14: Initial Agent Generation in `hunch new`

**Files:**
- Modify: `src/commands/new.ts`

- [ ] **Step 1: Add initial generation after scaffold**

Modify `createSpike` in `src/commands/new.ts` so when `generate !== false`, it runs:

```ts
const config = await loadConfig({ homeDir: options.homeDir, cwd: options.cwd });
if (options.generate !== false && process.env[config.apiKeyEnv]) {
  const { createAnthropicClient } = await import("../agent/anthropic.js");
  const { runAgentLoop } = await import("../agent/loop.js");
  const client = createAnthropicClient({ apiKey: process.env[config.apiKeyEnv], model: config.model });
  await runAgentLoop({
    client,
    spike,
    message: "Generate the initial prototype for this spike. Replace the starter app with a focused, clickable flow that tests the journey.",
  });
}
```

- [ ] **Step 2: Keep tests network-free**

Confirm the existing `createSpike` test passes because it calls:

```ts
generate: false
```

- [ ] **Step 3: Run tests and typecheck**

Run: `npm test`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/commands/new.ts
git commit -m "feat: generate initial prototype on new spikes"
```

## Task 15: README and CLI Smoke Notes

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create README**

Create `README.md`:

```md
# Hunch

A CLI for PMs who code. Give it a customer problem; get a disposable prototype for learning fast.

## Install

```bash
npm install -g hunch-cli
export ANTHROPIC_API_KEY=sk-ant-...
```

## Use

```bash
hunch new
hunch run
hunch ask "make the cards more specific to the persona"
hunch decide
hunch show
```

## Local Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

## State

Global state lives in `~/.hunch`. Spikes live in `~/hunches` by default.

Each spike contains `.hunch/` agent state and `app/` Vite code.
```

- [ ] **Step 2: Verify docs and build**

Run: `npm run typecheck`

Expected: PASS.

Run: `npm test`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add Hunch README"
```

## Task 16: Full Local Verification

**Files:**
- No planned code changes unless verification finds bugs.

- [ ] **Step 1: Run automated verification**

Run: `npm run typecheck`

Expected: PASS.

Run: `npm test`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 2: Run CLI smoke checks**

Run: `node dist/cli.js --help`

Expected: output includes `new`, `run`, `ask`, `decide`, `show`, `list`, and `open`.

Run: `node dist/cli.js list`

Expected: either lists spikes or prints a no-spikes message.

- [ ] **Step 3: Run manual spike creation without agent**

Use the exported `createSpike` helper from a one-off Node script or run `hunch new` interactively with `ANTHROPIC_API_KEY` unset.

Expected:

- A spike directory is created under `~/hunches`.
- `.hunch/problem.md`, `.hunch/persona.md`, `.hunch/journey.md`, `.hunch/decisions.md`, and `.hunch/session.jsonl` exist.
- `app/package.json` exists.
- `~/.hunch/active` points to the new spike.

- [ ] **Step 4: Run template app build in created spike**

Run: `npm install` from the created spike's `app/`.

Expected: PASS.

Run: `npm run build` from the created spike's `app/`.

Expected: PASS.

- [ ] **Step 5: Commit verification fixes if any**

If a verification bug is fixed:

```bash
git add <changed-files>
git commit -m "fix: address v0.1 verification issues"
```

If no code changes were needed, do not create an empty commit.

## Task 17: Optional API End-to-End Check

**Files:**
- No planned code changes unless the live API path exposes a bug.

- [ ] **Step 1: Confirm API key**

Run: `test -n "$ANTHROPIC_API_KEY"`

Expected: exit code 0 when the key is configured.

- [ ] **Step 2: Run live `ask` smoke**

Run: `node dist/cli.js ask "make the hero copy sharper and log your decision"`

Expected:

- The agent edits files inside the active spike only.
- `.hunch/session.jsonl` receives user, assistant, and tool events.
- `.hunch/decisions.md` receives a decision entry if the agent makes a non-obvious UX choice.

- [ ] **Step 3: Run live `show` smoke**

Run: `node dist/cli.js show`

Expected:

- `.hunch/show/script.md` is created.
- `.hunch/show/questions.md` is created.
- The command can start the Vite demo server.

- [ ] **Step 4: Commit live-path fixes if any**

```bash
git add <changed-files>
git commit -m "fix: polish live agent workflow"
```

## Self-Review

Spec coverage:

- Standalone TypeScript CLI: Tasks 1 and 3.
- Global state and active spike: Tasks 2 and 3.
- Per-spike state: Task 5.
- Packaged Vite React template: Task 4.
- Anthropic agent runtime: Tasks 7, 8, 11, and 14.
- Scoped tools: Tasks 9 and 10.
- Commands `new`, `run`, `ask`, `decide`, `show`, `list`, `open`: Tasks 3, 5, 6, 11, 12, and 13.
- Testing and verification: Tasks 2 through 17.

Placeholder scan:

- No banned marker strings are intentionally present in implementation steps.
- Code blocks define concrete files, commands, and expected results.

Type consistency:

- Spike references use `SpikeRef`.
- Session events use `SessionEvent`.
- Prompt context uses `SpikeContext`.
- `createSpike` accepts `NewSpikeAnswers` and `CreateSpikeOptions`.
