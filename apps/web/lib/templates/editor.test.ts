import { describe, expect, it } from "vitest";

import type { EditorSection } from "@/lib/validators/template";

import {
  addedKey,
  canMove,
  itemNumber,
  keepsContainers,
  moved,
  roleLabel,
  selectionAfterRemove,
} from "./editor";

const section = (key: string, group: number): EditorSection => ({
  key,
  group,
  role: "other",
  label: key,
  removable: true,
  duplicable: false,
  number: null,
  title: "",
  fields: [],
  words: 0,
  images: 0,
});

// A header and footer in the page's body (group 0) around the main column (group 1).
const sections = [
  section("header", 0),
  section("hero", 1),
  section("reason", 1),
  section("offer", 1),
  section("footer", 0),
];
const keys = sections.map((s) => s.key);

describe("section editor helpers", () => {
  it("labels roles and pads item numbers", () => {
    expect(roleLabel("faq")).toBe("FAQ");
    expect(roleLabel("unknown")).toBe("Section");
    expect(itemNumber("3")).toBe("03");
    expect(itemNumber("12")).toBe("12");
  });

  it("only moves sections within their container", () => {
    expect(canMove(sections, 1, -1)).toBe(false); // hero can't go above the header
    expect(canMove(sections, 1, 1)).toBe(true);
    expect(canMove(sections, 3, 1)).toBe(false); // offer can't go below the footer
    expect(canMove(sections, 0, -1)).toBe(false);
    expect(moved(keys, 2, -1)).toEqual([
      "header",
      "reason",
      "hero",
      "offer",
      "footer",
    ]);
  });

  it("checks a dragged order keeps the containers in place", () => {
    expect(
      keepsContainers(sections, [
        "header",
        "offer",
        "hero",
        "reason",
        "footer",
      ]),
    ).toBe(true);
    expect(
      keepsContainers(sections, [
        "footer",
        "hero",
        "reason",
        "offer",
        "header",
      ]),
    ).toBe(true); // header and footer share a container, so they can swap
    expect(
      keepsContainers(sections, [
        "hero",
        "header",
        "reason",
        "offer",
        "footer",
      ]),
    ).toBe(false);
  });

  it("picks the next selection and finds a duplicate", () => {
    expect(selectionAfterRemove(keys, "hero")).toBe("reason");
    expect(selectionAfterRemove(keys, "footer")).toBe("offer");
    expect(selectionAfterRemove(["only"], "only")).toBeNull();
    expect(addedKey(keys, [...keys, "reason-2"])).toBe("reason-2");
    expect(addedKey(keys, keys)).toBeNull();
  });
});
