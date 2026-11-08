// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ThemeScene } from "./theme-scene";

describe("Theme pictures (I5)", () => {
  it("Light and Dark keep their own look whatever the app shows", () => {
    const light = render(<ThemeScene theme="light" />).container;
    expect(light.querySelector(".lp-look-light")).toBeTruthy();
    expect(light.querySelector(".lp-look-dark-scope")).toBeNull();
    const dark = render(<ThemeScene theme="dark" />).container;
    expect(dark.querySelector(".lp-look-dark")).toBeTruthy();
    expect(dark.querySelectorAll(".ith-window")).toHaveLength(1);
  });

  it("System is light with a dark copy over its right side", () => {
    const { container } = render(<ThemeScene theme="system" />);
    const root = container.firstElementChild!;
    expect(root.getAttribute("aria-hidden")).toBe("true");
    expect(root.getAttribute("data-illustration")).toBe("theme-system");
    expect(container.querySelector(".lp-look-light")).toBeTruthy();
    expect(
      container.querySelector(".ith-half.lp-look-dark-scope"),
    ).toBeTruthy();
    expect(container.querySelectorAll(".ith-window")).toHaveLength(2);
  });
});
