import { afterEach } from "vitest";

// Unmount components rendered by Testing Library after each test in DOM (jsdom) test files.
// Component tests opt into jsdom with a `// @vitest-environment jsdom` comment.
afterEach(async () => {
  if (typeof document === "undefined") return;
  const { cleanup } = await import("@testing-library/react");
  cleanup();
});
