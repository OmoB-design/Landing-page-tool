// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PagesFilter } from "@/components/features/pages/pages-filter";
import { NO_FILTERS } from "@/lib/pages/list";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

beforeEach(() => replace.mockReset());

describe("PagesFilter", () => {
  it("shows how many filters are active", () => {
    render(
      <PagesFilter
        view="all"
        filters={{ ...NO_FILTERS, status: ["published"], origin: ["cloned"] }}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Filter, 2 active" }),
    ).toBeTruthy();
  });

  it("puts a chosen option in the URL, keeping the view", () => {
    render(<PagesFilter view="mine" filters={NO_FILTERS} />);
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Published" }));
    expect(replace).toHaveBeenCalledWith("/pages?view=mine&status=published", {
      scroll: false,
    });
  });
});
