// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import AppError from "./error";

describe("AppError", () => {
  it("says something went wrong, offers Try again and Go home, and shows the reference", () => {
    const reset = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = Object.assign(new Error("boom"), { digest: "abc123" });
    render(<AppError error={error} reset={reset} />);
    expect(screen.getByText("Something went wrong")).toBeTruthy();
    expect(screen.getByText("Reference: abc123")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Go home" }).getAttribute("href"),
    ).toBe("/home");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
