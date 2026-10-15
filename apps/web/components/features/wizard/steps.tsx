"use client";

import Link from "next/link";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

import { JobSteps } from "@/components/app/job-steps";
import { SelectField } from "@/components/app/select-field";
import { SkeletonText } from "@/components/app/skeletons";
import { TypeGlyph, templateTypeLabel } from "@/components/app/type-glyph";
import { Button } from "@/components/ui/button";
import { TemplatesIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import {
  AddPlusIcon,
  CheckboxCheckedFigmaIcon,
  CheckboxFigmaIcon,
  CheckboxTickedFigmaIcon,
  ImageOptionIcon,
  StyleApertureIcon,
  StyleBrushIcon,
  StyleCameraIcon,
  StyleCubeIcon,
  StyleDiagramIcon,
  StyleFigureIcon,
  StylePhoneIcon,
  StyleZoomIcon,
} from "@/components/ui/lp-icons";
import { cn } from "@/lib/utils";
import type { Briefing } from "@/lib/validators/product";
import type { WizardData, WizardTemplate } from "@/lib/wizard/queries";
import {
  AGE_RANGES,
  type EmphasisKind,
  GENDERS,
  IMAGE_STYLES,
  type ImageStyle,
  MAX_EMPHASIS,
  MAX_EMPHASIS_CHARS,
  type WizardState,
} from "@/lib/wizard/state";

import type { useBriefing } from "./use-briefing";

type Update = (patch: Partial<WizardState>) => void;

// ── Shared ──────────────────────────────────────────────────────────────────

/**
 * An option card (Figma: Create new page, Imagery and Audience): 12 px in with 10 px corners on
 * Surface-Primary and a 1 px Surface/Stroke line, Stroke-Strong on hover, a 2 px Spot-500-Blue
 * line when chosen. Drawn as inset rings, so choosing one moves nothing.
 */
function ChoiceCard({
  type,
  name,
  value,
  checked,
  onChange,
  className,
  children,
}: {
  type: "radio" | "checkbox";
  name: string;
  value: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        "relative flex cursor-pointer flex-col rounded-lg bg-surface-primary p-3 ring-1 ring-stroke transition-shadow duration-150 ease-out ring-inset not-has-checked:hover:ring-stroke-strong has-checked:ring-2 has-checked:ring-spot-500-blue has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-spot-500-blue/40",
        className,
      )}
    >
      <input
        type={type}
        name={name}
        value={value}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="sr-only"
      />
      {children}
    </label>
  );
}

/** The 25 px tile an option card's icon sits on, 5 px corners. */
function IconTile({
  tone,
  children,
}: {
  tone: "strong" | "soft";
  children: ReactNode;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-6.25 shrink-0 items-center justify-center rounded-icon text-icon-system",
        tone === "strong"
          ? "bg-foreground-03 dark:bg-foreground-02"
          : "bg-foreground-01",
      )}
    >
      {children}
    </span>
  );
}

// ── 1. Brand & product ──────────────────────────────────────────────────────

