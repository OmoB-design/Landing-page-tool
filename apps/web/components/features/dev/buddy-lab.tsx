"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ShimmerText } from "@/components/ui/shimmer-loader";
import { MorphText } from "@/components/ui/text-morph";
import { cn } from "@/lib/utils";

import { MicButton } from "../page-editor/lander/composer-parts";
import { FloatingComposer } from "../page-editor/lander/floating-composer";
import { LanderMark } from "../page-editor/lander/lander-mark";

/**
 * Buddy on his own (development only, B3.1h): the bar's Buddy and a large one side by side, a mock
 * Sections panel to point at (he turns his face to it), a field to click into (his shake and
 * mouth), and Record / Stop (he becomes the recording signal and back), in the bar's light and
 * dark looks.
 */
export function BuddyLab() {
  const [listening, setListening] = useState(false);
  const [focused, setFocused] = useState(false);
  const [shake, setShake] = useState(0);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => setListening((on) => !on)}
          data-testid="buddy-toggle"
        >
          {listening ? "Stop" : "Record"}
        </Button>
        <span className="text-type-caption-1 text-sub-text">
          Point at the panel on the left; click into a bar.
        </span>
      </div>
      <div className="flex gap-6">
        <div
          data-buddy-look="left"
          data-testid="buddy-sections"
          className="flex w-60 shrink-0 flex-col gap-1 rounded-lg bg-foreground-01 p-3 edge"
        >
          <span className="text-type-body-small font-medium text-heading-01">
            Sections · 6
          </span>
          {["Hero", "Benefits", "Reviews", "Offer", "FAQ", "Footer"].map(
            (name) => (
              <span
                key={name}
                className="rounded-sm px-2 py-1.5 text-type-body-small text-heading-04 hover:bg-foreground-02"
              >
                {name}
              </span>
            ),
          )}
        </div>
        <div className="flex flex-col gap-6">
          {(["theme-light", "theme-dark"] as const).map((tone) => (
            <div
              key={tone}
              data-testid={`buddy-bar-${tone}`}
              className={cn(
                tone,
                "flex h-12.5 w-120 items-center gap-1.5 rounded-full bg-surface-primary pr-2.5 pl-3 shadow-lander-bar ring-thin ring-stroke",
              )}
            >
              <LanderMark mouth={focused} listening={listening} shake={shake} />
              <div className="relative flex h-full min-w-0 flex-1 items-center">
                <input
                  aria-label={`Bar ${tone}`}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  onPointerDown={() => setShake((n) => n + 1)}
                  className="h-full w-full min-w-0 bg-transparent px-0.5 text-type-body-small text-heading-01 outline-none"
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 left-0.5 flex items-center text-type-body-small whitespace-nowrap text-bar-hint"
                >
                  <ShimmerText mode="mask" active={listening} duration={1.6}>
                    <MorphText>
                      {listening ? "Listening…" : "Work with Buddy"}
                    </MorphText>
                  </ShimmerText>
                </span>
              </div>
              <MicButton
                listening={listening}
                onToggle={() => setListening((on) => !on)}
              />
            </div>
          ))}
          {/* The real bar, with real dictation (the browser's), to try the recorder. */}
          <div data-testid="buddy-real" className="flex flex-col gap-2">
            <span className="text-type-caption-1 text-sub-text">
              The real bar (dictation uses your microphone):
            </span>
            <FloatingComposer
              working={false}
              onSend={() => {}}
              onOpen={() => {}}
            />
          </div>
          {/* The big ones roam (B3.1j): their faces travel toward the pointer inside this row. */}
          <div data-buddy-frame="" className="flex items-center gap-8 p-6">
            <span
              data-testid="buddy-large"
              className="theme-light rounded-lg bg-surface-primary p-4"
            >
              <LanderMark
                size="lg"
                roam
                mouth={focused}
                listening={listening}
              />
            </span>
            <span
              data-testid="buddy-large-dark"
              className="theme-dark rounded-lg bg-surface-primary p-4"
            >
              <LanderMark
                size="lg"
                roam
                mouth={focused}
                listening={listening}
              />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
