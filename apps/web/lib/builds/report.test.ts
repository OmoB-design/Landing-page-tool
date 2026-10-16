import { describe, expect, it } from "vitest";

import { addSectionAnchors, sectionAnchor } from "@/lib/builds/preview-anchors";
import {
  claimAction,
  findingSection,
  reportClaims,
  reportReminders,
  sectionLabel,
  sentence,
} from "@/lib/builds/report";
import { buildReportSchema } from "@/lib/validators/build";

const finding = (
  rule: string,
  severity: "high" | "medium" | "low",
  location: string,
) => ({
  rule,
  category: "x",
  severity,
  text: "t",
  location,
  reason: `reason for ${rule}`,
});

const report = (overrides: Record<string, unknown> = {}) =>
  buildReportSchema.parse({
    mode: "owned",
    template: { name: "Advertorial", slug: "advertorial" },
    ...overrides,
  });

describe("claims", () => {
  it("names the section a finding sits in, and none for the whole page", () => {
    expect(findingSection("hero > div > p:nth-of-type(2)")).toBe("hero");
    expect(findingSection("reviews")).toBe("reviews");
    expect(findingSection("page")).toBeNull();
    expect(findingSection("page > head > title")).toBeNull();
  });

  it("labels section keys in sentence case", () => {
    expect(sectionLabel("hero")).toBe("Hero");
    expect(sectionLabel("social_proof")).toBe("Social proof");
    expect(sectionLabel("before-after")).toBe("Before after");
  });

  it("splits the expert note into the reminders and reads severity as an action", () => {
    const r = report({
      compliance: {
        findings: [
          finding("clinically_proven", "high", "hero > p"),
          finding("number_one", "medium", "reviews > p"),
          finding("miracle", "low", "faq > p"),
          finding("expert_author", "low", "page"),
        ],
        high_risk_count: 1,
        clean: false,
      },
    });
    expect(reportClaims(r).map((f) => f.rule)).toEqual([
      "clinically_proven",
      "number_one",
      "miracle",
    ]);
    expect(reportClaims(r).map(claimAction)).toEqual(["Fix", "Check", "Check"]);
    expect(reportReminders(r)).toEqual([
      { title: "Written as an expert.", detail: "reason for expert_author" },
    ]);
  });

  it("puts placeholder images, mock copy and notes in the reminders", () => {
    const r = report({
      mock_images: true,
      copy: { mock: true },
      warnings: ["Two images were too small."],
    });
    expect(reportReminders(r).map((x) => x.title)).toEqual([
      "Placeholder images.",
      "Copy written in mock mode.",
      "Two images were too small.",
    ]);
  });

  it("writes values in sentence case", () => {
    expect(sentence("in the template's order")).toBe("In the template's order");
    expect(sentence("")).toBe("");
  });
});

describe("preview anchors", () => {
  it("gives each marked section an id and adds the target outline", () => {
    const html =
      '<html><head></head><body><section class="a" data-lp-section="hero"></section><div data-lp-section="reviews"></div></body></html>';
    const out = addSectionAnchors(html);
    expect(out).toContain(
      `<section id="${sectionAnchor("hero")}" class="a" data-lp-section="hero">`,
    );
    expect(out).toContain(
      `<div id="lp-section-reviews" data-lp-section="reviews">`,
    );
    expect(out).toMatch(/:target\{outline:2px solid #2c66ff/);
    expect(out.indexOf("<style>")).toBeLessThan(out.indexOf("</head>"));
  });

  it("leaves sections with their own id, and repeated keys, alone", () => {
    const html =
      '<div id="top" data-lp-section="hero"></div><div data-lp-section="faq"></div><div data-lp-section="faq"></div>';
    const out = addSectionAnchors(html);
    expect(out).toContain('<div id="top" data-lp-section="hero">');
    expect(out.match(/id="lp-section-faq"/g)).toHaveLength(1);
    expect(out.startsWith("<style>")).toBe(true);
  });

  it("keeps anchor ids to safe characters", () => {
    expect(sectionAnchor('a"b c')).toBe("lp-section-a-b-c");
  });
});
