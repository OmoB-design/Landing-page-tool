// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AnalysisBar } from "@/components/features/templates/editor/analysis-bar";
import { RulesPanel } from "@/components/features/templates/editor/rules-panel";
import {
  type TemplateEditorState,
  templateEditorSchema,
} from "@/lib/validators/template";

const confirmAnalysis = vi.fn();
const saveRules = vi.fn();
vi.mock("@/lib/templates/actions", () => ({
  confirmAnalysis: (...args: unknown[]) => confirmAnalysis(...args) as unknown,
  saveRules: (...args: unknown[]) => saveRules(...args) as unknown,
  reloadTemplate: vi.fn(),
}));

const ANALYSIS = {
  ai: "claude",
  model: "claude-sonnet-5-5",
  analysed_at: "2026-10-30T10:00:00Z",
  palette: { primary: "#a82420", dark: "#252a32", tint: null, accent: null },
  brand_tokens: ["Resilia"],
  logo_srcs: [],
  cta_hrefs: [],
  notes: "",
  reviewed_at: null,
  reviewed_by: null,
};

function state(analysis: object | null = ANALYSIS): TemplateEditorState {
  return templateEditorSchema.parse({
    template: {
      id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
      name: "Cardio report",
      description: null,
      type: "advertorial",
      version: 2,
      parent_name: null,
      updated_at: "2026-10-30T10:00:00Z",
      origin: "cloned",
      source: {
        url: "https://try.resilia.shop/cardio",
        host: "try.resilia.shop",
        name: null,
        platform: "funnelish",
        verdict: null,
      },
      analysis,
      ready: false,
    },
    instructions: {
      forbidden_terms: ["Resilia", "S-Allyl Cysteine"],
      copy_rules: "First person.",
      length_caps: [{ match: "h2@", max_chars: 68 }],
    },
    sections: [],
    versions: [],
    can_undo: true,
    can_redo: false,
    issues: [],
    look: { colours: [], heading_font: null, body_font: null },
    words: 0,
    read_minutes: 0,
  });
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

function bar(current: TemplateEditorState, onAnalyse = vi.fn()) {
  return render(
    <AnalysisBar
      state={current}
      jobId={null}
      earlierFailure={null}
      starting={false}
      onAnalyse={onAnalyse}
      onFinished={vi.fn()}
      onState={vi.fn()}
    />,
    { wrapper },
  );
}

describe("AnalysisBar", () => {
  beforeEach(() => confirmAnalysis.mockReset());

  it("asks for a check, then confirms the analysis", async () => {
    confirmAnalysis.mockResolvedValue({ state: state() });
    bar(state());
    expect(screen.getByText(/Check the 0 sections and the rules/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm analysis" }));
    await waitFor(() =>
      expect(confirmAnalysis).toHaveBeenCalledWith(
        "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
        2,
      ),
    );
  });

  it("offers Analyse for a clone never analysed", () => {
    const onAnalyse = vi.fn();
    bar(state(null), onAnalyse);
    fireEvent.click(screen.getByRole("button", { name: "Analyse" }));
    expect(onAnalyse).toHaveBeenCalled();
  });

  it("says why the last analysis failed, keeping Confirm for the earlier one", () => {
    render(
      <AnalysisBar
        state={state()}
        jobId={null}
        earlierFailure="The analysis came back incomplete, so nothing was saved. Try again."
        starting={false}
        onAnalyse={vi.fn()}
        onFinished={vi.fn()}
        onState={vi.fn()}
      />,
      { wrapper },
    );
    expect(screen.getByText(/came back incomplete/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Confirm analysis" }),
    ).toBeTruthy();
  });

  it("shows nothing once the analysis is confirmed", () => {
    const { container } = bar(
      state({ ...ANALYSIS, reviewed_at: "2026-10-30T11:00:00Z" }),
    );
    expect(container.textContent).toBe("");
  });
});

describe("RulesPanel", () => {
  beforeEach(() => saveRules.mockReset());

  it("saves the rules a line per item, once something changed", async () => {
    saveRules.mockResolvedValue({ state: state() });
    render(<RulesPanel state={state()} onState={vi.fn()} />);
    const save = screen.getByRole("button", { name: "Save rules" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("68 characters")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Never use these words"), {
      target: { value: "Resilia\n\n  Dr. Reyes  \n" },
    });
    fireEvent.click(save);
    await waitFor(() => expect(saveRules).toHaveBeenCalled());
    const [, rules] = saveRules.mock.calls[0] as [
      string,
      { forbidden_terms: string[]; copy_rules: string },
    ];
    expect(rules.forbidden_terms).toEqual(["Resilia", "Dr. Reyes"]);
    expect(rules.copy_rules).toBe("First person.");
  });
});
