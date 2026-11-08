// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";

import { APP_PAGE_KEY, RememberPath } from "./remember-path";
import { SettingsSidebar } from "./settings-sidebar";

const nav = vi.hoisted(() => ({ pathname: "/pages", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

function backLink() {
  render(
    <TooltipProvider>
      <SettingsSidebar />
    </TooltipProvider>,
  );
  return screen.getByRole("link", { name: "Back to app" }).getAttribute("href");
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe("Back to app (B6.5)", () => {
  it("goes back to the last page outside Settings, with its filters", async () => {
    nav.pathname = "/pages";
    nav.search = "view=mine";
    render(<RememberPath />);
    await act(async () => {});
    nav.pathname = "/settings/members";
    nav.search = "";
    cleanup();
    render(<RememberPath />);
    await act(async () => {});
    // Settings' own pages aren't remembered as the way back.
    expect(sessionStorage.getItem(APP_PAGE_KEY)).toBe("/pages?view=mine");
    cleanup();
    expect(backLink()).toBe("/pages?view=mine");
  });

  it("goes Home when there's no page to go back to, or it isn't this app's", () => {
    expect(backLink()).toBe("/home");
    cleanup();
    sessionStorage.setItem(APP_PAGE_KEY, "//elsewhere.example/phish");
    expect(backLink()).toBe("/home");
  });
});
