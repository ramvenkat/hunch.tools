import { describe, expect, it } from "vitest";

import { parseSeedDataJson } from "../../src/tools/seed-data.js";

describe("parseSeedDataJson", () => {
  it("parses strict JSON seed data", () => {
    expect(
      parseSeedDataJson(
        JSON.stringify({
          items: [
            {
              title: "Welcome checklist",
              body: "Complete profile setup before inviting teammates.",
            },
          ],
        }),
      ),
    ).toEqual({
      items: [
        {
          title: "Welcome checklist",
          body: "Complete profile setup before inviting teammates.",
        },
      ],
    });
  });

  it("requires an items array", () => {
    expect(() => parseSeedDataJson("{}")).toThrow(
      "Seed data JSON must include an items array.",
    );
  });

  it("requires each item title and body to be strings", () => {
    expect(() =>
      parseSeedDataJson(
        JSON.stringify({
          items: [{ title: "Welcome checklist", body: 42 }],
        }),
      ),
    ).toThrow("Seed data item 0 must include string title and body.");
  });
});
