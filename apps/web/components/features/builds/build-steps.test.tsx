// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StepCount } from "./build-steps";

afterEach(cleanup);

describe("the step count chip (B3.5c)", () => {
  it("pads the count to the total's digits while counting", () => {
    render(<StepCount done={1} total={13} />);
    expect(screen.getByText("01/13")).toBeTruthy();
    cleanup();
    render(<StepCount done={3} total={8} />);
    expect(screen.getByText("3/8")).toBeTruthy();
  });

  it("says completed once every step is done", () => {
    render(<StepCount done={13} total={13} />);
    expect(screen.getByText("13/13 completed")).toBeTruthy();
  });
});
