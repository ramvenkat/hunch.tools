import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createSpike } from "../../src/commands/new.js";

const originalPath = process.env.PATH;

afterEach(() => {
  process.env.PATH = originalPath;
});

async function makeHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), "hunch-create-spike-test-"));
}

describe("createSpike", () => {
  it("creates a deterministic spike from the packaged app template", async () => {
    const homeDir = await makeHome();
    const problem =
      "Users do not get a first prompt aha when they open the product.";
    const persona = "Busy PMs who code.";
    const journey = "Draft a first useful prompt.";

    const spike = await createSpike(
      { problem, persona, journey, slug: "first-prompt-aha" },
      {
        homeDir,
        cwd: process.cwd(),
        install: false,
        generate: false,
        date: new Date("2026-04-25T12:00:00Z"),
      },
    );

    expect(spike.name).toBe("2026-04-25-first-prompt-aha");
    await expect(
      readFile(join(spike.hunchDir, "problem.md"), "utf8"),
    ).resolves.toBe(`${problem}\n`);
    await expect(
      readFile(join(spike.appDir, "package.json"), "utf8"),
    ).resolves.toContain('"name": "hunch-spike-app"');
  });

  it("does not leave a final spike or active marker when install fails", async () => {
    const homeDir = await makeHome();
    const fakeBin = await mkdtemp(join(tmpdir(), "hunch-fake-bin-"));
    const fakeNpm = join(fakeBin, "npm");
    await writeFile(fakeNpm, "#!/bin/sh\nexit 42\n", "utf8");
    await chmod(fakeNpm, 0o755);
    process.env.PATH = `${fakeBin}:${originalPath ?? ""}`;

    await expect(
      createSpike(
        {
          problem: "Users need a safer first run.",
          persona: "PMs.",
          journey: "Open the prototype.",
          slug: "install-fails",
        },
        {
          homeDir,
          cwd: process.cwd(),
          install: true,
          generate: false,
          date: new Date("2026-04-25T12:00:00Z"),
        },
      ),
    ).rejects.toThrow("npm install failed with exit code 42.");

    await expect(
      stat(join(homeDir, "hunches", "2026-04-25-install-fails")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(join(homeDir, ".hunch", "active"), "utf8")).rejects
      .toMatchObject({ code: "ENOENT" });
  });

  it("times out install without leaving a final spike", async () => {
    const homeDir = await makeHome();
    const fakeBin = await mkdtemp(join(tmpdir(), "hunch-fake-bin-"));
    const fakeNpm = join(fakeBin, "npm");
    await writeFile(fakeNpm, "#!/bin/sh\nsleep 5\n", "utf8");
    await chmod(fakeNpm, 0o755);
    process.env.PATH = `${fakeBin}:${originalPath ?? ""}`;

    await expect(
      createSpike(
        {
          problem: "Users need setup to fail safely.",
          persona: "PMs.",
          journey: "Open the prototype.",
          slug: "install-timeout",
        },
        {
          homeDir,
          cwd: process.cwd(),
          install: true,
          generate: false,
          installTimeoutMs: 20,
          date: new Date("2026-04-25T12:00:00Z"),
        },
      ),
    ).rejects.toThrow("npm install timed out after 20ms.");

    await expect(
      stat(join(homeDir, "hunches", "2026-04-25-install-timeout")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("wraps npm spawn errors without leaving a final spike", async () => {
    const homeDir = await makeHome();
    const emptyBin = await mkdtemp(join(tmpdir(), "hunch-empty-bin-"));
    process.env.PATH = emptyBin;

    await expect(
      createSpike(
        {
          problem: "Users need missing tooling to fail clearly.",
          persona: "PMs.",
          journey: "Open the prototype.",
          slug: "missing-npm",
        },
        {
          homeDir,
          cwd: process.cwd(),
          install: true,
          generate: false,
          date: new Date("2026-04-25T12:00:00Z"),
        },
      ),
    ).rejects.toThrow("Failed to run npm install:");

    await expect(
      stat(join(homeDir, "hunches", "2026-04-25-missing-npm")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("fails clearly before staging when the final spike already exists", async () => {
    const homeDir = await makeHome();
    const spikeDir = join(homeDir, "hunches");
    await mkdir(join(spikeDir, "2026-04-25-existing"), { recursive: true });

    await expect(
      createSpike(
        {
          problem: "Users need duplicate names to fail clearly.",
          persona: "PMs.",
          journey: "Open the prototype.",
          slug: "existing",
        },
        {
          homeDir,
          cwd: process.cwd(),
          install: false,
          generate: false,
          date: new Date("2026-04-25T12:00:00Z"),
        },
      ),
    ).rejects.toThrow("Spike already exists: 2026-04-25-existing");

    await expect(readdir(spikeDir)).resolves.toEqual([
      "2026-04-25-existing",
    ]);
  });
});
