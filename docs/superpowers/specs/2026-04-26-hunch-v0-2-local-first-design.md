# Hunch v0.2 Local-First Design

## Summary

Hunch v0.2 adds an experimental local-first agent mode. Hunch should try a
configured local model first, then fall back to Anthropic when local inference is
unavailable, unhealthy, or explicitly unsuitable for the requested task. This
turns Hunch from a cloud-agent CLI into a local-first prototyping apparatus while
preserving the quality path of the existing Anthropic provider.

The first release of local mode should be useful without over-promising. Local
models are best for seed data, interview materials, UX decision summaries, copy
variants, and small targeted edits. Broad prototype generation and larger
multi-file changes can fall back to Anthropic.

## Goals

- Add a provider routing layer that supports `auto`, `local`, and `anthropic`
  modes.
- Add local model configuration and status checks under the existing Hunch
  config/state model.
- Add `hunch local setup` and `hunch local status` commands.
- Make `hunch ask` and `hunch show` local-first by default when local mode is
  enabled.
- Keep Anthropic as the fallback provider when `ANTHROPIC_API_KEY` is available.
- Keep tests deterministic by using fake provider clients. Tests must not
  download or execute a real model.
- Document local mode as experimental and make failure modes clear.

## Non-Goals

- Do not bundle a model inside the npm package in v0.2.
- Do not require local mode to equal Anthropic quality.
- Do not build a model marketplace.
- Do not add cloud sync, hosted model routing, or team workflows.
- Do not let local setup execute unreviewed package scripts or mutate app
  execution surfaces.

## User Experience

### Default Mode

The default provider should be `auto`.

In `auto`, Hunch tries providers in this order:

1. Local provider, if enabled and healthy.
2. Anthropic provider, if the configured API key environment variable is set.
3. A clear `HunchError` explaining both setup paths.

For a successful local run, Hunch may print a short status line:

```text
Using local model.
```

If local mode is configured but unavailable and Anthropic is available:

```text
Local model unavailable; falling back to Anthropic.
```

If the user forces local mode and local is unavailable, Hunch must not fall back.
It should fail with setup guidance.

### Commands

```sh
hunch local setup
hunch local status
hunch ask "tighten the copy"
hunch ask --local "tighten the copy"
hunch ask --cloud "make the workflow more specific"
hunch show
hunch show --local
hunch show --cloud
```

`hunch local setup` should create `~/.hunch/models/` and write local model
metadata. In v0.2, setup may avoid downloading a model unless a model URL is
configured; the command should still prepare directories and explain the exact
model path Hunch expects.

`hunch local status` should report:

- whether local mode is enabled
- expected model path
- whether the model file exists
- whether the local runtime dependency is available
- fallback provider availability

### Configuration

`~/.hunch/config.yaml` supports:

```yaml
provider: auto
fallback_provider: anthropic

local:
  enabled: true
  model_path: ~/.hunch/models/hunch-lite.gguf
  model_url: ""
  model: hunch-lite
```

Rules:

- `provider` accepts `auto`, `local`, and `anthropic`.
- Existing configs with `provider: anthropic` remain valid.
- `fallback_provider` accepts `anthropic`.
- `local.enabled` defaults to `true`.
- `local.model_path` defaults to `~/.hunch/models/hunch-lite.gguf`.
- `local.model_url` defaults to an empty string. Empty means setup does not
  download and instead prints manual placement instructions.
- `local.model` is a display/model identifier used in logs and local provider
  metadata.

## Architecture

### Provider Interfaces

Introduce an agent provider layer:

```ts
export type ProviderMode = "auto" | "local" | "anthropic";
export type ProviderName = "local" | "anthropic";

export interface AgentProviderClient {
  provider: ProviderName;
  model: string;
  messages: {
    create(params: AgentMessageCreateParams): Promise<AgentMessageResponse>;
  };
}

export interface ProviderResolution {
  client: AgentProviderClient;
  provider: ProviderName;
  fellBack: boolean;
  reason?: string;
}
```

