// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Competitors } from "./build-report";

describe("Competitors card (B2.4a)", () => {
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
});
