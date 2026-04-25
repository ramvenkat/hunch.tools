import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { loadSpikeContext } from "../../src/agent/context.js";
import type { SpikeRef } from "../../src/state/spike.js";

async function makeSpike(): Promise<SpikeRef> {
  const dir = await mkdtemp(join(tmpdir(), "hunch-context-test-"));
  const hunchDir = join(dir, ".hunch");
  const appDir = join(dir, "app");

  await mkdir(join(hunchDir), { recursive: true });
  await mkdir(join(appDir, "src"), { recursive: true });
  await mkdir(join(appDir, "src", "components"), { recursive: true });
  await mkdir(join(appDir, "src", "components", "deep"), { recursive: true });
  await mkdir(join(appDir, "node_modules", "pkg"), { recursive: true });
  await mkdir(join(appDir, "dist"), { recursive: true });
  await writeFile(join(hunchDir, "problem.md"), " Problem statement \n", "utf8");
  await writeFile(join(hunchDir, "persona.md"), "\n Product manager \n", "utf8");
  await writeFile(join(hunchDir, "journey.md"), " Journey notes\n\n", "utf8");
  await writeFile(join(hunchDir, "decisions.md"), " Decision log \n", "utf8");
  await writeFile(join(appDir, "src", "App.tsx"), "export function App() {}\n");
  await writeFile(
    join(appDir, "src", "components", "Button.tsx"),
    "export function Button() {}\n",
  );
  await writeFile(join(appDir, "src", "components", "deep", "Ignored.tsx"), "");
  await writeFile(join(appDir, "node_modules", "pkg", "index.js"), "");
  await writeFile(join(appDir, "dist", "bundle.js"), "");
  await symlink(join(appDir, "src"), join(appDir, "linked-src"));

  return {
    name: "2026-04-25-test",
    dir,
    appDir,
    hunchDir,
  };
}

describe("loadSpikeContext", () => {
  it("loads trimmed spike notes and a shallow app file tree", async () => {
    const context = await loadSpikeContext(await makeSpike());

    expect(context.problem).toBe("Problem statement");
    expect(context.persona).toBe("Product manager");
    expect(context.journey).toBe("Journey notes");
    expect(context.decisions).toBe("Decision log");
    expect(context.fileTree).toContain("src/");
    expect(context.fileTree).toContain("src/App.tsx");
    expect(context.fileTree).toContain("src/components/");
    expect(context.fileTree).toContain("src/components/Button.tsx");
    expect(context.fileTree).not.toContain("src/components/deep/Ignored.tsx");
    expect(context.fileTree).not.toContain("linked-src");
    expect(context.fileTree).not.toContain("node_modules");
    expect(context.fileTree).not.toContain("dist");
  });

  it("wraps missing required context files with the file path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hunch-context-missing-test-"));
    const hunchDir = join(dir, ".hunch");
    const appDir = join(dir, "app");
    await mkdir(hunchDir, { recursive: true });
    await mkdir(appDir, { recursive: true });

    await expect(
      loadSpikeContext({
        name: "2026-04-25-test",
        dir,
        appDir,
        hunchDir,
      }),
    ).rejects.toThrow(
      `Missing required spike context file: ${join(hunchDir, "problem.md")}`,
    );
  });

  it("returns an empty file tree when the app directory is missing", async () => {
    const spike = await makeSpike();

    await expect(
      loadSpikeContext({
        ...spike,
        appDir: join(spike.dir, "missing-app"),
      }),
    ).resolves.toMatchObject({ fileTree: "" });
  });
});
