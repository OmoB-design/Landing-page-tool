import type { ReactNode } from "react";

type AuthFrameProps = {
  title: string;
  description?: string;
  children: ReactNode;
  /** Below the card, e.g. a link to the other auth page. */
  footer?: ReactNode;
};

/** Signed-out pages: product mark, a centred card with a title, and a footer line. */
export function AuthFrame({
  title,
  description,
  children,
  footer,
}: AuthFrameProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-canvas px-4 py-12 text-fg">
      {/* Placeholder name and mark until the product is named (DECISIONS.md O1). */}
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="flex size-6 items-center justify-center rounded-sm bg-fg text-xs font-semibold text-surface"
        >
          LP
        </span>
        <span className="text-md font-semibold">LP Platform</span>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-5 rounded-lg border border-border bg-surface p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">{title}</h1>
          {description ? (
            <p className="text-base text-fg-muted">{description}</p>
          ) : null}
        </div>
        {children}
      </div>
      {footer ? <div className="text-base text-fg-muted">{footer}</div> : null}
    </main>
  );
}

/** An underlined text link for auth footers and messages. */
export const authLinkClass =
  "font-medium text-fg underline underline-offset-4 hover:text-fg-muted";
