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
        <PersonMark name={name} className="size-9 text-type-h6" />
        <h1
          id="welcome-title"
          className="font-serif text-type-h3 font-normal tracking-tight text-body"
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
          tint="from-avatar-a-soft dark:from-avatar-a/35"
        />
        <WelcomeCard
          href="/templates"
          lead="Pick a template."
          rest="Start from a proven page in the library, then rearrange its sections."
          done={done("template")}
          art={<TemplateArt />}
          tint="from-avatar-e-soft dark:from-avatar-e/35"
        />
        <WelcomeCard
          href="/pages/new"
          lead="Create a page."
          rest="Choose a product and who it’s for. It builds in the background, ready to review."
          done={done("build")}
          art={<PageArt />}
          tint="from-avatar-c-soft dark:from-avatar-c/35"
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
        className="group flex h-full flex-col overflow-hidden rounded-lg border border-stroke-strong bg-surface-primary outline-none hover:border-caption-1 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div
          aria-hidden
          className={cn(
            "relative flex aspect-16/10 items-end justify-center overflow-hidden bg-linear-to-br to-foreground-01 px-6 pt-6",
            tint,
          )}
        >
          {art}
          {done ? (
            <span className="absolute top-3 right-3 flex items-center gap-1 rounded-xsm bg-surface-primary px-1.5 py-0.5 text-type-caption-2 font-medium text-text-success shadow-control">
              <CheckIcon className="size-3" />
              Done
            </span>
          ) : null}
        </div>
        <p className="px-5 py-4 text-type-body-small leading-relaxed text-sub-text">
          <span className="font-medium text-body">{lead}</span> {rest}
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
    <div className="w-full max-w-60 translate-y-1 rounded-t-md bg-surface-primary shadow-control transition-transform duration-200 ease-out group-hover:translate-y-0 motion-reduce:transition-none">
      <div className="flex items-center gap-1 border-b border-stroke px-2.5 py-1.5">
        <span className="size-1.5 rounded-full bg-avatar-h" />
        <span className="size-1.5 rounded-full bg-spot-500-yellow" />
        <span className="size-1.5 rounded-full bg-spot-500-green" />
        <span className="ml-2 h-1.5 flex-1 rounded-full bg-foreground-01" />
      </div>
      <div className="flex flex-col gap-2 p-3">{children}</div>
    </div>
  );
}

const Line = ({ className }: { className?: string }) => (
  <span
    className={cn("block h-1.5 rounded-full bg-foreground-02", className)}
  />
);

function BrandArt() {
  return (
    <Window>
      <div className="flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-xsm bg-avatar-a font-serif text-type-caption-1 text-white">
          Aa
        </span>
        <Line className="w-20" />
      </div>
      <div className="flex gap-1">
        <span className="size-4 rounded-full bg-avatar-a" />
        <span className="size-4 rounded-full bg-avatar-d" />
        <span className="size-4 rounded-full bg-avatar-c" />
        <span className="size-4 rounded-full border border-stroke-strong bg-foreground-01" />
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
              "flex flex-col gap-1 rounded-xsm border p-1.5",
              chosen
                ? "border-spot-500-indigo ring-1 ring-spot-500-indigo"
                : "border-stroke",
            )}
          >
            <span
              className={cn(
                "block h-6 rounded-xsm",
                chosen ? "bg-avatar-e-soft" : "bg-foreground-01",
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
                  ? "bg-spot-500-green text-white"
                  : step === 2
                    ? "bg-spot-500-indigo"
                    : "border border-stroke-strong",
              )}
            >
              {step < 2 ? <CheckIcon className="size-2.5" /> : null}
            </span>
            {step < 3 ? (
              <span
                className={cn(
                  "mx-1 h-px flex-1",
                  step < 2 ? "bg-spot-500-green" : "bg-stroke-strong",
                )}
              />
            ) : null}
          </span>
        ))}
      </div>
      <span className="block h-1.5 overflow-hidden rounded-full bg-foreground-01">
        <span className="block h-full w-2/3 rounded-full bg-spot-500-indigo" />
      </span>
      <Line className="w-full" />
      <Line className="w-1/2" />
    </Window>
  );
}
