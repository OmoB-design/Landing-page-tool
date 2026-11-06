// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type CanvasSelection,
  FormatToolbar,
  growSize,
  shrinkSize,
} from "./format-toolbar";

const selection: CanvasSelection = {
  ranges: [
    { block: 2, start: 5, end: 12 },
    { block: 3, start: 0, end: 4 },
  ],
  rect: { x: 300, y: 200, w: 120, h: 40 },
  formats: {
    bold: true,
    italic: false,
    underline: false,
    strike: false,
    link: null,
    color: "#111111",
    highlight: null,
    size: 16,
  },
  bounds: { width: 900, height: 700 },
};
const palette = {
  primary: "#e3f98a",
  dark: "#b3dd0b",
  tint: "#f6f8ed",
  accent: "#0000ee",
};

afterEach(cleanup);

describe("text formatting toolbar (B3.1g)", () => {
  it("toggles off what the whole selection has and on what it hasn't", () => {
    const onFormat = vi.fn();
    render(
      <FormatToolbar
        selection={selection}
        palette={palette}
        busy={false}
        onFormat={onFormat}
      />,
    );
    const bold = screen.getByRole("button", { name: "Bold" });
    expect(bold.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(bold);
    expect(onFormat).toHaveBeenLastCalledWith({ bold: false });
    fireEvent.click(screen.getByRole("button", { name: "Italic" }));
    expect(onFormat).toHaveBeenLastCalledWith({ italic: true });
    fireEvent.click(screen.getByRole("button", { name: "Clear formatting" }));
    expect(onFormat).toHaveBeenLastCalledWith({ clear: true });
  });

  it("sizes the way Word does: its list, Grow and Shrink", () => {
    const onFormat = vi.fn();
    render(
      <FormatToolbar
        selection={selection}
        palette={palette}
        busy={false}
        onFormat={onFormat}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Bigger" }));
    expect(onFormat).toHaveBeenLastCalledWith({ size: 18 });
    fireEvent.click(screen.getByRole("button", { name: "Smaller" }));
    expect(onFormat).toHaveBeenLastCalledWith({ size: 14 });
    fireEvent.click(screen.getByRole("button", { name: "Text size, 16 px" }));
    fireEvent.click(screen.getByRole("button", { name: "36" }));
    expect(onFormat).toHaveBeenLastCalledWith({ size: 36 });
    expect(growSize(28)).toBe(36);
    expect(growSize(72)).toBe(80);
    expect(shrinkSize(8)).toBe(7);
  });

  it("offers the brand's colours, a highlight and a link", () => {
    const onFormat = vi.fn();
    render(
      <FormatToolbar
        selection={selection}
        palette={palette}
        busy={false}
        onFormat={onFormat}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Text colour" }));
    const colours = screen.getByRole("group", { name: "Text colour" });
    expect(colours.querySelectorAll("button[aria-pressed]").length).toBe(6);
    fireEvent.click(screen.getByRole("button", { name: "#0000ee" }));
    expect(onFormat).toHaveBeenLastCalledWith({ color: "#0000ee" });

    fireEvent.click(screen.getByRole("button", { name: "Highlight" }));
    fireEvent.click(screen.getByRole("button", { name: "None" }));
    expect(onFormat).toHaveBeenLastCalledWith({ highlight: "" });

    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    fireEvent.change(screen.getByLabelText("Web address"), {
      target: { value: "https://lume.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onFormat).toHaveBeenLastCalledWith({ link: "https://lume.test" });
  });

  it("shows nothing without a selection", () => {
    render(
      <FormatToolbar
        selection={null}
        palette={palette}
        busy={false}
        onFormat={vi.fn()}
      />,
    );
    expect(screen.queryByRole("toolbar")).toBeNull();
  });
});
