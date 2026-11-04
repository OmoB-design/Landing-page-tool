import { afterEach } from "vitest";

// jsdom lacks these browser APIs, which some AffectUI components use; minimal stand-ins.
if (typeof window !== "undefined") {
  class NoopObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  window.IntersectionObserver ??=
    NoopObserver as unknown as typeof IntersectionObserver;
  window.ResizeObserver ??= NoopObserver as unknown as typeof ResizeObserver;
  // Media queries: reduced motion is on, so Stageshow illustrations (D101) render their end
  // state and start no timers; every other query is false.
  window.matchMedia ??= ((query: string) => ({
    matches: query.includes("prefers-reduced-motion: reduce"),
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// Unmount components rendered by Testing Library after each test in DOM (jsdom) test files.
// Component tests opt into jsdom with a `// @vitest-environment jsdom` comment.
afterEach(async () => {
  if (typeof document === "undefined") return;
  const { cleanup } = await import("@testing-library/react");
  cleanup();
});
