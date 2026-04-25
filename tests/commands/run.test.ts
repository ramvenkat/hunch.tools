import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import open from "open";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runCommand } from "../../src/commands/run.js";
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
      "npm",
      ["run", "dev", "--", "--host", "127.0.0.1"],
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
    child.emit("error", new Error("npm missing"));

    await expect(running).rejects.toEqual(
      new HunchError("Failed to start dev server: npm missing"),
    );
    expect(spinner.fail).toHaveBeenCalledWith("Failed to start dev server.");
    expect(process.listenerCount("SIGINT")).toBe(sigintListeners);
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
