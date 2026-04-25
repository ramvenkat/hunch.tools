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

  it("rejects invalid JSON syntax", () => {
    expect(() => parseSeedDataJson("{")).toThrow("Invalid seed data JSON:");
  });

  it("requires each item title to be a string", () => {
    expect(() =>
      parseSeedDataJson(
        JSON.stringify({
          items: [{ title: 42, body: "Complete profile setup." }],
        }),
      ),
    ).toThrow("Seed data item 0 title must be a string.");
  });

  it("requires each item body to be a string", () => {
    expect(() =>
      parseSeedDataJson(
        JSON.stringify({
          items: [{ title: "Welcome checklist", body: 42 }],
        }),
      ),
    ).toThrow("Seed data item 0 body must be a string.");
  });
});
