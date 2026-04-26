import { describe, expect, it } from "vitest";

import { assertInside, createPathResolver } from "../../src/state/paths.js";

describe("assertInside", () => {
  it("allows descendants under the root", () => {
    expect(() => {
      assertInside("/repo/spikes", "/repo/spikes/2026-04-25-test");
    }).not.toThrow();
  });

  it("rejects traversal outside the root", () => {
    expect(() => {
      assertInside("/repo/spikes", "/repo/spikes/../outside");
    }).toThrow(/Path escapes/);
  });
});

describe("createPathResolver", () => {
  it("builds Hunch paths from the provided home and cwd", () => {
    const paths = createPathResolver({ homeDir: "/home/ram", cwd: "/repo/.." });

    expect(paths.hunchDir).toBe("/home/ram/.hunch");
    expect(paths.configPath).toBe("/home/ram/.hunch/config.yaml");
    expect(paths.activePath).toBe("/home/ram/.hunch/active");
    expect(paths.defaultSpikeDir).toBe("/home/ram/hunches");
    expect(paths.repoRoot).toBe("/");
  });
});
