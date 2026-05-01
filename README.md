# Hunch

Hunch is a local-first CLI for PMs who code. Give it a customer problem, a
persona, and one target user action; it turns that into a disposable React
prototype you can click through, critique, and bring into a customer
conversation.

It is built for fast product learning, not production code generation.

```sh
hunch new
hunch run
hunch ask "make the onboarding path shorter and more concrete"
hunch status
hunch doctor
hunch save onboarding-spike
hunch decide
hunch show
```

## Why Hunch Exists

Product ideas often get clearer only after someone can interact with them.
Hunch gives you a small loop for turning a fuzzy opportunity into a working
spike:

- capture the customer problem, persona, and journey
- generate a first clickable prototype
- iterate with an agent scoped to that spike
- record UX decisions as the prototype changes
- prepare a walkthrough, interview questions, and demo data

The differentiator is the local-first provider path. Hunch can run with a tiny
local GGUF model when configured, then fall back to Anthropic or OpenAI when
local inference is unavailable or you explicitly ask for cloud.

## Install

```sh
npm install -g hunch-cli
```

Hunch requires Node 20 or newer.

For cloud fallback, set an Anthropic or OpenAI API key:

```sh
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
```

For local inference, place a GGUF model at the configured local model path or
configure a model URL and run:

```sh
hunch local setup
```

## Quickstart

Create a spike:

```sh
hunch new
```

Hunch asks for:

- the customer problem
- the persona
- the one thing the user should do in the prototype

It creates a dated spike under `~/hunches`, copies in a Vite app, installs app
dependencies, and asks the agent to shape the first clickable version when a
provider is available.

Run the active spike:

```sh
hunch run
```

Iterate:

```sh
hunch ask "make the pricing comparison easier to scan"
```

Check whether the active spike is healthy:

```sh
hunch status
hunch doctor
```

Save a prototype you want to keep:

```sh
hunch save pricing-comparison-v1
```

Review UX decisions:

```sh
hunch decide
```

Prepare for a customer conversation:

```sh
hunch show
```

`show` generates a walkthrough script, interview questions, demo seed data, and
starts the prototype in demo mode.

## Provider Modes

Hunch supports three provider modes:

- `auto`: use local when the configured GGUF model is installed, otherwise use
  the configured cloud fallback.
- `local`: require the local model.
- `anthropic`: always use Anthropic.
- `openai`: always use OpenAI.

The default is `auto`.

You can force a provider per command:

```sh
hunch ask --local "tighten the empty state"
hunch ask --cloud "use the cloud model for this harder edit"
hunch ask --openai "use my OpenAI credits for this edit"
hunch ask --anthropic "use Anthropic for this edit"
hunch new --openai
hunch show --local
hunch show --cloud
hunch show --openai
hunch show --anthropic
```

Check local readiness:

```sh
hunch local status
```

Install the configured local model:

```sh
hunch local setup
```

The local runtime uses `node-llama-cpp`, installed as an optional dependency.
That keeps normal installs usable on machines that cannot run local inference,
while still making the local path available where it works.

## Commands

### `hunch new`

Starts a new spike from a customer problem, persona, and journey. The active
spike is updated after setup succeeds.

Use `--openai`, `--anthropic`, `--cloud`, or `--local` to choose the provider
for initial prototype generation.

### `hunch run`

Runs the active spike locally and opens the browser. Use `--demo` to enable demo
mode:

```sh
hunch run --demo
```

### `hunch ask [message]`

Sends a request to the active spike agent. The agent can read and edit prototype
source files, log decisions, generate seed data, and run a narrow install
command.

Use `--verbose` to print tool activity.

Use `--repair` when a generation left the app broken and you want a constrained
fix instead of another creative redesign:

```sh
hunch ask --repair "fix the build error in App.tsx"
```

Repair mode tells the agent to focus on malformed files, truncated output, build
errors, and runtime blockers.

### `hunch status`

Shows the active spike name, paths, whether key generated files are present, the
last recorded agent activity, and the next useful command.

```sh
hunch status
```

### `hunch doctor`

Checks the active spike and local environment:

- active spike selection
- OpenAI and Anthropic API key presence, without printing secrets
- local model readiness
- active app build health

```sh
hunch doctor
hunch doc
```

### `hunch save [name]`

Copies the active spike into a durable folder under `~/hunch-saves`, excluding
generated dependency/build folders such as `node_modules` and `dist`. The save
also includes a `SAVED.md` summary with the original problem, persona, journey,
decisions, and run instructions.

```sh
hunch save infusion-scheduler-v1
hunch save infusion-scheduler-v1 --force
hunch save infusion-scheduler-v1 --to ~/Desktop/hunch-keepers
```

### `hunch decide`

Reviews pending UX decisions from `.hunch/decisions.md`. You can approve,
remove, supersede, skip, or push back on a decision. Pushback re-enters the
agent with the selected decision and your note as context.

### `hunch show`

Prepares the active spike for a customer interview:

- writes `.hunch/show/script.md`
- writes `.hunch/show/questions.md`
- writes `app/src/seed-data.json`
- starts the demo server
- waits for Return before stopping the server

### `hunch local`

Checks and installs the configured local model:

```sh
hunch local status
hunch local setup
```

`setup` downloads `local.model_url` to `local.model_path` when a model URL is
configured. If no URL is configured, place a GGUF model at the configured path.

### `hunch list` and `hunch open`

List existing spikes and switch the active spike:

```sh
hunch list
hunch open 2026-04-25-first-prompt-aha
```

## Configuration

Global Hunch state lives in:

```text
~/.hunch
```

Spikes live in:

```text
~/hunches
```

Customize defaults in `~/.hunch/config.yaml`:

```yaml
provider: auto
fallback_provider: anthropic
model: claude-sonnet-4-6
api_key_env: ANTHROPIC_API_KEY
spike_dir: ~/hunches
local:
  enabled: true
  model_path: ~/.hunch/models/hunch-lite.gguf
  model: hunch-lite
openai:
  model: gpt-5.4-mini
  api_key_env: OPENAI_API_KEY
```

Each spike looks roughly like this:

```text
2026-04-25-example/
  README.md
  app/
    src/
    package.json
  .hunch/
    problem.md
    persona.md
    journey.md
    decisions.md
    session.jsonl
    show/
```

## Safety Model

Hunch treats generated prototypes as local, disposable workspaces. The agent is
scoped to the active spike and cannot use absolute paths or path traversal.

The file tools block generated or executable package surfaces such as:

- `node_modules`
- `dist`
- package manifests and lockfiles
- Vite config files

Shell access is intentionally narrow. The agent shell tool only allows
`npm install`, and Hunch runs it internally as:

```sh
npm install --ignore-scripts
```

`hunch run` and `hunch show` start Vite directly with a stripped environment
rather than executing package scripts from the generated app.

## Local Development

```sh
npm install
npm run typecheck
npm test
npm run build
```

Package smoke:

```sh
npm pack --dry-run
```

If your local npm cache has permission problems, use a temporary cache:

```sh
npm_config_cache=/tmp/hunch-npm-cache npm pack --dry-run
```

## Current Limits

- Local inference requires a GGUF model file and a machine that can run
  `node-llama-cpp`.
- Anthropic and OpenAI are the supported cloud providers.
- Spikes are local directories; there is no cloud sync or team workflow yet.
- The generated app template is intentionally small.
- Live cloud fallback requires `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`,
  depending on the selected provider.

## License

MIT. See [LICENSE](LICENSE).
