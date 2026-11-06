// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseWizard } from "@/lib/wizard/state";

import {
  AudienceStep,
  CompetitorsStep,
  EmphasisStep,
  TemplateStep,
} from "./steps";
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

  it("takes four competitor pages and says what's wrong with one (B2.4a)", () => {
    const update = vi.fn();
    render(
      <CompetitorsStep
        state={{
          ...base,
          ranking: true,
          competitors: ["https://a.test/p", "a.test/p", "", ""],
        }}
        update={update}
      />,
    );
    expect(
      screen.getByLabelText("Competitor at rank 2: product page"),
    ).toBeTruthy();
    expect(
      screen.getByText("This page is already in the ranking"),
    ).toBeTruthy();
    fireEvent.change(
      screen.getByLabelText("Competitor at rank 4: product page"),
      {
        target: { value: "https://c.test/p" },
      },
    );
    expect(update).toHaveBeenCalledWith({
      competitors: ["https://a.test/p", "a.test/p", "https://c.test/p", ""],
    });
    fireEvent.click(screen.getByLabelText(/Real names/));
    expect(update).toHaveBeenCalledWith({ naming: "real" });
  });

  it("ticks every template for a batch, and unticks one (B3.5)", () => {
    const templates = ["a", "b", "c"].map((id, i) => ({
      id: `0000000${i}-0000-4000-8000-000000000000`,
      name: `Template ${id.toUpperCase()}`,
      type: "advertorial",
      description: null,
      sections: 6,
      group: "Library" as const,
    }));
    const data = {
      brands: [],
      products: [],
      templates,
    } as unknown as Parameters<typeof TemplateStep>[0]["data"];
    const update = vi.fn();
    const { rerender } = render(
      <TemplateStep data={data} state={base} update={update} />,
    );
    fireEvent.click(screen.getByRole("switch"));
    expect(update).toHaveBeenLastCalledWith({
      batch: true,
      templates: templates.map((t) => t.id),
    });
    const batch = {
      ...base,
      batch: true,
      templates: templates.map((t) => t.id),
    };
    rerender(<TemplateStep data={data} state={batch} update={update} />);
    expect(screen.getByText(/3 of 3 ticked/)).toBeTruthy();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(3);
    fireEvent.click(boxes[1] as HTMLElement);
    expect(update).toHaveBeenLastCalledWith({
      templates: [templates[0]?.id, templates[2]?.id],
    });
    fireEvent.click(screen.getByRole("button", { name: "Untick all" }));
    expect(update).toHaveBeenLastCalledWith({ templates: [] });
  });
});
