# Hunch v0.2 Local-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an experimental local-first provider path that tries local inference before Anthropic and exposes local setup/status commands.

**Architecture:** Introduce a provider-neutral agent client interface, wrap Anthropic behind it, add local provider status/setup/client modules, and route commands through a provider router. Keep local runtime optional and test with injected fakes so CI never downloads or runs a model.

**Tech Stack:** TypeScript, Commander, Vitest, existing Hunch CLI modules, optional `node-llama-cpp` dynamic import seam.

---

## File Structure

- `src/agent/client.ts`: shared provider-neutral client and response types.
- `src/agent/anthropic.ts`: adapt Anthropic SDK to `AgentProviderClient`.
- `src/agent/local.ts`: local config defaults, model path/status/setup, optional local client creation.
- `src/agent/provider-router.ts`: local-first / forced local / forced cloud routing.
- `src/agent/loop.ts`: depend on `AgentProviderClient` instead of Anthropic SDK type.
- `src/state/config.ts`: parse `provider: auto|local|anthropic`, fallback provider, and `local` config.
- `src/commands/local.ts`: `hunch local setup` and `hunch local status`.
- `src/commands/ask.ts`: add `--local` and `--cloud`, route through provider router.
- `src/commands/show.ts`: add `--local` and `--cloud`, route through provider router.
- `src/cli.ts`: wire local subcommands and provider flags.
- `README.md`: document local-first mode.
- Tests under `tests/agent`, `tests/state`, and `tests/commands`.

## Task 1: Provider-Neutral Agent Client

**Files:**
- Create: `src/agent/client.ts`
- Modify: `src/agent/anthropic.ts`
- Modify: `src/agent/loop.ts`
- Test: `tests/agent/loop.test.ts`

- [ ] **Step 1: Add shared agent client types**

Create `src/agent/client.ts`:

```ts
import type {
  ContentBlockParam,
  MessageParam,
} from "@anthropic-ai/sdk/resources/messages/messages";

export type ProviderName = "local" | "anthropic";

export interface AgentMessageCreateParams {
  model: string;
  max_tokens: number;
  system?: string;
  tools?: unknown[];
  messages: MessageParam[];
}

export interface AgentMessageResponse {
  content: ContentBlockParam[];
  stop_reason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence" | null;
}

export interface AgentProviderClient {
  provider: ProviderName;
  model: string;
  messages: {
    create(params: AgentMessageCreateParams): Promise<AgentMessageResponse>;
  };
}
```

- [ ] **Step 2: Adapt Anthropic client**

Modify `src/agent/anthropic.ts` so `createAnthropicClient` returns `AgentProviderClient`.

Implementation outline:

```ts
import Anthropic from "@anthropic-ai/sdk";
import type { AgentProviderClient } from "./client.js";

export function createAnthropicClient(options: AnthropicClientOptions): AgentProviderClient {
  if (!options.apiKey) {
    throw new HunchError(
      "Missing Anthropic API key. Set ANTHROPIC_API_KEY or configure api_key_env.",
    );
  }

  const client = new Anthropic({ apiKey: options.apiKey });
  return {
    provider: "anthropic",
    model: options.model,
    messages: {
      create: async (params) => {
        const response = await client.messages.create({
          model: params.model,
          max_tokens: params.max_tokens,
          system: params.system,
          tools: params.tools as never,
          messages: params.messages,
        });
        return {
          content: response.content,
          stop_reason: response.stop_reason,
        };
      },
    },
  };
}
```

- [ ] **Step 3: Update loop types**

Modify `src/agent/loop.ts`:

- Replace `import type Anthropic from "@anthropic-ai/sdk";` with `import type { AgentProviderClient } from "./client.js";`.
- Change `RunAgentLoopOptions.client` to `AgentProviderClient`.
- Change `createMessage(client: Anthropic, ...)` to `createMessage(client: AgentProviderClient, ...)`.
- Keep all existing tests passing.

