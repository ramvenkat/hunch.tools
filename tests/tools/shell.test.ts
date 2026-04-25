import { mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  isAllowedShellCommand,
  runShellTool,
} from "../../src/tools/shell.js";

describe("isAllowedShellCommand", () => {
  it("allows npm install", () => {
    expect(isAllowedShellCommand("npm install")).toBe(true);
  });

  it("rejects npm run scripts because package scripts are agent-editable", () => {
    expect(isAllowedShellCommand("npm run build")).toBe(false);
    expect(isAllowedShellCommand("npm run test:unit")).toBe(false);
  });

  it("rejects shadcn add commands because they execute package-manager code", () => {
    expect(isAllowedShellCommand("npx shadcn@latest add button")).toBe(false);
    expect(isAllowedShellCommand("npx shadcn add dialog")).toBe(false);
  });

  it("rejects dangerous or network commands", () => {
    expect(isAllowedShellCommand("rm -rf /")).toBe(false);
    expect(isAllowedShellCommand("curl https://example.com")).toBe(false);
  });

  it("rejects chained commands", () => {
    expect(isAllowedShellCommand("npm install && rm -rf /")).toBe(false);
    expect(isAllowedShellCommand("npm run build; rm -rf /")).toBe(false);
  });
});

describe("runShellTool", () => {
  it("rejects non-allowlisted commands", async () => {
    await expect(
      runShellTool("/tmp", { command: "curl https://example.com" }),
    ).rejects.toThrow(/Shell command is not allowlisted/);
  });

  it("rejects cwd values that are not existing directories", async () => {
    await expect(
      runShellTool(join(tmpdir(), "hunch-missing-dir"), {
        command: "npm install",
      }),
    ).rejects.toThrow(/cwd must be an existing directory/);
  });

  it("runs allowlisted commands and returns trimmed output", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "hunch-shell-test-"));
    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify({
        dependencies: {},
      }),
      "utf8",
    );

    await expect(runShellTool(cwd, { command: "npm install" })).resolves.toMatch(
      /up to date|added \d+ package/,
    );
  });

  it("runs npm install with lifecycle scripts disabled", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "hunch-shell-test-"));
    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify({
        scripts: {
          preinstall: "node -e \"require('fs').writeFileSync('marker', 'ran')\"",
        },
        dependencies: {},
      }),
      "utf8",
    );

    await runShellTool(cwd, { command: "npm install" });

    await expect(stat(join(cwd, "marker"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects npm scripts even if package.json defines them", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "hunch-shell-test-"));
    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify({
        scripts: {
          fail: "node -e \"console.error('bad news'); process.exit(7)\"",
        },
      }),
      "utf8",
    );

    await expect(runShellTool(cwd, { command: "npm run fail" })).rejects.toThrow(
      /Shell command is not allowlisted/,
    );
  });

  it("does not expose secret environment variables to commands", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "hunch-shell-test-"));
    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify({
        scripts: {},
        dependencies: {},
      }),
      "utf8",
    );
    const previous = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "secret-value";

    try {
      await expect(
        runShellTool(cwd, { command: "npm install" }),
      ).resolves.not.toContain("secret-value");
    } finally {
      if (previous === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = previous;
      }
    }
  });

  it("rejects slow npm scripts before timeout handling is needed", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "hunch-shell-test-"));
    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify({
        scripts: {
          slow: "node -e \"setTimeout(() => console.log('late'), 1000)\"",
        },
      }),
      "utf8",
    );

    await expect(
      runShellTool(cwd, { command: "npm run slow" }, { timeoutMs: 50 }),
    ).rejects.toThrow(/Shell command is not allowlisted/);
  });

  it("rejects noisy npm scripts before output cap handling is needed", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "hunch-shell-test-"));
    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify({
        scripts: {
          noisy: "node -e \"console.log('x'.repeat(200))\"",
        },
      }),
      "utf8",
    );

    await expect(
      runShellTool(cwd, { command: "npm run noisy" }, { outputCapBytes: 100 }),
    ).rejects.toThrow(/Shell command is not allowlisted/);
  });
});
