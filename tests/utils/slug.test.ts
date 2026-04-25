import { describe, expect, it } from "vitest";

import { slugifyProblem } from "../../src/utils/slug.js";

describe("slugifyProblem", () => {
  it("builds a five-word slug without stop words or apostrophes", () => {
    expect(slugifyProblem("First-time users don't know what to type!")).toBe(
      "first-time-users-dont-know",
    );
  });

  it("falls back when no slug words remain", () => {
    expect(slugifyProblem("!!!")).toBe("untitled-spike");
  });
});
