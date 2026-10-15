"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { RETURN_TO_KEY } from "@/components/app/remember-path";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { CloseIcon } from "@/components/ui/icons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** Choices that would be lost by leaving (the wizard keeps them in the URL). */
function hasChoices(): boolean {
  const params = new URLSearchParams(window.location.search);
  return ["brand", "product", "template"].some((key) => params.has(key));
}

/**
 * The full-screen Create new page view's header (placeholder until the owner's frame), in the page
 * header's language: 49 px on the panel's 0.5 px line, "New page" in 13 px medium Heading-01 16 px
 * in, and at the right the 32 px close button (× in Icon-System, Foreground-02 on hover,
 * "Close · Esc"). Close and Esc go back to the workspace page you came from; once a brand, product
 * or template is chosen they ask first.
 */
export function CreateHeader() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  // Next keeps a page you leave alive in the background (React Activity) and brings it back as it
  // was, so the dialog must be closed on the way out or it greets the next visit.
  useEffect(() => () => setConfirming(false), []);

  const leave = useCallback(() => {
    setConfirming(false);
    let to = "/pages";
    try {
      to = sessionStorage.getItem(RETURN_TO_KEY) ?? to;
    } catch {
      // Storage blocked: back to Pages.
    }
    router.push(to);
  }, [router]);

  const requestClose = useCallback(() => {
    if (hasChoices()) setConfirming(true);
    else leave();
  }, [leave]);

  // Esc closes the view, unless it's closing a menu or dialog, or you're typing.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [role=menu], [role=dialog]"))
        return;
      if (document.querySelector("[data-radix-popper-content-wrapper]")) return;
      requestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [requestClose]);

  return (
    <header className="flex h-header shrink-0 items-center gap-2 px-3.75 edge-b">
      <h1 className="min-w-0 flex-1 truncate pl-px text-type-body-small font-medium text-heading-01">
        New page
      </h1>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Close"
            onClick={requestClose}
            className="-mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-sm text-icon-system outline-none hover:bg-foreground-02 hover:text-icon-nav-active focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CloseIcon aria-hidden className="size-4" strokeWidth={1.5} />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          Close <kbd className="font-sans text-caption-1">Esc</kbd>
        </TooltipContent>
      </Tooltip>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent
          showCloseButton={false}
          className="flex w-80 flex-col gap-4 rounded-lg bg-surface-modal p-4 shadow-float edge-hairline ring-0"
        >
          <div className="flex flex-col gap-1.5">
            <DialogTitle className="text-type-body-small font-medium text-heading-01">
              Leave page creation?
            </DialogTitle>
            <DialogDescription className="text-type-caption-1 font-medium text-heading-05">
              The choices you’ve made for this page won’t be kept.
            </DialogDescription>
          </div>
          <div className="flex justify-end gap-1.5">
            <Button
              variant="outline"
              size="compact"
              onClick={() => setConfirming(false)}
              className="h-6.5 border-stroke-strong px-2.5 text-heading-01 shadow-panel hover:bg-foreground-01"
            >
              Stay
            </Button>
            <Button size="compact" onClick={leave} className="h-6.5 px-2.5">
              Leave
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}
