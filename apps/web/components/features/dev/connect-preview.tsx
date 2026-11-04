"use client";

import { useState } from "react";

import { ConnectScene } from "@/components/app/illustrations/connect";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/*
 * /dev/illustrations (development only): the connect pictures (I4) at the top of a modal-width
 * card, as the Connect Vercel and Connect a Shopify store modals show them, in light and dark,
 * with Replay. The real modals are in Settings → Connections and the published modal.
 */

const MODALS = [
  {
    service: "vercel",
    title: "Connect Vercel",
    line: "Pages are published to this account, one project per brand.",
  },
  {
    service: "shopify",
    title: "Connect a Shopify store",
    line: "Pages go to the store as drafts. One store per brand.",
  },
] as const;

export function ConnectPreview() {
  const [run, setRun] = useState(0);
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h2 className="text-type-body-large font-medium text-heading-01">
          Connect pictures (I4)
        </h2>
        <Button
          variant="secondary"
          size="compact"
          onClick={() => setRun((n) => n + 1)}
        >
          Replay
        </Button>
      </div>
      {(["light", "dark"] as const).map((theme) => (
        <div
          key={`${theme}-${run}`}
          className={cn(
            "flex flex-wrap gap-4 rounded-card bg-dashboard p-4 edge",
            theme === "dark" && "dark",
          )}
        >
          {MODALS.map((modal) => (
            <div
              key={modal.service}
              className="flex w-full max-w-md flex-col items-center gap-3 rounded-lg bg-surface-modal px-6 pt-8 pb-6 text-center edge"
            >
              <ConnectScene service={modal.service} />
              <div className="flex flex-col gap-1">
                <p className="text-type-body-small font-medium text-heading-01">
                  {modal.title}
                </p>
                <p className="text-type-caption-1 text-heading-05">
                  {modal.line}
                </p>
              </div>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
