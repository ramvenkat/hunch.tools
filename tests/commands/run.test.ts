import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import open from "open";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runCommand, startDevServer } from "../../src/commands/run.js";
import { HunchError } from "../../src/utils/errors.js";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

vi.mock("open", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

const spinner = {
  start: vi.fn(),
  succeed: vi.fn(),
  fail: vi.fn(),
  warn: vi.fn(),
};

vi.mock("ora", () => ({
  default: vi.fn(() => spinner),
}));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  spinner.start.mockReturnValue(spinner);
});

describe("runCommand", () => {
  it("starts the active spike dev server and opens Vite when ready", async () => {
    spinner.start.mockReturnValue(spinner);
    const homeDir = await makeHome();
    const spikeDir = join(homeDir, "spikes");
    const appDir = join(spikeDir, "2026-04-25-run", "app");
    await writeConfig(homeDir, spikeDir);
    await mkdir(appDir, { recursive: true });
    await writeFile(join(homeDir, ".hunch", "active"), "2026-04-25-run\n");
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const sigintListeners = process.listenerCount("SIGINT");

    const running = runCommand({ homeDir, cwd: "/repo", demo: true });
    await vi.waitFor(() => expect(spawn).toHaveBeenCalled());
    child.stdout.emit("data", Buffer.from("Local: http://127.0.0.1:5173/\n"));
    child.emit("exit", 0);
    await running;

    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      [
        join(appDir, "node_modules", "vite", "bin", "vite.js"),
        "--host",
        "127.0.0.1",
      ],
      expect.objectContaining({
        cwd: appDir,
        env: expect.objectContaining({ VITE_HUNCH_DEMO: "1" }),
        stdio: ["inherit", "pipe", "pipe"],
      }),
    );
    expect(open).toHaveBeenCalledWith("http://127.0.0.1:5173");
    expect(spinner.succeed).toHaveBeenCalledWith(
      "Vite running at http://127.0.0.1:5173",
    );
    expect(process.listenerCount("SIGINT")).toBe(sigintListeners);
  });

  it("wraps spawn errors in HunchError", async () => {
    spinner.start.mockReturnValue(spinner);
    const homeDir = await makeHome();
    const spikeDir = join(homeDir, "spikes");
    const appDir = join(spikeDir, "2026-04-25-run", "app");
    await writeConfig(homeDir, spikeDir);
    await mkdir(appDir, { recursive: true });
    await writeFile(join(homeDir, ".hunch", "active"), "2026-04-25-run\n");
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child);
    const sigintListeners = process.listenerCount("SIGINT");

    const running = runCommand({ homeDir, cwd: "/repo" });
    await vi.waitFor(() => expect(spawn).toHaveBeenCalled());
    child.emit("error", new Error("vite missing"));

    await expect(running).rejects.toEqual(
      new HunchError("Failed to start dev server: vite missing"),
    );
    expect(spinner.fail).toHaveBeenCalledWith("Failed to start dev server.");
    expect(process.listenerCount("SIGINT")).toBe(sigintListeners);
  });

  it("forwards SIGINT and rejects with exit code 130 when interrupted", async () => {
    spinner.start.mockReturnValue(spinner);
    const { child, homeDir } = await setupActiveRun();
    const sigintListeners = process.listenerCount("SIGINT");

    const running = runCommand({ homeDir, cwd: "/repo" });
    await vi.waitFor(() => expect(spawn).toHaveBeenCalled());
    const interruption = expect(running).rejects.toEqual(
      new HunchError("Interrupted.", 130),
    );
    process.emit("SIGINT");
    child.emit("exit", null, "SIGINT");

    await interruption;
    expect(child.kill).toHaveBeenCalledWith("SIGINT");
    expect(process.listenerCount("SIGINT")).toBe(sigintListeners);
  });

  it("force kills and rejects with exit code 130 when child ignores SIGINT", async () => {
    vi.useFakeTimers();
    spinner.start.mockReturnValue(spinner);
    const { child, homeDir } = await setupActiveRun();
    const sigintListeners = process.listenerCount("SIGINT");

    const running = runCommand({ homeDir, cwd: "/repo", sigintGraceMs: 10 });
    await vi.waitFor(() => expect(spawn).toHaveBeenCalled());
    const interruption = expect(running).rejects.toEqual(
      new HunchError("Interrupted.", 130),
    );
    process.emit("SIGINT");
    await vi.advanceTimersByTimeAsync(10);

    await interruption;
    expect(child.kill).toHaveBeenCalledWith("SIGINT");
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    expect(process.listenerCount("SIGINT")).toBe(sigintListeners);
  });

  it("force kills and rejects with exit code 130 on repeated SIGINT", async () => {
    spinner.start.mockReturnValue(spinner);
    const { child, homeDir } = await setupActiveRun();
    const sigintListeners = process.listenerCount("SIGINT");

    const running = runCommand({ homeDir, cwd: "/repo" });
    await vi.waitFor(() => expect(spawn).toHaveBeenCalled());
    const interruption = expect(running).rejects.toEqual(
      new HunchError("Interrupted.", 130),
    );
    process.emit("SIGINT");
    process.emit("SIGINT");

    await interruption;
    expect(child.kill).toHaveBeenCalledWith("SIGINT");
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    expect(process.listenerCount("SIGINT")).toBe(sigintListeners);
  });

  it("rejects when the child exits non-zero", async () => {
    spinner.start.mockReturnValue(spinner);
    const { child, homeDir } = await setupActiveRun();

    const running = runCommand({ homeDir, cwd: "/repo" });
    await vi.waitFor(() => expect(spawn).toHaveBeenCalled());
    child.emit("exit", 2, null);

    await expect(running).rejects.toEqual(
      new HunchError("Dev server exited with code 2."),
    );
  });

  it("rejects when the child exits with a non-SIGINT signal", async () => {
    spinner.start.mockReturnValue(spinner);
    const { child, homeDir } = await setupActiveRun();

    const running = runCommand({ homeDir, cwd: "/repo" });
    await vi.waitFor(() => expect(spawn).toHaveBeenCalled());
    child.emit("exit", null, "SIGTERM");

    await expect(running).rejects.toEqual(
      new HunchError("Dev server exited with signal SIGTERM."),
    );
  });

  it("warns without crashing when opening the browser fails", async () => {
    spinner.start.mockReturnValue(spinner);
    vi.mocked(open).mockRejectedValueOnce(new Error("no browser"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { child, homeDir } = await setupActiveRun();

    const running = runCommand({ homeDir, cwd: "/repo" });
    await vi.waitFor(() => expect(spawn).toHaveBeenCalled());
    child.stdout.emit("data", Buffer.from("http://127.0.0.1:5173\n"));
    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("no browser")),
    );
    child.emit("exit", 0, null);

    await expect(running).resolves.toBeUndefined();
  });

  it("passes stderr through and opens only once", async () => {
    spinner.start.mockReturnValue(spinner);
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const { child, homeDir } = await setupActiveRun();

    const running = runCommand({ homeDir, cwd: "/repo" });
    await vi.waitFor(() => expect(spawn).toHaveBeenCalled());
    child.stderr.emit("data", Buffer.from("vite warning\n"));
    child.stdout.emit("data", Buffer.from("http://127.0.0.1:5173\n"));
    child.stdout.emit("data", Buffer.from("http://127.0.0.1:5174\n"));
    child.emit("exit", 0, null);
    await running;

    expect(stderr).toHaveBeenCalledWith(Buffer.from("vite warning\n"));
    expect(stdout).toHaveBeenCalledWith("http://127.0.0.1:5173\n");
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith("http://127.0.0.1:5173");
  });

  it("strips secrets from the dev server environment", async () => {
    spinner.start.mockReturnValue(spinner);
    const previous = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "secret-value";
    const { child, homeDir } = await setupActiveRun();

    try {
      const running = runCommand({ homeDir, cwd: "/repo" });
      await vi.waitFor(() => expect(spawn).toHaveBeenCalled());
      child.emit("exit", 0, null);
      await running;
    } finally {
      if (previous === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = previous;
      }
    }

    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({
        env: expect.not.objectContaining({
          ANTHROPIC_API_KEY: "secret-value",
        }),
      }),
    );
  });
});

