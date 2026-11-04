// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConnectScene } from "./connect-scene";

// The test setup answers reduced motion, so each scene renders its end state (the poster).
describe("Connect pictures (I4)", () => {
  it("Vercel: connected, with the live address on the brand's project", () => {
    const { container } = render(<ConnectScene service="vercel" />);
    const root = container.firstElementChild!;
    expect(root.getAttribute("aria-hidden")).toBe("true");
    expect(root.getAttribute("data-illustration")).toBe("connect-vercel");
    expect(container.querySelector(".ic-tile[data-on]")).toBeTruthy();
    const result = container.querySelector(".ic-result[data-in]");
    expect(result?.textContent).toBe("lp-lum.vercel.app");
    expect(result?.hasAttribute("data-live")).toBe(true);
    expect(container.querySelector(".lp-look")).toBeTruthy();
  });

  it("Shopify: a draft page, not live", () => {
    const { container } = render(<ConnectScene service="shopify" />);
    const result = container.querySelector(".ic-result[data-in]");
    expect(result?.textContent).toBe("Draft page");
    expect(result?.hasAttribute("data-live")).toBe(false);
  });
});
