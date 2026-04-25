import { mkdtemp, writeFile } from "node:fs/promises";
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

  it("allows npm run scripts", () => {
    expect(isAllowedShellCommand("npm run build")).toBe(true);
    expect(isAllowedShellCommand("npm run test:unit")).toBe(true);
  });

  it("allows selected shadcn add commands", () => {
    expect(isAllowedShellCommand("npx shadcn@latest add button")).toBe(true);
    expect(isAllowedShellCommand("npx shadcn add dialog")).toBe(true);
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

  it("runs allowlisted commands and returns trimmed output", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "hunch-shell-test-"));
    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify({
        scripts: {
          echo: "node -e \"console.log(' shell output ')\"",
        },
      }),
      "utf8",
    );

    await expect(runShellTool(cwd, { command: "npm run echo" })).resolves.toBe(
      "> echo\n> node -e \"console.log(' shell output ')\"\n\n shell output",
    );
  });

  it("rejects nonzero exits with command output", async () => {
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
      /Shell command failed with exit code 7[\s\S]*bad news/,
    );
  });
});
