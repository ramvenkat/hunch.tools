# Hunch

A CLI for PMs who code. Give it a customer problem; get a disposable prototype for learning fast.

## Install

```sh
npm install -g hunch-cli
export ANTHROPIC_API_KEY=sk-ant-...
```

## Use

```sh
hunch new
hunch run
hunch ask "make the cards more specific to the persona"
hunch decide
hunch show
```

## Local Development

```sh
npm install
npm run typecheck
npm test
npm run build
```

## State

Hunch stores global state in `~/.hunch`. Spikes are created in `~/hunches` by default, and each spike contains `.hunch/` agent state plus `app/` Vite code.