The existing Anthropic client should be wrapped behind this shape. The agent loop
should depend on `AgentProviderClient`, not directly on the Anthropic SDK type.

### Local Provider

The local provider should use an optional runtime boundary:

- `src/agent/local.ts` owns local status and client creation.
- Dynamic import keeps `node-llama-cpp` optional for now.
- If the dependency or model file is missing, local provider creation returns a
  typed unavailable result.
- Tests inject fake local clients; they do not import or run `node-llama-cpp`.

The local client should support the same `messages.create` shape as the
Anthropic wrapper. Local responses can be adapted into the agent loop's existing
text/tool-use format. If the first v0.2 local implementation cannot support tool
use robustly, it should be limited to `show` text/seed generation and explicit
small-edit prompts until the tool path is reliable.

### Routing

`src/agent/provider-router.ts` should choose a provider for a command.

Inputs:

- loaded Hunch config
- environment
- requested mode from CLI flags
- optional injected clients for tests

Outputs:

- resolved client
- provider name
- fallback metadata

Routing behavior:

- `--local` forces local and disables fallback.
- `--cloud` forces Anthropic and disables local.
- no flag uses config `provider`.
- `provider: auto` tries local first, then Anthropic.
- `provider: local` tries local only.
- `provider: anthropic` uses Anthropic only.

### Command Integration

`hunch ask` should use the provider router before entering the agent loop.

`hunch show` should generate script, questions, and seed data using the same
resolved provider for all three requests. If local fails before any files are
written and fallback is allowed, it may retry the full show generation with
Anthropic.

`hunch new` can continue using Anthropic for initial full-prototype generation in
v0.2 unless local is explicitly healthy and local generation scope has been
implemented. This avoids making first-run quality depend on a tiny model.

## Error Handling

When no provider is available:

```text
No agent provider is available. Run `hunch local setup` or set ANTHROPIC_API_KEY.
```

When local is forced but unavailable:

```text
Local model unavailable: <reason>. Run `hunch local status`.
```

When local fails in auto mode and Anthropic is unavailable:

```text
Local model failed and Anthropic fallback is unavailable: <reason>.
```

## Security And Safety

Local setup must not execute project package scripts. Model downloads, if added,
must write only under `~/.hunch/models` and must validate that the final path is
inside that directory.

Provider routing must not pass cloud API keys to local model processes. Local
provider execution should receive a stripped environment if a child process is
introduced.

The v0.1 executable-surface protections remain in force:

- file tools block dependency/build directories
- file tools block package manifests, lockfiles, package-manager config, and
  Vite config files
- shell tool allows only `npm install --ignore-scripts`
- dev server runs Vite directly with stripped environment

## Testing

Add tests for:

- config parsing for `auto`, `local`, and fallback fields
- local model path default and `~` expansion
- local status when model exists/missing
- router local-first success
- router fallback to Anthropic
- router forced-local failure with no fallback
- ask command `--local` and `--cloud` flags
- show command provider resolution and fallback behavior
- local commands output

No test should download a model, import native inference code, or call Anthropic.

## Documentation

README should gain a Local Mode section:

- explain local-first fallback
- mark local mode experimental
- document setup/status commands
- document `--local` and `--cloud`
- explain that the npm package does not bundle a model yet

## v0.2 Decisions

- The npm package does not bundle a model.
- `hunch local setup` creates the model directory and, when `local.model_url` is
  empty, prints manual placement instructions instead of downloading.
- If `local.model_url` is configured, setup downloads that exact URL to
  `local.model_path` with an atomic temporary file and path-safety checks.
- The default model identifier is `hunch-lite`, but v0.2 does not endorse a
  specific public GGUF file yet.
- Local mode is wired through the same agent client interface as Anthropic. If
  the native runtime is unavailable, routing falls back cleanly in `auto` mode.
- Local tool-use quality is experimental. The code should support local clients
  returning tool-use-shaped responses, but README copy should describe local
  mode as best for lighter edits and interview/demo materials.
