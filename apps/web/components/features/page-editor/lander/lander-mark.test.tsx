// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LanderMark } from "./lander-mark";

afterEach(cleanup);

/** Each Buddy's right eye's tilt, in degrees: −28.7 with his face on his right (as drawn), +26.7
 * mirrored on his left. */
function rightEyeTilts() {
  return [...document.querySelectorAll("[data-buddy]")].map((buddy) => {
    const eyes = buddy.querySelectorAll<HTMLElement>(".bg-buddy-eye");
    const match = /rotate\((-?[\d.]+)deg\)/.exec(
      eyes[1]?.style.transform ?? "",
    );
    return match ? Number(match[1]) : NaN;
  });
}

describe("Buddy roaming in his frame (B3.1j)", () => {
  it("turns the big Buddy's face toward the pointer inside his frame, and home when it leaves", async () => {
    const { getByTestId } = render(
      <div data-buddy-frame="" data-testid="frame">
        <LanderMark size="lg" roam />
        <span data-testid="inside" />
      </div>,
    );
    const frame = getByTestId("frame");
    // jsdom puts him at 0, 0: far to his left.
    fireEvent.pointerMove(getByTestId("inside"), {
      clientX: -2000,
      clientY: 0,
    });
    await waitFor(() => expect(rightEyeTilts()[0]).toBeGreaterThan(26), {
      timeout: 3000,
    });
    // Far to his right: back on his right.
    fireEvent.pointerMove(getByTestId("inside"), { clientX: 2000, clientY: 0 });
    await waitFor(() => expect(rightEyeTilts()[0]).toBeLessThan(-28), {
      timeout: 3000,
    });
    // Left again, then the pointer leaves the frame: his face settles home.
    fireEvent.pointerMove(getByTestId("inside"), {
      clientX: -2000,
      clientY: 0,
    });
    await waitFor(() => expect(rightEyeTilts()[0]).toBeGreaterThan(26), {
      timeout: 3000,
    });
    fireEvent.pointerLeave(frame);
    await waitFor(() => expect(rightEyeTilts()[0]).toBeLessThan(-28), {
      timeout: 3000,
    });
  });

  it("leaves the small Buddies' faces where they are", async () => {
    const { getByTestId } = render(
      <div data-buddy-frame="">
        <LanderMark size="lg" roam />
        <LanderMark />
        <span data-testid="inside" />
      </div>,
    );
    fireEvent.pointerMove(getByTestId("inside"), {
      clientX: -2000,
      clientY: 0,
    });
    await waitFor(() => expect(rightEyeTilts()[0]).toBeGreaterThan(26), {
      timeout: 3000,
    });
    expect(rightEyeTilts()[1]).toBeLessThan(-28);
  });
});