- [ ] **Step 4: Verify**

Run:

```sh
npm test -- tests/agent/loop.test.ts tests/commands/ask.test.ts tests/commands/show.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```sh
git add src/agent/client.ts src/agent/anthropic.ts src/agent/loop.ts tests/agent/loop.test.ts tests/commands/ask.test.ts tests/commands/show.test.ts
git commit -m "refactor: add provider-neutral agent client"
```

## Task 2: Config Support For Local-First Mode

**Files:**
- Modify: `src/state/config.ts`
- Test: `tests/state/config.test.ts`

- [ ] **Step 1: Add failing config tests**

Add tests covering:

```ts
it("defaults to auto provider with local defaults", async () => {
  const homeDir = await makeHome();
  const config = await loadConfig({ homeDir });
  expect(config.provider).toBe("auto");
  expect(config.fallbackProvider).toBe("anthropic");
  expect(config.local.enabled).toBe(true);
  expect(config.local.model).toBe("hunch-lite");
  expect(config.local.modelPath).toBe(join(homeDir, ".hunch", "models", "hunch-lite.gguf"));
  expect(config.local.modelUrl).toBe("");
});

it("parses local provider config", async () => {
  const homeDir = await makeHome();
  await writeConfig(homeDir, [
    "provider: local",
    "fallback_provider: anthropic",
    "local:",
    "  enabled: false",
    "  model_path: ~/models/tiny.gguf",
    "  model_url: https://example.com/tiny.gguf",
    "  model: tiny",
  ].join("\\n"));
  const config = await loadConfig({ homeDir });
  expect(config.provider).toBe("local");
  expect(config.local.enabled).toBe(false);
  expect(config.local.modelPath).toBe(join(homeDir, "models", "tiny.gguf"));
  expect(config.local.modelUrl).toBe("https://example.com/tiny.gguf");
  expect(config.local.model).toBe("tiny");
});
```

- [ ] **Step 2: Implement config parsing**

Update `HunchConfig`:

```ts
export type ProviderMode = "auto" | "local" | "anthropic";

export interface LocalConfig {
  enabled: boolean;
  modelPath: string;
  modelUrl: string;
  model: string;
}

export interface HunchConfig {
  provider: ProviderMode;
  fallbackProvider: "anthropic";
  model: string;
  apiKeyEnv: string;
  spikeDir: string;
  local: LocalConfig;
  pushBackOnScopeCreep: boolean;
  logDecisions: boolean;
}
```

Parsing rules:

- missing provider -> `auto`
- existing `provider: anthropic` remains valid
- `provider` accepts only `auto|local|anthropic`
- `fallback_provider` accepts only `anthropic`
- `local.enabled` is boolean
- `local.model_path`, `local.model_url`, and `local.model` are non-blank strings when present
- default `local.model_path` is `path.join(paths.hunchDir, "models", "hunch-lite.gguf")`

- [ ] **Step 3: Verify**

Run:

```sh
npm test -- tests/state/config.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```sh
git add src/state/config.ts tests/state/config.test.ts
git commit -m "feat: add local-first config"
```

## Task 3: Local Provider Status And Setup

**Files:**
- Create: `src/agent/local.ts`
- Create: `src/commands/local.ts`
- Modify: `src/cli.ts`
- Test: `tests/agent/local.test.ts`
- Test: `tests/commands/local.test.ts`

- [ ] **Step 1: Implement local status module with tests**

Create `tests/agent/local.test.ts` with tests for missing/existing model files and safe setup path.

Core API:

```ts
export interface LocalStatus {
  enabled: boolean;
  modelPath: string;
  modelExists: boolean;
  runtimeAvailable: boolean;
  runtimeError?: string;
}

export async function getLocalStatus(config: HunchConfig): Promise<LocalStatus>;
export async function setupLocalModel(config: HunchConfig): Promise<string>;
```

Implementation:

