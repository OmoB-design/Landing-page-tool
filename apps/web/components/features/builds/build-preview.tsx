"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  ExternalLinkIcon,
  MonitorIcon,
  PhoneIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";

type Viewport = "desktop" | "mobile";

/**
 * The built page in a sandboxed frame (no scripts, no access to the app), at desktop width or
 * at a 390 px phone width. `version` changes when the page is rebuilt, so the frame reloads.
 */
export function BuildPreview({
  buildId,
  version,
}: {
  buildId: string;
  version: string;
}) {
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const src = `/preview/${buildId}?v=${encodeURIComponent(version)}`;
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center gap-1">
        {(
          [
            ["desktop", "Desktop", MonitorIcon],
            ["mobile", "Mobile", PhoneIcon],
          ] as const
        ).map(([id, label, ViewIcon]) => (
          <Button
            key={id}
            variant="ghost"
            size="sm"
            aria-pressed={viewport === id}
            onClick={() => setViewport(id)}
            className="h-8 text-sub-text aria-pressed:bg-foreground-03 aria-pressed:text-body"
          >
            <ViewIcon aria-hidden />
            {label}
          </Button>
        ))}
        <Button variant="ghost" size="sm" asChild className="ml-auto h-8">
          <a href={src} target="_blank" rel="noreferrer">
            <ExternalLinkIcon aria-hidden />
            Open in a new tab
          </a>
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 justify-center overflow-hidden rounded-lg border border-stroke bg-surface-primary">
        <iframe
          key={src}
          src={src}
          title="Page preview"
          sandbox=""
          className={cn(
            "h-full border-0 bg-surface-primary",
            viewport === "mobile"
              ? "w-preview-mobile border-x border-stroke"
              : "w-full",
          )}
        />
      </div>
    </div>
  );
}