/** Brand and Product as the Input Field's dropdown, 16 px apart. */
export function ProductStep({
  data,
  state,
  update,
}: {
  data: WizardData;
  state: WizardState;
  update: Update;
}) {
  const products = data.products.filter((p) => p.brandId === state.brand);
  if (data.brands.length === 0) {
    return (
      <p className="text-type-caption-1 font-medium text-heading-05">
        Add a brand first:{" "}
        <Link
          href="/brands/new"
          className="text-heading-01 underline underline-offset-2 hover:text-sub-text"
        >
          New brand
        </Link>
        .
      </p>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectField
        label="Brand"
        placeholder="Choose a brand"
        value={state.brand}
        options={data.brands.map((b) => ({ value: b.id, label: b.name }))}
        onValueChange={(brand) => update({ brand, product: null })}
      />
      <SelectField
        label="Product"
        placeholder={
          state.brand && products.length === 0
            ? "No products yet"
            : "Choose a product"
        }
        value={state.product}
        options={products.map((p) => ({ value: p.id, label: p.name }))}
        onValueChange={(product) => update({ product })}
        disabled={!state.brand || products.length === 0}
      />
      {state.brand && products.length === 0 ? (
        <p className="text-type-caption-1 font-medium text-heading-05 sm:col-span-2">
          This brand has no products yet.{" "}
          <Link
            href={`/brands/${state.brand}/products`}
            className="text-heading-01 underline underline-offset-2 hover:text-sub-text"
          >
            Add one
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}

// ── 2. Template ─────────────────────────────────────────────────────────────

type Group = WizardTemplate["group"];

/**
 * Library / Yours as underline tabs on a 0.7 px line (13 px medium, Heading-01 when current,
 * Heading-04 otherwise (Heading-05 in dark), the 2 px Tab-Indicator under the current one sliding
 * across), then the 270 px cards 10 px apart, centred under the tabs (owner).
 */
export function TemplateStep({
  data,
  state,
  update,
}: {
  data: WizardData;
  state: WizardState;
  update: Update;
}) {
  const chosenGroup = data.templates.find(
    (t) => t.id === state.template,
  )?.group;
  const [group, setGroup] = useState<Group>(chosenGroup ?? "Library");
  const templates = data.templates.filter((t) => t.group === group);
  return (
    // Figma: the cards start 34 px under the tabs' line.
    <div className="flex flex-col gap-8.5">
      <GroupTabs active={group} onChange={setGroup} />
      {templates.length === 0 ? (
        <p className="py-10 text-center text-type-caption-1 font-medium text-heading-05">
          {group === "Yours"
            ? "No templates of your own yet. Choose Use Template on a library template to add one."
            : "The library is empty: load it with pnpm seed:library."}
        </p>
      ) : (
        <div
          role="radiogroup"
          aria-label={`${group} templates`}
          className="flex flex-wrap justify-center gap-2.5"
        >
          {templates.map((template) => (
            <TemplatePick
              key={template.id}
              template={template}
              checked={state.template === template.id}
              onChoose={() => update({ template: template.id })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const GROUPS: Group[] = ["Library", "Yours"];

function GroupTabs({
  active,
  onChange,
}: {
  active: Group;
  onChange: (group: Group) => void;
}) {
  const tabs = useRef<Partial<Record<Group, HTMLButtonElement>>>({});
  const [line, setLine] = useState<{ x: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const tab = tabs.current[active];
    if (!tab) return;
    const measure = () =>
      setLine({ x: tab.offsetLeft, width: tab.offsetWidth });
    measure();
  }, [active]);
  return (
    <div
      role="tablist"
      aria-label="Templates"
      className="relative flex h-9 items-center gap-8 divider-b-thin"
    >
      {GROUPS.map((group) => {
        const current = group === active;
        return (
          <button
            key={group}
            ref={(element) => {
              if (element) tabs.current[group] = element;
            }}
            type="button"
            role="tab"
            aria-selected={current}
            onClick={() => onChange(group)}
            className={cn(
              "relative flex h-full items-center text-type-body-small font-medium transition-colors duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring",
              current
                ? "text-heading-01"
                : "text-heading-04 hover:text-heading-01 dark:text-heading-05",
            )}
          >
            {group}
            {current && line === null ? (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-tab-indicator" />
            ) : null}
          </button>
        );
      })}
      {line ? (
        <span
          aria-hidden
          className="absolute bottom-0 left-0 h-0.5 bg-tab-indicator transition-slide motion-reduce:transition-none"
          // Under the current tab (measured).
          style={{ translate: `${line.x}px 0`, width: line.width }}
        />
      ) : null}
    </div>
  );
}

/**
 * A template card (Figma: Create new page card, Default and Selected): 270 px with 18 px corners
 * and the frame edge; the 220 px picture well on Foreground-01 with its 1 px line and 14 px bottom
 * corners, the page's screenshot 16 px in; then 10 px in, the name in 13 px medium and the type
 * and section count in 11 px Heading-04. Chosen, a 2 px Spot-500-Blue line draws over it.
 */
function TemplatePick({
  template,
  checked,
  onChoose,
}: {
  template: WizardTemplate;
  checked: boolean;
  onChoose: () => void;
}) {
  return (
    <label className="group/card frame-stroke relative flex w-67.5 cursor-pointer flex-col overflow-hidden rounded-card bg-surface-primary has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-spot-500-blue/40">
      <input
        type="radio"
        name="template"
        value={template.id}
        checked={checked}
        onChange={onChoose}
        className="sr-only"
      />
      <span className="flex h-55 shrink-0 overflow-hidden rounded-b-well border-b border-stroke bg-foreground-01 p-4">
        <span className="relative flex-1 overflow-hidden template-shot">
          <TemplatesIcon
            aria-hidden
            className="absolute inset-0 m-auto size-6 text-caption-1"
          />
          {/* Thumbnails come from private storage through an authenticated route. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/thumbs/template/${template.id}`}
            alt=""
            loading="lazy"
            className="relative size-full object-cover object-top"
          />
        </span>
      </span>
      <span className="flex flex-col gap-1.5 px-2.5 pt-2.5 pb-3">
        <span className="truncate text-type-body-small font-medium text-heading-01">
          {template.name}
        </span>
        <span className="flex items-center gap-1.5 text-type-caption-2 text-heading-04">
          <TypeGlyph type={template.type} size="card" />
          <span className="flex items-center gap-1">
            {templateTypeLabel(template.type)}
            <span aria-hidden className="size-0.75 rounded-full bg-meta-dot" />
            {template.sections}{" "}
            {template.sections === 1 ? "section" : "sections"}
          </span>
        </span>
      </span>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-card opacity-0 ring-2 ring-spot-500-blue transition-opacity duration-150 ease-out ring-inset group-has-checked/card:opacity-100"
      />
    </label>
  );
}

// ── 3. Imagery ──────────────────────────────────────────────────────────────

/** The style cards' titles (shorter than the labels the dossier and review use) and icons. */
const STYLE_CARDS: Record<ImageStyle, { title: string; icon: ReactNode }> = {
  editorial: {
    title: "Editorial",
    icon: <StyleCameraIcon className="size-3.5" />,
  },
  ugc: { title: "UGC", icon: <StylePhoneIcon /> },
  studio: { title: "Studio", icon: <StyleApertureIcon /> },
  macro: { title: "Macro close-up", icon: <StyleZoomIcon /> },
  illustration: { title: "Editorial illustration", icon: <StyleBrushIcon /> },
  anatomical: { title: "Anatomical explainer", icon: <StyleFigureIcon /> },
  diagram: { title: "Instructional diagram", icon: <StyleDiagramIcon /> },
  render: { title: "3D render", icon: <StyleCubeIcon /> },
};

const IMAGE_MODES = [
  {
    value: true,
    title: "Generate images",
    hint: "New scenes and people for the page. Product shots stay your real photos.",
  },
  {
    value: false,
    title: "Product photos only",
    hint: "Use your product photos wherever the page has an image.",
  },
] as const;

/**
 * Generate images or product photos only (two cards, 10 px apart, the icon on a Foreground-03
 * tile, 13 px medium title, 11 px Heading-05 line), then the styles: "Image styles · pick any" in
 * 13 px medium with an 11 px line, and three cards to a row (Foreground-01 tile, 12 px title,
 * 10 px line).
 */
export function ImageryStep({
  state,
  update,
}: {
  state: WizardState;
  update: Update;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div role="radiogroup" aria-label="Images" className="flex gap-2.5">
        {IMAGE_MODES.map((mode) => (
          <ChoiceCard
            key={mode.title}
            type="radio"
            name="ai"
            value={String(mode.value)}
            checked={state.ai === mode.value}
            onChange={() => update({ ai: mode.value })}
            className="flex-1 gap-1"
          >
            <IconTile tone="strong">
              <ImageOptionIcon />
            </IconTile>
            <span className="text-type-body-small font-medium text-heading-01">
              {mode.title}
            </span>
            <span className="text-type-caption-2 font-medium text-heading-05">
              {mode.hint}
            </span>
          </ChoiceCard>
        ))}
      </div>
      {state.ai ? (
        <section
          aria-labelledby="image-styles"
          className="flex flex-col gap-2.5"
        >
          <div className="flex flex-col gap-1">
            <h3
              id="image-styles"
              className="flex items-center gap-1.5 text-type-body-small font-medium text-heading-01"
            >
              Image styles
              <span aria-hidden className="size-1 rounded-full bg-meta-dot" />
              pick any
            </h3>
            <p className="text-type-caption-2 font-medium text-heading-05">
              The desk picks the best style for each image and favours yours.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {IMAGE_STYLES.map((style) => {
              const card = STYLE_CARDS[style.id];
              return (
                <ChoiceCard
                  key={style.id}
                  type="checkbox"
                  name="style"
                  value={style.id}
                  checked={state.styles.includes(style.id)}
                  onChange={(on) =>
                    update({
                      styles: on
                        ? [...state.styles, style.id]
                        : state.styles.filter((s) => s !== style.id),
                    })
                  }
                  className="gap-1"
                >
                  <IconTile tone="soft">{card.icon}</IconTile>
                  <span className="text-type-caption-1 font-medium text-heading-01">
                    {card.title}
                  </span>
                  <span className="text-type-caption-3 font-medium text-heading-05">
                    {style.hint}
                  </span>
                </ChoiceCard>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

// ── Briefing status (Audience and Emphasis) ─────────────────────────────────

const BRIEFING_STEPS = [
  { id: "read", label: "Read the product" },
  { id: "write", label: "Write the briefing" },
];

function BriefingWait({
  briefing,
}: {
  briefing: ReturnType<typeof useBriefing>;
}) {
  // Loading a stored briefing: its audiences and options show as skeletons where they go.
  if (briefing.status === "loading") return null;
  if (briefing.status === "failed")
    return (
      <div role="alert" className="flex flex-col items-start gap-2">
        <p className="text-type-caption-1 font-medium text-text-danger">
          {briefing.error ?? "Couldn't write the briefing."}
        </p>
        <Button
          variant="outline"
          size="compact"
          onClick={briefing.retry}
          className="h-6.5 border-stroke-strong px-2.5 text-heading-01 shadow-panel hover:bg-foreground-01"
        >
          Try again
        </Button>
      </div>
    );
  return (
    <div className="flex flex-col gap-3">
      <p className="text-type-caption-1 font-medium text-heading-05">
        Writing this product’s briefing (about 15 seconds, once per product).
        You can continue with the desk’s pick in the meantime.
      </p>
      {briefing.job ? (
        <JobSteps
          title="Writing the briefing"
          steps={BRIEFING_STEPS}
          job={briefing.job}
          className="w-75 [&_.ui-progress]:pb-6.5"
        />
      ) : null}
    </div>
  );
}

// ── 4. Audience ─────────────────────────────────────────────────────────────

/**
 * Let the desk pick and the briefing's audiences, two to a row 10 px apart (13 px medium title,
 * 11 px Heading-05 line), then Gender and Age as dropdowns.
 */
export function AudienceStep({
  state,
  update,
  briefing,
}: {
  state: WizardState;
  update: Update;
  briefing: ReturnType<typeof useBriefing>;
}) {
  const audiences = briefing.briefing?.audiences ?? [];
  // An audience saved in the URL that the current briefing no longer has still shows.
  const saved =
    state.audience && !audiences.some((a) => a.name === state.audience)
      ? [{ name: state.audience, description: "From your earlier choice." }]
      : [];
  return (
    <div className="flex flex-col gap-6">
      <div
        role="radiogroup"
        aria-label="Audience"
        className="grid gap-2.5 sm:grid-cols-2"
      >
        <ChoiceCard
          type="radio"
          name="audience"
          value=""
          checked={state.audience === null}
          onChange={() => update({ audience: null })}
          className="gap-1"
        >
          <IconTile tone="strong">
            <ImageOptionIcon />
          </IconTile>
          <span className="text-type-body-small font-medium text-heading-01">
            Let the desk pick
          </span>
          <span className="text-type-caption-2 font-medium text-heading-05">
            Writes for the brand’s usual audience.
          </span>
        </ChoiceCard>
        {[...audiences, ...saved].map((a) => (
          <ChoiceCard
            key={a.name}
            type="radio"
            name="audience"
            value={a.name}
            checked={state.audience === a.name}
            onChange={() => update({ audience: a.name })}
            className="gap-1"
          >
            <span className="text-type-body-small font-medium text-heading-01">
              {a.name}
            </span>
            <span className="text-type-caption-2 font-medium text-heading-05">
              {a.description}
            </span>
          </ChoiceCard>
        ))}
        {briefing.status === "loading"
          ? [168, 140, 188].map((width) => (
              <div
                key={width}
                aria-hidden
                className="flex flex-col gap-1 rounded-lg p-3 ring-1 ring-stroke ring-inset"
              >
                <SkeletonText className="text-type-body-small" width={width} />
                <SkeletonText className="text-type-caption-2" width="100%" />
                <SkeletonText className="text-type-caption-2" width="70%" />
              </div>
            ))
          : null}
      </div>
      {briefing.status !== "ready" ? (
        <BriefingWait briefing={briefing} />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Gender (optional)"
          placeholder="Anyone"
          value={state.gender}
          options={GENDERS.map((g) => ({ value: g.id, label: g.label }))}
          onValueChange={(gender) =>
            update({ gender: gender as WizardState["gender"] })
          }
        />
        <SelectField
          label="Age (optional)"
          placeholder="Any age"
          value={state.age ?? "any"}
          options={[
            { value: "any", label: "Any age" },
            ...AGE_RANGES.map((age) => ({
              value: age,
              label: age.replace("-", "–"),
            })),
          ]}
          onValueChange={(age) => update({ age: age === "any" ? null : age })}
        />
      </div>
    </div>
  );
}

// ── 5. Emphasis ─────────────────────────────────────────────────────────────

const EMPHASIS_GROUPS: { kind: EmphasisKind; title: string; hint: string }[] = [
  { kind: "benefits", title: "Benefits", hint: "What the page leads with." },
  { kind: "features", title: "Features", hint: "Facts the page should show." },
  {
    kind: "objections",
    title: "Objections",
    hint: "Doubts the page should answer.",
  },
];

/** Benefits, Features and Objections, 32 px apart, 16 px down. */
export function EmphasisStep({
  state,
  update,
  briefing,
}: {
  state: WizardState;
  update: Update;
  briefing: ReturnType<typeof useBriefing>;
}) {
  return (
    <div className="flex flex-col gap-8 pt-4">
      {briefing.status !== "ready" ? (
        <BriefingWait briefing={briefing} />
      ) : null}
      {EMPHASIS_GROUPS.map((group) => (
        <EmphasisGroup
          key={group.kind}
          {...group}
          options={briefing.briefing?.[group.kind] ?? []}
          loading={briefing.status === "loading"}
          chosen={state[group.kind]}
          onChange={(values) => update({ [group.kind]: values })}
        />
      ))}
    </div>
  );
}

/**
 * One emphasis list (Figma: Emphasis selector, Default and Selected): the title in 13 px medium
 * Heading-03 with "n of 3 · what it's for" in 12 px Heading-04 opposite, then the options 12 px
 * apart: a 14 px checkbox 6 px from the line in 12 px medium (Heading-06; chosen, Heading-02 on
 * Foreground-02 with a 1 px Spot-500-Blue line, Overlay with 0.7 px in dark), then your own line
 * and Add, both 34 px as drawn.
 */
function EmphasisGroup({
  kind,
  title,
  hint,
  options,
  loading,
  chosen,
  onChange,
}: {
  kind: EmphasisKind;
  title: string;
  hint: string;
  options: Briefing[EmphasisKind];
  /** The stored briefing is still loading: its options show as skeleton rows. */
  loading: boolean;
  chosen: string[];
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const full = chosen.length >= MAX_EMPHASIS;
  const own = chosen.filter((value) => !options.includes(value));
  const noun = title.toLowerCase().replace(/s$/, "");
  const add = () => {
    const value = draft.trim().replace(/\s+/g, " ");
    if (!value || full || chosen.includes(value)) return;
    onChange([...chosen, value]);
    setDraft("");
  };
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="flex w-full items-baseline justify-between gap-3 pb-3">
        <span className="text-type-body-small font-medium text-heading-03">
          {title}
        </span>
        <span className="text-type-caption-1 text-heading-04 tabular-nums">
          {chosen.length} of {MAX_EMPHASIS} · {hint}
        </span>
      </legend>
      <div className="flex flex-col gap-3">
        {loading
          ? ["82%", "64%", "74%"].map((width) => (
              <div
                key={width}
                aria-hidden
                className="flex items-center gap-1.5"
              >
                <CheckboxFigmaIcon className="shrink-0 text-icon-system" />
                <span className="flex-1 px-1.5 py-1.5">
                  <SkeletonText className="text-type-caption-1" width={width} />
                </span>
              </div>
            ))
          : null}
        {[...options, ...own].map((option) => {
          const checked = chosen.includes(option);
          const disabled = !checked && full;
          return (
            <label
              key={option}
              className={cn(
                "group/option flex items-center gap-1.5",
                disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
              )}
            >
              <input
                type="checkbox"
                name={kind}
                value={option}
                checked={checked}
                disabled={disabled}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...chosen, option]
                      : chosen.filter((v) => v !== option),
                  )
                }
                className="peer sr-only"
              />
              <span
                aria-hidden
                className="relative size-3.5 shrink-0 rounded-xsm peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-spot-500-blue/40"
              >
                <CheckboxFigmaIcon
                  className={cn(
                    "absolute inset-0 text-icon-system transition-opacity duration-150 ease-out",
                    checked && "opacity-0",
                  )}
                />
                {/* Checked: filled Button-Primary in light, an outlined tick in dark (the frames). */}
                <CheckboxCheckedFigmaIcon
                  className={cn(
                    "absolute inset-0 transition-opacity duration-150 ease-out dark:hidden",
                    !checked && "opacity-0",
                  )}
                />
                <CheckboxTickedFigmaIcon
                  className={cn(
                    "absolute inset-0 hidden text-icon-nav-active transition-opacity duration-150 ease-out dark:block",
                    !checked && "opacity-0",
                  )}
                />
              </span>
              <span
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1.5 text-type-caption-1 font-medium transition duration-150 ease-out",
                  checked
                    ? "bg-foreground-02 text-heading-02 ring-1 ring-spot-500-blue ring-inset dark:bg-overlay dark:ring-thin"
                    : "text-heading-06",
                  !checked &&
                    !disabled &&
                    "group-hover/option:bg-foreground-01",
                )}
              >
                <span className="min-w-0 flex-1">{option}</span>
                {own.includes(option) ? (
                  <span className="shrink-0 text-caption-1">Yours</span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
      <div className="flex gap-2.5 pt-4">
        <Input
          aria-label={`Add your own ${noun}`}
          placeholder={`Add your own ${noun}`}
          value={draft}
          maxLength={MAX_EMPHASIS_CHARS}
          disabled={full}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          className="h-8.5 rounded-md py-2"
        />
        <Button
          variant="outline"
          size="compact"
          disabled={full || !draft.trim()}
          onClick={add}
          className="h-8.5 shrink-0 gap-1.5 border-stroke px-4 text-heading-01 shadow-panel hover:bg-foreground-01 dark:border-stroke-strong"
        >
          <AddPlusIcon className="text-icon-nav-active" />
          Add
        </Button>
      </div>
    </fieldset>
  );
}
