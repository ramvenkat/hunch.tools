import { describe, expect, it } from "vitest";

import { loadPrompt, renderTemplate } from "../../src/agent/prompts.js";

describe("renderTemplate", () => {
  it("replaces matching template tokens with values", () => {
    expect(
      renderTemplate("Problem: {{problem}}\nPersona: {{persona}}", {
        problem: "Dropoff",
        persona: "PM",
      }),
    ).toBe("Problem: Dropoff\nPersona: PM");
  });

  it("renders missing values as empty strings", () => {
    expect(renderTemplate("Problem: {{problem}}\nJourney: {{journey}}", {
      problem: "Dropoff",
    })).toBe("Problem: Dropoff\nJourney: ");
  });
});

describe("loadPrompt", () => {
  it("loads and renders a prompt markdown file", async () => {
    await expect(
      loadPrompt("seed-data", {
        problem: "Dropoff",
        persona: "PM",
        journey: "Onboarding",
      }),
    ).resolves.toContain("Problem: Dropoff");
  });
});
