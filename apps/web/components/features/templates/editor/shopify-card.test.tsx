// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ShopifyMap } from "@/lib/validators/template";

import { ShopifyCard } from "./shopify-card";

const MAP: ShopifyMap = {
  sections: [
    {
      key: "hero",
      name: "Headline and byline",
      texts: 4,
      images: 2,
      media: 0,
      loose: false,
    },
    {
      key: "faq",
      name: "Questions",
      texts: 6,
      images: 0,
      media: 1,
      loose: false,
    },
    {
      key: "loose-1",
      name: "After Questions",
      texts: 1,
      images: 0,
      media: 0,
      loose: true,
    },
  ],
  texts: 11,
  images: 2,
  media: 1,
  static: 1,
  unclear: 0,
  issues: [
    {
      level: "info",
      message:
        "1 text outside the marked sections gets a Shopify section of its own, “After Questions”.",
    },
  ],
  ready: true,
};

afterEach(cleanup);

describe("ShopifyCard (B4.1)", () => {
  it("sums up what becomes editable, section by section", () => {
    render(<ShopifyCard map={MAP} />);
    expect(
      screen.getByText(/3 sections · 11 texts · 2 pictures · 1 video editable/),
    ).toBeTruthy();
    expect(screen.getByText(/1 can’t be edited in Shopify/)).toBeTruthy();
    expect(screen.getByText(/They still show on the page/)).toBeTruthy();
    expect(screen.getByText("4 texts · 2 pictures")).toBeTruthy();
    expect(screen.getByText("6 texts · 1 video")).toBeTruthy();
    expect(screen.getByText("Added")).toBeTruthy();
    expect(screen.getByText("Note:")).toBeTruthy();
  });

  it("says when pages can't go to Shopify as editable sections yet", () => {
    render(
      <ShopifyCard
        map={{
          ...MAP,
          sections: [],
          texts: 0,
          images: 0,
          media: 0,
          static: 0,
          ready: false,
          issues: [
            {
              level: "error",
              message: "No sections are marked on the page yet.",
            },
          ],
        }}
      />,
    );
    expect(
      screen.getByText(/can’t go to Shopify as editable sections yet/),
    ).toBeTruthy();
    expect(screen.getByText("Problem:")).toBeTruthy();
    expect(screen.queryByText(/can’t be edited in Shopify/)).toBeNull();
  });
});
