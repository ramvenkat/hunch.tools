import { describe, expect, it } from "vitest";

import { buildCli } from "../src/cli.js";

describe("buildCli", () => {
  it("builds the hunch CLI with the list command", () => {
    const cli = buildCli();

    expect(cli.name()).toBe("hunch");
    expect(cli.commands.map((command) => command.name())).toContain("list");
  });
});
