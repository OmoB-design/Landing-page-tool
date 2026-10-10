import Link from "next/link";
import type { ReactNode } from "react";

import { PersonMark } from "@/components/app/mark";
import { CheckIcon } from "@/components/ui/icons";
import type { SetupProgress } from "@/lib/onboarding/progress";
import { cn } from "@/lib/utils";

/**
 * Home's greeting (D67, the reference's "Welcome" page): the person's mark, a serif "Welcome,
 * <first name>", and three getting-started cards with drawings of our own screens. A card shows
 * Done once its step is.
 */
export function Welcome({
  name,
  progress,
}: {
  name: string;
  progress: SetupProgress;
}) {
  const done = (id: string) =>
    progress.steps.find((step) => step.id === id)?.done ?? false;
  const first = name.trim().split(/\s+/)[0] || name;
  return (
    <section aria-labelledby="welcome-title" className="flex flex-col gap-8">
      <div className="flex flex-col gap-5">
        <PersonMark name={name} className="size-9 text-lg" />
        <h1
          id="welcome-title"
          className="font-serif text-display font-normal tracking-tight text-fg"
        >
          Welcome, {first}
        </h1>
      </div>
      <ul role="list" className="grid gap-4 md:grid-cols-3">
        <WelcomeCard
          href="/brands/new"
          lead="Add a brand."
          rest="Paste your store’s address and we read its colours, fonts, voice and products."
          done={done("brand")}
          art={<BrandArt />}
          tint="from-mark-a-soft dark:from-mark-a/35"
        />
        <WelcomeCard
          href="/templates"
          lead="Pick a template."
          rest="Start from a proven page in the library, then rearrange its sections."
          done={done("template")}
          art={<TemplateArt />}
          tint="from-mark-e-soft dark:from-mark-e/35"
        />
        <WelcomeCard
          href="/pages/new"
          lead="Create a page."
          rest="Choose a product and who it’s for. It builds in the background, ready to review."
          done={done("build")}
          art={<PageArt />}
          tint="from-mark-c-soft dark:from-mark-c/35"
        />
      </ul>
    </section>
  );
}

function WelcomeCard({
  href,
  lead,
  rest,
  done,
  art,
  tint,
}: {
  href: string;
  lead: string;
  rest: string;
  done: boolean;
  art: ReactNode;
  tint: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="group flex h-full flex-col overflow-hidden rounded-lg border border-border-strong bg-surface outline-none hover:border-fg-subtle focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div
          aria-hidden
          className={cn(
            "relative flex aspect-16/10 items-end justify-center overflow-hidden bg-linear-to-br to-surface-muted px-6 pt-6",
            tint,
          )}
        >
          {art}
          {done ? (
            <span className="absolute top-3 right-3 flex items-center gap-1 rounded-xs bg-surface px-1.5 py-0.5 text-xs font-medium text-success shadow-control">
              <CheckIcon className="size-3" />
              Done
            </span>
          ) : null}
        </div>
        <p className="px-5 py-4 text-base leading-relaxed text-fg-muted">
          <span className="font-medium text-fg">{lead}</span> {rest}
          {done ? <span className="sr-only"> (done)</span> : null}
        </p>
      </Link>
    </li>
  );
}

// ── Drawings of our own screens (token colours only) ──────────────────────────

/** A window frame: three dots and an address line over the drawing's content. */
function Window({ children }: { children: ReactNode }) {
  return (
    <div className="w-full max-w-60 translate-y-1 rounded-t-md bg-surface shadow-control transition-transform duration-200 ease-out group-hover:translate-y-0 motion-reduce:transition-none">
      <div className="flex items-center gap-1 border-b border-border px-2.5 py-1.5">
        <span className="size-1.5 rounded-full bg-mark-h" />
        <span className="size-1.5 rounded-full bg-warning" />
        <span className="size-1.5 rounded-full bg-success" />
        <span className="ml-2 h-1.5 flex-1 rounded-full bg-surface-muted" />
      </div>
      <div className="flex flex-col gap-2 p-3">{children}</div>
    </div>
  );
}

const Line = ({ className }: { className?: string }) => (
  <span
    className={cn("block h-1.5 rounded-full bg-surface-hover", className)}
  />
);

function BrandArt() {
  return (
    <Window>
      <div className="flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-xs bg-mark-a font-serif text-sm text-white">
          Aa
        </span>
        <Line className="w-20" />
      </div>
      <div className="flex gap-1">
        <span className="size-4 rounded-full bg-mark-a" />
        <span className="size-4 rounded-full bg-mark-d" />
        <span className="size-4 rounded-full bg-mark-c" />
        <span className="size-4 rounded-full border border-border-strong bg-surface-muted" />
      </div>
      <Line className="w-full" />
      <Line className="w-3/4" />
    </Window>
  );
}

function TemplateArt() {
  return (
    <Window>
      <div className="grid grid-cols-2 gap-2">
        {[true, false].map((chosen) => (
          <div
            key={String(chosen)}
            className={cn(
              "flex flex-col gap-1 rounded-xs border p-1.5",
              chosen ? "border-accent ring-1 ring-accent" : "border-border",
            )}
          >
            <span
              className={cn(
                "block h-6 rounded-xs",
                chosen ? "bg-mark-e-soft" : "bg-surface-muted",
              )}
            />
            <Line className="w-full" />
            <Line className="w-2/3" />
          </div>
        ))}
      </div>
    </Window>
  );
}

function PageArt() {
  return (
    <Window>
      <div className="flex items-center">
        {[0, 1, 2, 3].map((step) => (
          <span key={step} className="flex flex-1 items-center last:flex-none">
            <span
              className={cn(
                "flex size-3.5 items-center justify-center rounded-full",
                step < 2
                  ? "bg-success text-white"
                  : step === 2
                    ? "bg-accent"
                    : "border border-border-strong",
              )}
            >
              {step < 2 ? <CheckIcon className="size-2.5" /> : null}
            </span>
            {step < 3 ? (
              <span
                className={cn(
                  "mx-1 h-px flex-1",
                  step < 2 ? "bg-success" : "bg-border-strong",
                )}
              />
            ) : null}
          </span>
        ))}
      </div>
      <span className="block h-1.5 overflow-hidden rounded-full bg-surface-muted">
        <span className="block h-full w-2/3 rounded-full bg-accent" />
      </span>
      <Line className="w-full" />
      <Line className="w-1/2" />
    </Window>
  );
}
