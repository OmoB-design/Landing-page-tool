import { describe, expect, it } from "vitest";

import { dialDefaults } from "./dial";

describe("dial defaults (production)", () => {
  it("gives each dial its default, as DialKit does", () => {
    const spring = {
      type: "spring" as const,
      visualDuration: 0.5,
      bounce: 0.2,
    };
    expect(
      dialDefaults({
        size: [280, 120, 480, 4],
        play: true,
        label: "Hi",
        figure: { type: "select", options: ["assemble", "terminal"] },
        mode: { type: "select", options: ["a", "b"], default: "b" },
        tint: { type: "color" },
        note: { type: "text" },
        replay: { type: "action" },
        rise: spring,
        nested: {
          _collapsed: true,
          gap: [18, 0, 80, 1],
          deeper: { on: false },
        },
      }),
    ).toEqual({
      size: 280,
      play: true,
      label: "Hi",
      figure: "assemble",
      mode: "b",
      tint: "#000000",
      note: "",
      replay: { type: "action" },
      rise: spring,
      nested: { gap: 18, deeper: { on: false } },
    });
  });
});