describe("startDevServer", () => {
  it("returns a handle that stops the child server and resolves the wait", async () => {
    spinner.start.mockReturnValue(spinner);
    const { child, homeDir } = await setupActiveRun();

    const server = await startDevServer({ homeDir, cwd: "/repo", demo: true });
    const waiting = server.wait;

    server.stop();
    child.emit("exit", null, "SIGINT");

    await expect(waiting).resolves.toBeUndefined();
    expect(child.kill).toHaveBeenCalledWith("SIGINT");
  });
});

async function makeHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), "hunch-run-test-"));
}

async function writeConfig(homeDir: string, spikeDir: string): Promise<void> {
  await mkdir(join(homeDir, ".hunch"), { recursive: true });
  await writeFile(
    join(homeDir, ".hunch", "config.yaml"),
    `spike_dir: ${spikeDir}\n`,
  );
}

function makeChild(): EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
} {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

async function setupActiveRun(): Promise<{
  child: ReturnType<typeof makeChild>;
  homeDir: string;
  spikeDir: string;
  appDir: string;
}> {
  const homeDir = await makeHome();
  const spikeDir = join(homeDir, "spikes");
  const appDir = join(spikeDir, "2026-04-25-run", "app");
  await writeConfig(homeDir, spikeDir);
  await mkdir(appDir, { recursive: true });
  await writeFile(join(homeDir, ".hunch", "active"), "2026-04-25-run\n");
  const child = makeChild();
  vi.mocked(spawn).mockReturnValue(child);

  return { child, homeDir, spikeDir, appDir };
}