- `getLocalStatus` checks model file with `stat`.
- Runtime availability uses an injectable/dynamic import seam:
  `checkLocalRuntime(importer = defaultImporter)`.
- v0.2 default setup creates `path.dirname(config.local.modelPath)`.
- If `config.local.modelUrl` is empty, return a message instructing the user to place a GGUF at `modelPath`.
- If `modelUrl` is non-empty, download to `modelPath.tmp`, rename atomically, and ensure final path stays inside `~/.hunch/models` or the configured model directory.

- [ ] **Step 2: Implement local command tests**

Create `tests/commands/local.test.ts` with:

- status prints model path and missing/available state
- setup prints manual placement instructions when no URL exists

Use injected `status` and `setup` functions so tests do not import native runtime or download.

- [ ] **Step 3: Wire CLI**

Add in `src/cli.ts`:

```ts
const local = program.command("local").description("Manage local model support.");
local.command("setup").description("Prepare local model storage.").action(() => localSetupCommand(options));
local.command("status").description("Check local model status.").action(() => localStatusCommand(options));
```

- [ ] **Step 4: Verify**

Run:

```sh
npm test -- tests/agent/local.test.ts tests/commands/local.test.ts tests/cli.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```sh
git add src/agent/local.ts src/commands/local.ts src/cli.ts tests/agent/local.test.ts tests/commands/local.test.ts tests/cli.test.ts
git commit -m "feat: add local model setup and status"
```

## Task 4: Provider Router

**Files:**
- Create: `src/agent/provider-router.ts`
- Test: `tests/agent/provider-router.test.ts`

- [ ] **Step 1: Add router tests**

Test cases:

- auto chooses local when local client is available
- auto falls back to Anthropic when local unavailable and API key exists
- forced local fails when local unavailable
- forced cloud uses Anthropic
- no providers yields setup guidance error

Use injected factories:

```ts
const fakeLocal = async () => ({ available: true, client });
const fakeAnthropic = () => client;
```

- [ ] **Step 2: Implement router**

API:

```ts
export type ProviderOverride = "local" | "cloud";

export interface ResolveProviderOptions {
  config: HunchConfig;
  env?: NodeJS.ProcessEnv;
  override?: ProviderOverride;
  createLocal?: () => Promise<LocalClientResult>;
  createAnthropic?: () => AgentProviderClient;
}

export async function resolveAgentProvider(options: ResolveProviderOptions): Promise<ProviderResolution>;
```

Rules:

- `override: "local"`: local only
- `override: "cloud"`: Anthropic only
- `config.provider === "auto"`: local then Anthropic
- `config.provider === "local"`: local only
- `config.provider === "anthropic"`: Anthropic only

- [ ] **Step 3: Verify**

Run:

```sh
npm test -- tests/agent/provider-router.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```sh
git add src/agent/provider-router.ts tests/agent/provider-router.test.ts
git commit -m "feat: add local-first provider router"
```

## Task 5: Integrate Provider Router Into `ask`

**Files:**
- Modify: `src/commands/ask.ts`
- Modify: `src/cli.ts`
- Test: `tests/commands/ask.test.ts`
- Test: `tests/cli.test.ts`

- [ ] **Step 1: Add command tests**

Cover:

- default ask resolves provider with no override
- `--local` passes local override
- `--cloud` passes cloud override

Use injected `resolveProvider` and `runAgent` seams.

- [ ] **Step 2: Implement ask integration**

Update options:

```ts
export interface AskCommandOptions extends PathResolverOptions {
  verbose?: boolean;
  providerOverride?: "local" | "cloud";
  resolveProvider?: typeof resolveAgentProvider;
  runAgent?: typeof runAgentLoop;
}
```

Command flow:

- load config
- get active spike
- resolve provider
- print fallback status only when `fellBack`
- run agent loop with resolved client

CLI:

```ts
.option("--local", "Force local model provider")
.option("--cloud", "Force Anthropic provider")
```

