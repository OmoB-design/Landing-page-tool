// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseWizard } from "@/lib/wizard/state";

import { AudienceStep, EmphasisStep } from "./steps";
import type { useBriefing } from "./use-briefing";

afterEach(cleanup);

type Briefing = ReturnType<typeof useBriefing>;
const base = parseWizard(new URLSearchParams());
const ready: Briefing = {
  status: "ready",
  job: null,
  error: null,
  retry: vi.fn(),
  briefing: {
    audiences: [
      { name: "Everyday Home Cooks", description: "They cook most nights." },
    ],
    benefits: ["Bold pop", "Fair price", "No fuss", "Never run out"],
    features: [],
    objections: [],
  },
};

describe("wizard steps", () => {
  it("offers the desk's pick while the briefing is being written", () => {
    render(
      <AudienceStep
        state={base}
        update={vi.fn()}
        briefing={{ ...ready, status: "writing", briefing: null }}
      />,
    );
    expect(
      (
        screen.getByRole("radio", {
          name: /Let the desk pick/,
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(screen.getByText(/Writing this product’s briefing/)).toBeTruthy();
  });

  it("lets you retry a failed briefing", () => {
    const retry = vi.fn();
    render(
      <AudienceStep
        state={base}
        update={vi.fn()}
        briefing={{
          ...ready,
          status: "failed",
          briefing: null,
          error: "Claude is busy.",
          retry,
        }}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("Claude is busy.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalled();
  });

  it("picks an audience from the briefing", () => {
    const update = vi.fn();
    render(<AudienceStep state={base} update={update} briefing={ready} />);
    fireEvent.click(screen.getByRole("radio", { name: /Everyday Home Cooks/ }));
    expect(update).toHaveBeenCalledWith({ audience: "Everyday Home Cooks" });
  });

  it("caps each emphasis list at three", () => {
    render(
      <EmphasisStep
        state={{ ...base, benefits: ["Bold pop", "Fair price", "No fuss"] }}
        update={vi.fn()}
        briefing={ready}
      />,
    );
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Never run out",
        }) as HTMLInputElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("textbox", {
          name: "Add your own benefit",
        }) as HTMLInputElement
      ).disabled,
    ).toBe(true);
  });
});
