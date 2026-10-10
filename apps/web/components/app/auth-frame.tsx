import type { ReactNode } from "react";

import { GridBackground } from "@/components/ui/grid-background";

type AuthFrameProps = {
  title: string;
  description?: string;
  children: ReactNode;
  /** Below the card, e.g. a link to the other auth page. */
  footer?: ReactNode;
};

/** Signed-out pages: product mark, a centred card with a title, and a footer line, over a faint
 * drifting grid (AffectUI grid background). */
export function AuthFrame({
  title,
  description,
  children,
  footer,
}: AuthFrameProps) {
  return (
    <GridBackground className="min-h-dvh bg-dashboard">
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-12 text-body">
        {/* Placeholder name and mark until the product is named (DECISIONS.md O1). */}
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="flex size-6 items-center justify-center rounded-sm bg-body text-type-caption-2 font-semibold text-surface-primary"
          >
            LP
          </span>
          <span className="text-type-body-large font-semibold">
            LP Platform
          </span>
        </div>
        <div className="flex w-full max-w-sm flex-col gap-5 rounded-lg border border-stroke bg-surface-primary p-6">
          <div className="flex flex-col gap-1">
            <h1 className="font-serif text-type-h4 font-normal tracking-tight">
              {title}
            </h1>
            {description ? (
              <p className="text-type-body-small text-sub-text">
                {description}
              </p>
            ) : null}
          </div>
          {children}
        </div>
        {footer ? (
          <div className="text-type-body-small text-sub-text">{footer}</div>
        ) : null}
      </main>
    </GridBackground>
  );
}

/** An underlined text link for auth footers and messages. */
export const authLinkClass =
  "font-medium text-body underline underline-offset-4 hover:text-sub-text";
