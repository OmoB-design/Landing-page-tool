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
}

// Unmount components rendered by Testing Library after each test in DOM (jsdom) test files.
// Component tests opt into jsdom with a `// @vitest-environment jsdom` comment.
afterEach(async () => {
  if (typeof document === "undefined") return;
  const { cleanup } = await import("@testing-library/react");
  cleanup();
});
