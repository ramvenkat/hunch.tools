import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createSpike } from "../../src/commands/new.js";

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
});
