// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";

import { FloatingComposer } from "./floating-composer";

type Handler = ((event: unknown) => void) | null;
let rec: { onresult: Handler; onend: (() => void) | null } | null = null;

class FakeRecognition {
  onresult: Handler = null;
  onend: (() => void) | null = null;
  onerror: Handler = null;
  constructor() {
    // The test drives the instance the hook makes (the fake's whole point).
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    rec = this;
  }
  start() {}
  stop() {
    this.onend?.();
  }
  abort() {
    this.onend?.();
  }
}

beforeEach(() => {
  vi.stubGlobal("SpeechRecognition", FakeRecognition);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  rec = null;
});

describe("the bar while dictating (B3.1h)", () => {
  it("shows Listening beside Buddy and a stop disc, then the words", () => {
    render(
      <TooltipProvider>
        <FloatingComposer working={false} onSend={vi.fn()} onOpen={vi.fn()} />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Dictate" }));
    expect(document.querySelector(".buddy-hint")?.textContent).toContain(
      "Listening",
    );
    const stop = screen.getByRole("button", { name: "Stop dictating" });
    // The Stop Buddy disc in the bar's text colour, not the red ring.
    expect(stop.className).toContain("bg-heading-01");
    expect(document.querySelector(".animate-live-pulse")).toBeNull();
    // Buddy carries the outer bars he grows while listening.
    expect(document.querySelectorAll("[data-buddy] > span").length).toBe(5);

    act(() =>
      rec?.onresult?.({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: "make it shorter" } }],
      }),
    );
    fireEvent.click(stop);
    expect(
      (screen.getByLabelText("Work with Buddy") as HTMLInputElement).value,
    ).toBe("make it shorter");
    // With words in the field, Send takes the stop disc's place.
    expect(screen.getByRole("button", { name: "Send to Buddy" })).toBeTruthy();
  });
});
