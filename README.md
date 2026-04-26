# Hunch

Hunch is a local CLI for PMs who code. Give it a customer problem, a persona,
and one target user action; it turns that into a disposable React prototype you
can learn from quickly.

The loop is intentionally small:

```sh
hunch new
hunch run
hunch ask "make the cards more specific to the persona"
hunch decide
hunch show
```

## Why

Product ideas often get clearer only after someone can click through them.
Hunch helps you turn a hunch into a working spike, keep the prototype grounded
in the customer journey, and capture the UX decisions the agent makes along the
way.

It is built for throwaway learning, not production code generation.

## Install

```sh
npm install -g hunch-cli
export ANTHROPIC_API_KEY=sk-ant-...
```

Hunch requires Node 20 or newer.

## Quickstart

Create a spike:

```sh
hunch new
```

Hunch asks for:

- the customer problem
- the persona
- the one thing the user should do in the prototype

It creates a dated spike under `~/hunches`, copies in a Vite app, installs
dependencies, and, when `ANTHROPIC_API_KEY` is set, asks the agent to shape the
first clickable prototype.

Run it:

```sh
hunch run
```

Iterate with the agent:

```sh
hunch ask "make the onboarding path shorter and more concrete"
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

## Commands

### `hunch new`

Starts a new spike from a customer problem, persona, and journey. The active
spike is updated after setup succeeds.

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

### `hunch list` and `hunch open`

List existing spikes and switch the active spike:

```sh
hunch list
hunch open 2026-04-25-first-prompt-aha
```

## State

Global Hunch state lives in:

```text
~/.hunch
```

Spikes live in:

```text
~/hunches
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

You can customize defaults in `~/.hunch/config.yaml`:

```yaml
model: claude-3-5-sonnet-latest
api_key_env: ANTHROPIC_API_KEY
spike_dir: ~/hunches
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

- Anthropic is the only supported model provider.
- Spikes are local directories; there is no cloud sync or team workflow yet.
- The generated app template is intentionally small.
- Live `ask` and `show` flows require `ANTHROPIC_API_KEY`.

## License

MIT. See [LICENSE](LICENSE).