Reject both flags with `HunchError`.

- [ ] **Step 3: Verify**

Run:

```sh
npm test -- tests/commands/ask.test.ts tests/cli.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```sh
git add src/commands/ask.ts src/cli.ts tests/commands/ask.test.ts tests/cli.test.ts
git commit -m "feat: route ask through local-first providers"
```

## Task 6: Integrate Provider Router Into `show`

**Files:**
- Modify: `src/commands/show.ts`
- Modify: `src/cli.ts`
- Test: `tests/commands/show.test.ts`

- [ ] **Step 1: Add show provider tests**

Cover:

- default show uses resolved provider client
- `--local` and `--cloud` are wired from CLI
- provider failure before writes can fall back through router result

Use existing fake client tests and add injected `resolveProvider`.

- [ ] **Step 2: Implement show integration**

Update `ShowCommandOptions`:

```ts
providerOverride?: "local" | "cloud";
resolveProvider?: typeof resolveAgentProvider;
```

If `options.client` is provided, use it for tests and skip provider routing.
Otherwise resolve provider and use `resolution.client`.

CLI flags mirror `ask`.

- [ ] **Step 3: Verify**

Run:

```sh
npm test -- tests/commands/show.test.ts tests/cli.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```sh
git add src/commands/show.ts src/cli.ts tests/commands/show.test.ts tests/cli.test.ts
git commit -m "feat: route show through local-first providers"
```

## Task 7: Local Client Runtime Seam

**Files:**
- Modify: `src/agent/local.ts`
- Test: `tests/agent/local.test.ts`

- [ ] **Step 1: Add fake local client tests**

Test that:

- missing runtime returns unavailable
- missing model file returns unavailable
- injected runtime can create an `AgentProviderClient`

- [ ] **Step 2: Implement optional runtime client**

Add:

```ts
export async function createLocalClient(config: HunchConfig): Promise<LocalClientResult>;
```

For v0.2:

- If model missing, return `{ available: false, reason }`
- If runtime import fails, return `{ available: false, reason }`
- If runtime import succeeds, construct a client through a small adapter.
- Keep native import dynamic and isolated. Do not add `node-llama-cpp` as a required dependency unless the package install/build remains acceptable.

The local adapter can initially support text responses and return `stop_reason: "end_turn"`. Tool-use-capable local models can be added behind the same interface in a future release.

- [ ] **Step 3: Verify**

Run:

```sh
npm test -- tests/agent/local.test.ts tests/agent/provider-router.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```sh
git add src/agent/local.ts tests/agent/local.test.ts tests/agent/provider-router.test.ts
git commit -m "feat: add optional local agent client"
```

## Task 8: README And Final Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README**

Add a Local Mode section documenting:

```md
## Local-First Mode

Hunch tries a configured local model first, then falls back to Anthropic when
available. Local mode is experimental and best for lighter product work such as
copy edits, seed data, interview materials, and UX decision summaries.

```sh
hunch local setup
hunch local status
hunch ask --local "tighten the copy"
hunch ask --cloud "do a larger redesign"
```

The npm package does not bundle a model yet. Place a GGUF model at the path
reported by `hunch local status`, or configure `local.model_url` in
`~/.hunch/config.yaml`.
```

- [ ] **Step 2: Full verification**

Run:

```sh
npm run typecheck
npm test
npm run build
npm_config_cache=/tmp/hunch-npm-cache npm pack --dry-run
```

Expected: PASS.

- [ ] **Step 3: Commit**

```sh
git add README.md
git commit -m "docs: document local-first mode"
```

## Self-Review

- Spec coverage: provider config, local setup/status, local-first router, ask/show integration, local runtime seam, docs, and tests are all covered.
- Completeness scan: no incomplete tasks remain; v0.2 decisions are explicit in the spec.
- Type consistency: `ProviderOverride`, `AgentProviderClient`, and `ProviderResolution` are introduced before downstream tasks use them.
