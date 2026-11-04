// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Competitors } from "./build-report";

describe("Competitors card (B2.4a, B2.4b)", () => {
  it("lists what was read from each page, and the page that couldn't be read", () => {
    render(
      <Competitors
        competitors={[
          {
            rank: 2,
            label: "Brand B",
            name: "Daily Greens",
            url: "https://vitality.test/products/daily-greens",
            status: "pulled",
            price: "59.00",
            currency: "USD",
            rating: "4.4",
            rating_count: 1203,
            claims: 3,
            reviews: 1,
            photo: false,
            warnings: [],
          },
          {
            rank: 5,
            label: "Brand E",
            url: "https://blocked.test/products/x",
            status: "failed",
            error: "The site blocked the request.",
            claims: 0,
            reviews: 0,
            photo: false,
            warnings: [],
          },
        ]}
      />,
    );
    expect(screen.getByText(/1 of 2 pages read/)).toBeTruthy();
    expect(screen.getByText("#2")).toBeTruthy();
    expect(screen.getByText(/Daily Greens/)).toBeTruthy();
    expect(
      screen.getByText("$59.00 · 4.4 stars (1,203) · 3 claims · 1 review"),
    ).toBeTruthy();
    expect(screen.getByText("Not read")).toBeTruthy();
    expect(screen.getByText("The site blocked the request.")).toBeTruthy();
  });

  it("shows Our take and the points compared side by side (B2.4b)", () => {
    render(
      <Competitors
        competitors={[
          {
            rank: 2,
            label: "Brand B",
            url: "https://vitality.test/products/daily-greens",
            status: "pulled",
            price: "59.00",
            currency: "USD",
            claims: 2,
            reviews: 0,
            photo: false,
            warnings: [],
          },
        ]}
        comparison={{
          takes: [
            {
              rank: 2,
              stands_out: {
                text: "It packs 40 superfoods.",
                sources: ["2.c1"],
              },
              worth_knowing: {
                text: "It costs more than our pick.",
                sources: [],
              },
            },
          ],
          axes: [
            {
              name: "Returns",
              cells: [
                { rank: 1, text: "60 days", sources: ["1.s2"] },
                { rank: 2, text: "30 days", sources: ["2.c2"] },
              ],
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("It packs 40 superfoods.")).toBeTruthy();
    expect(screen.getByText("Worth knowing:")).toBeTruthy();
    expect(screen.getByText("Side by side")).toBeTruthy();
    expect(screen.getByText("Returns")).toBeTruthy();
    expect(screen.getByText("60 days")).toBeTruthy();
    expect(screen.getByText("30 days")).toBeTruthy();
  });
});
