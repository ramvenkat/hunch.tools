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

  it("replaces repeated tokens", () => {
    expect(
      renderTemplate("{{persona}} sees what {{persona}} needs", {
        persona: "PM",
      }),
    ).toBe("PM sees what PM needs");
  });

  it("renders unknown tokens empty and leaves unmatched braces unchanged", () => {
    expect(
      renderTemplate("Known: {{known}}\nUnknown: {{unknown}}\nOpen: {{known", {
        known: "yes",
      }),
    ).toBe("Known: yes\nUnknown: \nOpen: {{known");
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

  it("rejects prompt names with path segments", async () => {
    await expect(loadPrompt("../main", {})).rejects.toThrow(
      "Invalid prompt name: ../main",
    );
  });
});
