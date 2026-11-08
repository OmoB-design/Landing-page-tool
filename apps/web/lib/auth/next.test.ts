import { describe, expect, it } from "vitest";

import { safeNext } from "./next";

describe("safeNext (B6.1)", () => {
  it("keeps paths inside the app and sends anything else Home", () => {
    expect(safeNext("/invite/abc")).toBe("/invite/abc");
    expect(safeNext("/pages?x=1")).toBe("/pages?x=1");
    for (const away of [
      null,
      undefined,
      "",
      "//evil.test",
      "/\\evil.test",
      "https://evil.test",
      "invite/abc",
    ])
      expect(safeNext(away)).toBe("/home");
  });
});
