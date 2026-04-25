import { afterEach, describe, expect, it, vi } from "vitest";

import { buildCli, runCli } from "../src/cli.js";

const originalExitCode = process.exitCode;

afterEach(() => {
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

describe("buildCli", () => {
  it("builds the hunch CLI with the list command", () => {
    const cli = buildCli();

    expect(cli.name()).toBe("hunch");
    expect(cli.commands.map((command) => command.name())).toContain("list");
  });
});

describe("runCli", () => {
  it("prints HunchError messages without throwing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      runCli(["node", "hunch", "open", "missing"]),
    ).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("Spike not found: missing"),
    );
    expect(process.exitCode).toBe(1);
  });
});
