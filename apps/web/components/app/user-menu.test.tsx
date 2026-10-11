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
  const trigger = screen.getByRole("button", {
    name: "Account menu for Ada Lovelace",
  });
  // Radix opens its menu on pointer down (left button) or the keyboard.
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
}

describe("UserMenu", () => {
  it("shows the profile card with who is signed in", () => {
    render(
      <UserMenu
        name="Ada Lovelace"
        email="ada@example.test"
        setup={{ done: 1, total: 5 }}
      />,
    );
    const card = screen.getByRole("button", {
      name: "Account menu for Ada Lovelace",
    });
    expect(card.textContent).toContain("ada@example.test");
  });

  it("lists the actions, the theme and getting-started progress", () => {
    openMenu();
    // Radix names the menu after its trigger.
    const menu = screen.getByRole("menu", {
      name: "Account menu for Ada Lovelace",
    });
    const items = Array.from(menu.querySelectorAll('[role="menuitem"]')).map(
      (item) => item.textContent,
    );
    expect(items).toEqual([
      "Settings",
      "ThemesSystem",
      "Logout",
      "Next: Add a product",
    ]);
    expect(
      screen.getByRole("progressbar", { name: "Getting started" }),
    ).toBeTruthy();
    expect(screen.getByText("1/5")).toBeTruthy();
  });

  it("cycles the theme from System to Light", () => {
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Themes/ }));
    expect(setTheme).toHaveBeenCalledWith("light");
  });

  it("goes to the next setup step", () => {
    openMenu();
    fireEvent.click(
      screen.getByRole("menuitem", { name: /Next: Add a product/ }),
    );
    expect(push).toHaveBeenCalledWith("/brands");
  });
});
