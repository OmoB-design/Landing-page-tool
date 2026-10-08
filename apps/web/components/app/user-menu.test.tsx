// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserMenu } from "@/components/app/user-menu";

const push = vi.fn();
const setTheme = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/auth/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/components/app/theme-preference", () => ({
  useThemePreference: () => "system",
  setThemePreference: (value: string) => setTheme(value),
}));

beforeEach(() => {
  push.mockReset();
  setTheme.mockReset();
});

function openMenu() {
  render(
    <UserMenu
      name="Ada Lovelace"
      email="ada@example.test"
      setup={{
        done: 1,
        total: 5,
        nextLabel: "Add a product",
        nextHref: "/brands",
      }}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Account menu for Ada Lovelace" }),
  );
}

describe("UserMenu", () => {
  it("shows who is signed in, the actions and getting-started progress", () => {
    openMenu();
    expect(screen.getByText("ada@example.test")).toBeTruthy();
    const menu = screen.getByRole("menu", { name: "Account" });
    const items = Array.from(menu.querySelectorAll('[role="menuitem"]')).map(
      (item) => item.textContent,
    );
    expect(items).toEqual(["Settings", "ThemeSystem", "Sign out"]);
    expect(
      screen.getByRole("progressbar", { name: "Getting started" }),
    ).toBeTruthy();
    expect(screen.getByText("1/5")).toBeTruthy();
  });

  it("cycles the theme from System to Light", () => {
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Theme/ }));
    expect(setTheme).toHaveBeenCalledWith("light");
  });

  it("goes to the next setup step", () => {
    openMenu();
    fireEvent.click(
      screen.getByRole("button", { name: /Next: Add a product/ }),
    );
    expect(push).toHaveBeenCalledWith("/brands");
  });
});
