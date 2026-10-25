import { describe, expect, it } from "vitest";

import { groupParagraphs, pickDesk, wizardChoices } from "@/lib/builds/desk";
import type { DeskState } from "@/lib/validators/desk";

function desk(version: number, status = "needs_review", id = "b1"): DeskState {
  return {
    build: {
      id,
      status,
      page_version: version,
      approved_at: null,
      approved_by: null,
    },
    fragments: [],
    paragraphs: [],
    sections: {},
    snapshots: [],
  };
}

const paragraph = (number: number, text: string, section: string | null) => ({
  number,
  kind: "Paragraph",
  section,
  text,
  locked: false,
  locked_parts: [],
  edited: false,
  fragments: [`f000${number}`],
});

describe("pickDesk", () => {
  it("keeps this tab's desk until the server has a newer page", () => {
    const server = desk(2);
    expect(pickDesk(null, server)).toBe(server);
    const approved = desk(2, "approved");
    expect(pickDesk(approved, server)).toBe(approved);
    expect(pickDesk(desk(3), server).build.page_version).toBe(3);
    const newer = desk(4);
    expect(pickDesk(desk(3), newer)).toBe(newer);
    expect(pickDesk(desk(5, "needs_review", "other"), server)).toBe(server);
  });
});

describe("groupParagraphs", () => {
  const paragraphs = [
    paragraph(1, "Glow in 7 days", "hero"),
    paragraph(2, "Only one serum.", "hero"),
    paragraph(3, "Is it gentle?", "faq"),
    paragraph(4, "Shop now", "hero"),
    paragraph(5, "© Brand", null),
  ];

  it("groups by section in page order, with the template's names", () => {
    expect(
      groupParagraphs(paragraphs, "", { faq: "Questions" }).map((g) => [
        g.label,
        g.paragraphs.length,
      ]),
    ).toEqual([
      ["Hero", 2],
      ["Questions", 1],
      ["Hero", 1],
      ["Page", 1],
    ]);
  });

  it("keeps only paragraphs containing the search, in any case", () => {
    const groups = groupParagraphs(paragraphs, "  ONE ");
    expect(groups).toHaveLength(1);
    expect(groups[0]?.paragraphs.map((p) => p.number)).toEqual([2]);
  });
});

describe("wizardChoices", () => {
  const labels = {
    authors: [{ id: "expert", label: "Expert" }],
    styles: [{ id: "ugc", label: "UGC style" }],
    genders: [{ id: "women", label: "Women" }],
  };

  it("names each choice as the wizard did", () => {
    expect(
      wizardChoices(
        {
          author_type: "expert",
          ai_images: true,
          image_styles: ["ugc", "other"],
          audience: "Busy parents: little time",
          audience_gender: "women",
          audience_age: "25-34",
          emphasis: { benefits: ["Calm skin"], objections: ["Price"] },
        },
        labels,
      ),
    ).toEqual([
      ["Author", "Expert"],
      ["Audience", "Busy parents"],
      ["People", "Women, aged 25-34"],
      ["Images", "UGC style, other"],
      ["Emphasis", "Calm skin; Price"],
    ]);
  });

  it("has sensible words for an empty wizard", () => {
    expect(wizardChoices({}, labels).map(([, value]) => value)).toEqual([
      "Article writer",
      "Everyone",
      "Anyone",
      "AI images, any style",
      "none",
    ]);
    expect(wizardChoices(null, labels)).toEqual([]);
  });
});
