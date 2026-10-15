"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { WizardArrowIcon } from "@/components/ui/lp-icons";
import { Spinner } from "@/components/ui/spinner";
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
import { WizardProgress } from "./progress";
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
    hint: "A proven page to rebrand.",
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

/** Why Next is unavailable on a step (Next's tooltip). */
const NOT_READY: Partial<Record<StepId, string>> = {
  product: "Choose a brand and a product first",
  template: "Choose a template first",
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
 * The create wizard (BUILD_SPEC §9; Figma: Create new page, light and dark). One fixed frame with
 * 0.8 px Surface/Stroke lines: the progress column, the step (its header, the content scrolling
 * under a fixed footer with Back and Next) and the brand dossier, each column scrolling on its own
 * so the frame never grows with what's in it. Every choice lives in the URL (D66), so a refresh or
 * a shared link keeps it.
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

  // A new step starts at the top of its scrolling area (and of the page on small screens, where
  // the frame isn't fixed), with focus on its heading for keyboard and screen-reader users.
  const frame = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    scroller.current?.scrollTo({ top: 0 });
    if ((frame.current?.getBoundingClientRect().top ?? 0) < 0)
      frame.current?.scrollIntoView({ block: "start" });
    heading.current?.focus({ preventScroll: true });
  }, [state.step]);

  // The footer casts its shadow up only while there is more of the step below it.
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const area = scroller.current;
    if (!area) return;
    const measure = () =>
      setOverflow(area.scrollTop + area.clientHeight < area.scrollHeight - 1);
    // Fires once on observe, then whenever the area or the step's content changes size.
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    if (area.firstElementChild) observer.observe(area.firstElementChild);
    area.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      area.removeEventListener("scroll", measure);
    };
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
      ref={frame}
      className="flex flex-col border-(length:--wizard-line) border-stroke bg-surface-primary lg:min-h-120 lg:flex-1 lg:flex-row"
    >
      <WizardProgress state={state} onOpen={open} />

      <section
        aria-labelledby="wizard-step-title"
        className="flex min-w-0 flex-1 flex-col lg:min-h-0"
      >
        <header className="flex min-h-13 shrink-0 items-center border-b-(length:--wizard-line) border-stroke bg-dashboard px-4 py-1.5">
          <div
            key={state.step}
            className="mx-auto flex w-full max-w-175 animate-step-in flex-col gap-1 motion-reduce:animate-none"
          >
            <h2
              id="wizard-step-title"
              ref={heading}
              tabIndex={-1}
              className="text-type-body-small font-medium text-heading-01 outline-none"
            >
              {title}
            </h2>
            <p className="text-type-caption-2 font-medium text-heading-05">
              {hint}
            </p>
          </div>
        </header>

        <div
          ref={scroller}
          className="px-6 pt-6 pb-10 lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
        >
          <div
            key={state.step}
            className="mx-auto w-full max-w-175 animate-step-in motion-reduce:animate-none"
          >
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
          </div>
        </div>

        <footer
          data-overflow={overflow || undefined}
          className="flex h-13 shrink-0 items-center gap-3 border-t-(length:--wizard-line) border-stroke bg-dashboard px-4 transition-shadow duration-200 ease-out data-overflow:shadow-wizard-footer"
        >
          {back ? (
            <Button
              variant="outline"
              size="compact"
              onClick={() => open(back.id)}
              className="h-6.5 gap-1.5 border-stroke-strong px-2.5 text-heading-01 shadow-panel hover:bg-foreground-01"
            >
              <WizardArrowIcon className="-scale-x-100 text-icon-nav-active" />
              Back
            </Button>
          ) : null}
          <div className="ml-auto flex items-center gap-3">
            {buildError ? (
              <p role="alert" className="text-type-caption-1 text-text-danger">
                {buildError}
              </p>
            ) : null}
            {next ? (
              <Button
                size="compact"
                disabled={!ready}
                title={ready ? undefined : NOT_READY[state.step]}
                onClick={() => open(next.id)}
                className="h-6.5 gap-1.5 px-2.5"
              >
                Next
                <WizardArrowIcon className="text-stroke dark:text-icon-nav-active" />
              </Button>
            ) : (
              <Button
                size="compact"
                onClick={build}
                disabled={building}
                className="h-6.5 gap-1.5 px-2.5"
              >
                {building ? <Spinner className="size-3.5" /> : null}
                Build page
              </Button>
            )}
          </div>
        </footer>
      </section>

      <aside
        aria-labelledby="dossier-title"
        className="flex shrink-0 flex-col border-t-(length:--wizard-line) border-stroke bg-surface-modal lg:min-h-0 lg:w-wizard-dossier lg:border-t-0 lg:border-l-(length:--wizard-line)"
      >
        <div className="flex h-13 shrink-0 items-center border-b-(length:--wizard-line) border-stroke bg-dashboard px-4">
          <h2
            id="dossier-title"
            className="text-type-body-small font-medium text-heading-02"
          >
            Brand &amp; product
          </h2>
        </div>
        <div className="flex flex-col gap-2.5 bg-dashboard px-4 pt-6 pb-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto dark:bg-surface-modal">
          <Dossier data={data} state={state} briefing={briefing.status} />
        </div>
      </aside>
    </div>
  );
}
