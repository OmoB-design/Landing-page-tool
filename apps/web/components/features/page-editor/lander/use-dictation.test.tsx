// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toast } from "@/components/app/toaster";

import { useDictation } from "./use-dictation";

vi.mock("@/components/app/toaster", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

type Result = { isFinal: boolean; 0: { transcript: string } };
const made: Fake[] = [];
class Fake {
  onresult:
    ((event: { resultIndex: number; results: Result[] }) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  lang = "";
  continuous = false;
  interimResults = false;
  constructor() {
    made.push(this);
  }
  start() {}
  stop() {
    this.onend?.();
  }
  abort() {
    this.onend?.();
  }
  say(text: string, isFinal: boolean) {
    this.onresult?.({
      resultIndex: 0,
      results: [{ isFinal, 0: { transcript: text } }],
    });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("SpeechRecognition", Fake);
  made.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function hook() {
  const finals: string[] = [];
  const view = renderHook(() => useDictation((text) => finals.push(text)));
  return { finals, view };
}

describe("dictation (B3.1i)", () => {
  it("keeps listening when the browser ends a session, until Stop", () => {
    const { view } = hook();
    act(() => view.result.current.start());
    expect(view.result.current.listening).toBe(true);
    // The browser ends it after a pause: a new session starts.
    act(() => made[0]!.onend?.());
    act(() => vi.advanceTimersByTime(200));
    expect(made).toHaveLength(2);
    expect(view.result.current.listening).toBe(true);
    act(() => view.result.current.stop());
    act(() => vi.advanceTimersByTime(200));
    expect(made).toHaveLength(2);
    expect(view.result.current.listening).toBe(false);
  });

  it("keeps words still being heard when a session ends", () => {
    const { view, finals } = hook();
    act(() => view.result.current.start());
    act(() => made[0]!.say("make the button", false));
    expect(view.result.current.interim).toBe("make the button");
    act(() => view.result.current.stop());
    expect(finals).toEqual(["make the button"]);
  });

  it("says why when the microphone is blocked, and stops", () => {
    const { view } = hook();
    act(() => view.result.current.start());
    act(() => {
      made[0]!.onerror?.({ error: "not-allowed" });
      made[0]!.onend?.();
    });
    act(() => vi.advanceTimersByTime(200));
    expect(view.result.current.listening).toBe(false);
    expect(made).toHaveLength(1);
    expect(toast.error).toHaveBeenCalledWith(
      "Dictation stopped",
      expect.objectContaining({
        description: expect.stringContaining("blocked"),
      }),
    );
  });

  it("stops after five quiet sessions in a row", () => {
    const { view } = hook();
    act(() => view.result.current.start());
    for (let i = 0; i < 6; i++) {
      act(() => made[made.length - 1]!.onend?.());
      act(() => vi.advanceTimersByTime(200));
    }
    expect(view.result.current.listening).toBe(false);
    expect(made).toHaveLength(6);
  });
});
