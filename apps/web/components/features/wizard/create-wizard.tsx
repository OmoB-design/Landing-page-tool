"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { WizardStepper } from "@/components/app/wizard-stepper";
import { Button } from "@/components/ui/button";
import { BackIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import type { WizardData } from "@/lib/wizard/queries";
import {
  type StepId,
  WIZARD_STEPS,
  type WizardState,
  canOpen,
  parseWizard,
  stepIndex,
  stepReady,
  wizardSearch,
} from "@/lib/wizard/state";

import { Dossier } from "./dossier";
import { ReviewStep } from "./review-step";
import {
  AudienceStep,
  EmphasisStep,
  ImageryStep,
  ProductStep,
  TemplateStep,
} from "./steps";
import { useBriefing } from "./use-briefing";

const HEADINGS: Record<StepId, { title: string; hint: string }> = {
  product: {
    title: "Brand & product",
    hint: "Who is this page for? Its real product photos become the product shots.",
  },
  template: {
    title: "Choose a template",
    hint: "A proven page to rebrand. Your own arrangements are under Yours.",
  },
  imagery: {
    title: "Imagery",
    hint: "Generated images for scenes and people, or your product photos only.",
  },
  audience: {
    title: "Audience",
    hint: "Who the page speaks to. The options come from the product’s briefing.",
  },
  emphasis: {
    title: "Emphasis",
    hint: "Up to three of each for the copy to lead with. Leave empty for the desk’s pick.",
  },
  review: {
    title: "Review & build",
    hint: "The full order. It builds in the background, then opens on the page.",
  },
};

/** Keeps the URL's choices consistent with what the org has (a product of the chosen brand, a
 * template that exists) and lands on the first step that still needs something. */
function normalise(state: WizardState, data: WizardData): WizardState {
  const product = data.products.find((p) => p.id === state.product);
  const brand =
    product?.brandId ??
    (data.brands.some((b) => b.id === state.brand) ? state.brand : null);
  const next: WizardState = {
    ...state,
    brand,
    product: product && product.brandId === brand ? product.id : null,
    template: data.templates.some((t) => t.id === state.template)
      ? state.template
      : null,
  };
  if (!canOpen(next, next.step)) {
    next.step =
      WIZARD_STEPS.find((s) => !stepReady(next, s.id))?.id ?? "product";
  }
  return next;
}

/**
 * The create wizard (BUILD_SPEC §9, laid out like the reference tool): the step list on the
 * left, the step in the middle with Back / Continue, and the brand dossier on the right. Every
 * choice lives in the URL (D66), so a refresh or a shared link keeps it.
 */
export function CreateWizard({ data }: { data: WizardData }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fromUrl = (search: string) =>
    normalise(parseWizard(new URLSearchParams(search)), data);
  // Choices show at once from this state and are mirrored into the URL.
  const [state, setState] = useState(() => fromUrl(searchParams.toString()));
  const written = useRef(searchParams.toString());
  const briefing = useBriefing(state.product);
  const heading = useRef<HTMLHeadingElement>(null);

  // The URL changed without us (a link to /pages/new?…, the browser's Back or Forward): follow it.
  const urlKey = searchParams.toString();
  useEffect(() => {
    if (urlKey === written.current) return;
    written.current = urlKey;
    setState(fromUrl(urlKey));
    // fromUrl only depends on data, which is fixed for the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlKey]);
  useEffect(() => {
    const onPop = () => {
      written.current = window.location.search.slice(1);
      setState(fromUrl(written.current));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Step changes add a history entry (so the browser's Back goes back a step); other choices
  // replace the current one.
  const go = (patch: Partial<WizardState>, push = false) => {
    const next = normalise({ ...state, ...patch }, data);
    setState(next);
    written.current = wizardSearch(next);
    window.history[push ? "pushState" : "replaceState"](
      null,
      "",
      `${pathname}?${written.current}`,
    );
  };
  const update = (patch: Partial<WizardState>) => go(patch);
  const index = stepIndex(state.step);
  const open = (step: StepId) => go({ step }, true);

  // Move focus to the new step's heading, for keyboard and screen-reader users.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    heading.current?.focus();
  }, [state.step]);

  const ready = stepReady(state, state.step);
  const next = WIZARD_STEPS[index + 1];
  const back = WIZARD_STEPS[index - 1];
  const { title, hint } = HEADINGS[state.step];

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface lg:flex-row">
      <div className="shrink-0 border-b border-border p-4 lg:w-wizard-steps lg:border-r lg:border-b-0">
        <p className="px-2 text-sm font-medium text-fg-subtle lg:mb-3">
          Create a page
          <span className="lg:hidden">
            {" "}
            · Step {index + 1} of {WIZARD_STEPS.length}
          </span>
        </p>
        <div className="hidden lg:block">
          <WizardStepper
            label="Steps"
            current={state.step}
            onSelect={(id) => open(id as StepId)}
            finalLabel="Build"
            steps={WIZARD_STEPS.map((s, i) => ({
              id: s.id,
              label: s.label,
              done: i < index && stepReady(state, s.id),
              available: canOpen(state, s.id),
            }))}
          />
        </div>
      </div>
      <section
        aria-labelledby="wizard-step-title"
        className="flex min-w-0 flex-1 flex-col"
      >
        <div className="flex flex-1 flex-col gap-5 p-6">
          <div className="flex flex-col gap-1">
            <h2
              id="wizard-step-title"
              ref={heading}
              tabIndex={-1}
              className="text-lg font-semibold outline-none"
            >
              {title}
            </h2>
            <p className="text-sm text-fg-muted">{hint}</p>
          </div>
          {state.step === "product" ? (
            <ProductStep data={data} state={state} update={update} />
          ) : state.step === "template" ? (
            <TemplateStep data={data} state={state} update={update} />
          ) : state.step === "imagery" ? (
            <ImageryStep state={state} update={update} />
          ) : state.step === "audience" ? (
            <AudienceStep state={state} update={update} briefing={briefing} />
          ) : state.step === "emphasis" ? (
            <EmphasisStep state={state} update={update} briefing={briefing} />
          ) : (
            <ReviewStep
              data={data}
              state={state}
              update={update}
              briefing={briefing.briefing}
            />
          )}
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-border px-6 py-3">
          {back ? (
            <Button variant="outline" size="sm" onClick={() => open(back.id)}>
              <BackIcon aria-hidden />
              Back
            </Button>
          ) : (
            <span />
          )}
          <span aria-hidden className="flex items-center gap-1.5">
            {WIZARD_STEPS.map((s, i) => (
              <span
                key={s.id}
                className={cn(
                  "size-1.5 rounded-full",
                  i === index ? "bg-accent" : "bg-border-strong",
                )}
              />
            ))}
          </span>
          {next ? (
            <Button size="sm" disabled={!ready} onClick={() => open(next.id)}>
              Continue
            </Button>
          ) : (
            <span />
          )}
        </div>
      </section>
      <div className="shrink-0 border-t border-border p-5 lg:w-wizard-dossier lg:border-t-0 lg:border-l">
        <Dossier data={data} state={state} briefing={briefing.status} />
      </div>
    </div>
  );
}
