// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";

import { AddBrandScene } from "./add-brand";
import { CreatePageScene } from "./create-page";
import { PickTemplateScene } from "./pick-template";

// The kit asks the browser whether hover exists and whether motion is reduced: reduced here, so
// each scene renders its still (the poster).
beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("reduce"),
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

describe("Home card scenes (I1, after Quality's in-app Home)", () => {
  it("draws 1:1 in the picture, with Quality's 398 px canvas zoomed inside", () => {
    const { container } = render(<AddBrandScene />);
    const stage = container.querySelector<HTMLElement>(".ss-stage");
    expect(stage?.style.width).toBe("283px");
    expect(stage?.style.height).toBe("207px");
    const canvas = container.querySelector<HTMLElement>(".ih-canvas");
    expect(Number(canvas?.style.zoom)).toBeCloseTo(283 / 398, 4);
  });

  it("Add a brand: LP's sidebar, Brands lit in the still", () => {
    const { container } = render(<AddBrandScene />);
    expect(container.textContent).toContain("Templates");
    expect(
      container.querySelector('[data-target="brands"]')?.textContent,
    ).toContain("Brands");
  });

  it("Pick a template: the still has Reviews moved above Benefits", () => {
    const { container } = render(<PickTemplateScene />);
    const rows = [...container.querySelectorAll<HTMLElement>(".ih-slot")];
    const y = (label: string) =>
      rows.find((row) => row.textContent?.includes(label))?.style.translate;
    expect(y("Reviews")).toBe("0 40px");
    expect(y("Benefits")).toBe("0 80px");
  });

  it("Create a page: the still has the new page landed in Needs review", () => {
    const { container } = render(<CreatePageScene />);
    const rows = [...container.querySelectorAll<HTMLElement>(".ih-prow")];
    const landed = rows.find(
      (row) =>
        row.textContent?.includes("Comfort, dressed up") &&
        !row.hasAttribute("data-gone"),
    );
    expect(landed?.style.translate).toBe("0 60px");
    const review = container.querySelector(".ih-band");
    expect(review?.textContent).toContain("Needs review");
    expect(
      review?.querySelector(".ss-states__item[data-on]")?.textContent,
    ).toBe("2");
  });
});
