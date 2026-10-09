"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { WizardStepper } from "@/components/app/wizard-stepper";
import { Button } from "@/components/ui/button";
import {
  BackIcon,
  LoadingIcon,
  NextIcon,
  PagesIcon,
} from "@/components/ui/icons";
import { createPage } from "@/lib/builds/actions";
import type { WizardData } from "@/lib/wizard/queries";
import {
  type StepId,
  WIZARD_STEPS,
  type WizardState,
  canOpen,
  parseWizard,
  stepIndex,
  stepReady,
  wizardPayload,
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
 * The create wizard (BUILD_SPEC §9): the step bar across the top, the step with the brand
 * dossier beside it, and Back / Next (Build page on the last step) along the bottom. Every
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

  // A new step starts at the top of the wizard (the step bar in view), with focus on its heading
  // for keyboard and screen-reader users.
  const panel = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if ((panel.current?.getBoundingClientRect().top ?? 0) < 0)
      panel.current?.scrollIntoView({ block: "start" });
    heading.current?.focus({ preventScroll: true });
  }, [state.step]);

  const ready = stepReady(state, state.step);
  const next = WIZARD_STEPS[index + 1];
  const back = WIZARD_STEPS[index - 1];
  const { title, hint } = HEADINGS[state.step];

  // Build page (the last step): the worker creates the build; the build page shows its steps.
  const router = useRouter();
  const [building, startBuilding] = useTransition();
  const [buildError, setBuildError] = useState<string | null>(null);
  const build = () => {
    const payload = wizardPayload(state, briefing.briefing);
    if (!payload) {
      setBuildError("Choose a brand, product and template first.");
      return;
    }
    startBuilding(async () => {
      setBuildError(null);
      const result = await createPage(payload);
      if (result.buildId) router.push(`/pages/${result.buildId}`);
      else setBuildError(result.error ?? "Couldn't start the build.");
    });
  };

  return (
    <div
      ref={panel}
      className="flex scroll-mt-6 flex-col overflow-hidden rounded-lg border border-border bg-surface"
    >
      <div className="border-b border-border px-6 py-4">
        <WizardStepper
          label="Steps"
          current={state.step}
          onSelect={(id) => open(id as StepId)}
          steps={WIZARD_STEPS.map((s, i) => ({
            id: s.id,
            label: s.label,
            done: i < index && stepReady(state, s.id),
            available: canOpen(state, s.id),
          }))}
        />
      </div>
      <div className="flex flex-col lg:flex-row">
        <section
          aria-labelledby="wizard-step-title"
          className="flex min-w-0 flex-1 flex-col gap-5 p-6"
        >
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
            <ReviewStep data={data} state={state} update={update} />
          )}
        </section>
        <div className="shrink-0 border-t border-border bg-canvas p-5 lg:w-wizard-dossier lg:border-t-0 lg:border-l">
          <Dossier data={data} state={state} briefing={briefing.status} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-border px-6 py-3">
        {back ? (
          <Button variant="outline" size="sm" onClick={() => open(back.id)}>
            <BackIcon aria-hidden />
            Back
          </Button>
        ) : null}
        <div className="ml-auto flex items-center gap-3">
          {buildError ? (
            <p role="alert" className="text-sm text-danger">
              {buildError}
            </p>
          ) : !next ? (
            <p className="hidden text-sm text-fg-muted sm:block">
              Builds in the background; you’ll see each step, then the page.
            </p>
          ) : null}
          {next ? (
            <Button size="sm" disabled={!ready} onClick={() => open(next.id)}>
              Next
              <NextIcon aria-hidden />
            </Button>
          ) : (
            <Button size="sm" onClick={build} disabled={building}>
              {building ? (
                <LoadingIcon
                  aria-hidden
                  className="animate-spin motion-reduce:animate-spin-slow"
                />
              ) : (
                <PagesIcon aria-hidden />
              )}
              Build page
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
