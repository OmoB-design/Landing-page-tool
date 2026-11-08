// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BuildSteps, StepCount } from "./build-steps";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

function steps(finished: boolean) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <BuildSteps jobId={null} finished={finished} status="needs_review" />
    </QueryClientProvider>,
  );
}

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

describe("the build page's steps (B3.5d)", () => {
  it("lists the steps while the page builds", () => {
    steps(false);
    const card = within(screen.getByRole("region", { name: "Build steps" }));
    expect(card.getByRole("list")).toBeTruthy();
    expect(card.queryByRole("button", { name: "Show the steps" })).toBeNull();
    expect(card.queryByRole("img")).toBeNull();
  });

  it("becomes the frame once the page is built: the illustration, Ready to review, steps folded", () => {
    steps(true);
    const card = within(screen.getByRole("region", { name: "Build steps" }));
    expect(card.getByRole("img")).toBeTruthy();
    expect(card.getByText("Ready to review")).toBeTruthy();
    expect(card.getByText(/^(\d+)\/\1 completed$/)).toBeTruthy();
    expect(card.queryByRole("list")).toBeNull();
    expect(card.getByRole("button", { name: "Show the steps" })).toBeTruthy();
  });
});
