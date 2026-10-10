"use client";

import Link from "next/link";
import { useState } from "react";

import { JobSteps } from "@/components/app/job-steps";
import { OptionCard } from "@/components/app/option-card";
import { TypeGlyph, templateTypeLabel } from "@/components/app/type-glyph";
import { Button } from "@/components/ui/button";
import {
  AnatomyIcon,
  ApertureIcon,
  BrushIcon,
  CameraIcon,
  CheckIcon,
  DiagramIcon,
  type Icon,
  ImageIcon,
  ImageOffIcon,
  PhoneIcon,
  PlusIcon,
  RenderIcon,
  SparklesIcon,
  TemplatesIcon,
  ZoomInIcon,
} from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Briefing } from "@/lib/validators/product";
import type { WizardData } from "@/lib/wizard/queries";
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

// ── 1. Brand & product ──────────────────────────────────────────────────────

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
      <p className="text-type-caption-1 text-sub-text">
        Add a brand first:{" "}
        <Link href="/brands/new" className="underline underline-offset-4">
          New brand
        </Link>
        .
      </p>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1.5 text-type-caption-1 font-medium">
        Brand
        <Select
          value={state.brand ?? ""}
          onValueChange={(brand) => update({ brand, product: null })}
        >
          <SelectTrigger aria-label="Brand" className="h-9 w-full">
            <SelectValue placeholder="Choose a brand" />
          </SelectTrigger>
          <SelectContent>
            {data.brands.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="flex flex-col gap-1.5 text-type-caption-1 font-medium">
        Product
        <Select
          value={state.product ?? ""}
          onValueChange={(product) => update({ product })}
          disabled={!state.brand || products.length === 0}
        >
          <SelectTrigger aria-label="Product" className="h-9 w-full">
            <SelectValue
              placeholder={
                state.brand && products.length === 0
                  ? "No products yet"
                  : "Choose a product"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {products.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      {state.brand && products.length === 0 ? (
        <p className="text-type-caption-1 text-sub-text sm:col-span-2">
          This brand has no products yet.{" "}
          <Link
            href={`/brands/${state.brand}/products`}
            className="underline underline-offset-4"
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

export function TemplateStep({
  data,
  state,
  update,
}: {
  data: WizardData;
  state: WizardState;
  update: Update;
}) {
  const groups = (["Library", "Yours"] as const).filter((g) =>
    data.templates.some((t) => t.group === g),
  );
  if (groups.length === 0)
    return (
      <p className="text-type-caption-1 text-sub-text">
        No templates yet: load the library with pnpm seed:library.
      </p>
    );
  return (
    <div
      role="radiogroup"
      aria-label="Template"
      className="flex flex-col gap-5"
    >
      {groups.map((group) => (
        <section key={group} className="flex flex-col gap-2">
          <h3 className="text-type-caption-1 font-medium text-sub-text">
            {group}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.templates
              .filter((t) => t.group === group)
              .map((t) => (
                <OptionCard
                  key={t.id}
                  type="radio"
                  name="template"
                  value={t.id}
                  checked={state.template === t.id}
                  onChange={() => update({ template: t.id })}
                >
                  <span className="relative aspect-4/3 overflow-hidden border-b border-stroke bg-foreground-01">
                    <TemplatesIcon
                      aria-hidden
                      className="absolute inset-0 m-auto size-6 text-caption-1"
                    />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/thumbs/template/${t.id}`}
                      alt=""
                      loading="lazy"
                      className="relative size-full object-cover object-top"
                    />
                  </span>
                  <span className="flex flex-col gap-1 p-3">
                    <span className="text-type-body-small font-medium">
                      {t.name}
                    </span>
                    <span className="flex items-center gap-2 text-type-caption-1 text-sub-text">
                      <TypeGlyph type={t.type} />
                      {templateTypeLabel(t.type)} · {t.sections} sections
                    </span>
                  </span>
                </OptionCard>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ── 3. Imagery ──────────────────────────────────────────────────────────────

const STYLE_ICONS: Record<ImageStyle, Icon> = {
  editorial: CameraIcon,
  ugc: PhoneIcon,
  studio: ApertureIcon,
  macro: ZoomInIcon,
  illustration: BrushIcon,
  anatomical: AnatomyIcon,
  diagram: DiagramIcon,
  render: RenderIcon,
};

export function ImageryStep({
  state,
  update,
}: {
  state: WizardState;
  update: Update;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div
        role="radiogroup"
        aria-label="Images"
        className="grid gap-3 sm:grid-cols-2"
      >
        {(
          [
            [
              true,
              "Generate images",
              "New scenes and people for the page. Product shots stay your real photos.",
              ImageIcon,
            ],
            [
              false,
              "Product photos only",
              "Use your product photos wherever the page has an image.",
              ImageOffIcon,
            ],
          ] as const
        ).map(([value, title, hint, OptionIcon]) => (
          <OptionCard
            key={title}
            type="radio"
            name="ai"
            value={String(value)}
            checked={state.ai === value}
            onChange={() => update({ ai: value })}
            className="flex-row items-start gap-3 p-3"
          >
            <OptionIcon
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-sub-text"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-type-body-small font-medium">{title}</span>
              <span className="text-type-caption-1 text-sub-text">{hint}</span>
            </span>
          </OptionCard>
        ))}
      </div>
      {state.ai ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-type-body-small font-medium">
              Image styles · pick any
            </h3>
            <p className="text-type-caption-1 text-sub-text">
              The desk picks the best style for each image and favours yours.
              Until image generation is switched on, pages get placeholder
              images; your picks are saved with the page.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {IMAGE_STYLES.map((style) => {
              const StyleIcon = STYLE_ICONS[style.id];
              const checked = state.styles.includes(style.id);
              return (
                <OptionCard
                  key={style.id}
                  type="checkbox"
                  name="style"
                  value={style.id}
                  checked={checked}
                  onChange={(on) =>
                    update({
                      styles: on
                        ? [...state.styles, style.id]
                        : state.styles.filter((s) => s !== style.id),
                    })
                  }
                  className="gap-2 p-3"
                >
                  <span className="flex size-9 items-center justify-center rounded-md bg-foreground-01 text-sub-text">
                    <StyleIcon aria-hidden className="size-4" />
                  </span>
                  <span className="text-type-body-small font-medium">
                    {style.label}
                  </span>
                  <span className="text-type-caption-1 text-sub-text">
                    {style.hint}
                  </span>
                  {checked ? (
                    <CheckIcon
                      aria-hidden
                      className="absolute top-3 right-3 size-4 text-spot-500-indigo"
                    />
                  ) : null}
                </OptionCard>
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
  if (briefing.status === "loading")
    return (
      <p className="text-type-caption-1 text-sub-text">Loading the briefing…</p>
    );
  if (briefing.status === "failed")
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-2 text-type-caption-1"
      >
        <p className="text-text-danger">
          {briefing.error ?? "Couldn't write the briefing."}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={briefing.retry}
        >
          Try again
        </Button>
      </div>
    );
  return (
    <div className="flex flex-col gap-2">
      <p className="text-type-caption-1 text-sub-text">
        Writing this product’s briefing (about 15 seconds, once per product).
        You can continue with the desk’s pick in the meantime.
      </p>
      {briefing.job ? (
        <JobSteps
          title="Writing the briefing"
          steps={BRIEFING_STEPS}
          job={briefing.job}
        />
      ) : null}
    </div>
  );
}

// ── 4. Audience ─────────────────────────────────────────────────────────────

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
        className="grid gap-3 sm:grid-cols-2"
      >
        <OptionCard
          type="radio"
          name="audience"
          value=""
          checked={state.audience === null}
          onChange={() => update({ audience: null })}
          className="gap-1 p-3"
        >
          <span className="flex items-center gap-2 text-type-body-small font-medium">
            <SparklesIcon aria-hidden className="size-4 text-sub-text" />
            Let the desk pick
          </span>
          <span className="text-type-caption-1 text-sub-text">
            Writes for the brand’s usual audience.
          </span>
        </OptionCard>
        {[...audiences, ...saved].map((a) => (
          <OptionCard
            key={a.name}
            type="radio"
            name="audience"
            value={a.name}
            checked={state.audience === a.name}
            onChange={() => update({ audience: a.name })}
            className="gap-1 p-3"
          >
            <span className="text-type-body-small font-medium">{a.name}</span>
            <span className="text-type-caption-1 text-sub-text">
              {a.description}
            </span>
          </OptionCard>
        ))}
      </div>
      {briefing.status !== "ready" ? (
        <BriefingWait briefing={briefing} />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-type-caption-1 font-medium">
            Gender (optional)
          </legend>
          <div className="flex gap-1 rounded-md bg-foreground-01 p-0.5">
            {GENDERS.map((g) => (
              <label
                key={g.id}
                className="flex h-8 flex-1 cursor-pointer items-center justify-center rounded-sm text-type-caption-1 text-sub-text has-checked:bg-surface-primary has-checked:font-medium has-checked:text-body has-checked:shadow-sm has-focus-visible:ring-2 has-focus-visible:ring-ring"
              >
                <input
                  type="radio"
                  name="gender"
                  value={g.id}
                  checked={state.gender === g.id}
                  onChange={() => update({ gender: g.id })}
                  className="sr-only"
                />
                {g.label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex flex-col gap-1.5 text-type-caption-1 font-medium">
          Age (optional)
          <Select
            value={state.age ?? "any"}
            onValueChange={(age) => update({ age: age === "any" ? null : age })}
          >
            <SelectTrigger aria-label="Age" className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any age</SelectItem>
              {AGE_RANGES.map((age) => (
                <SelectItem key={age} value={age}>
                  {age.replace("-", "–")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
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
    <div className="flex flex-col gap-6">
      {briefing.status !== "ready" ? (
        <BriefingWait briefing={briefing} />
      ) : null}
      {EMPHASIS_GROUPS.map((group) => (
        <EmphasisGroup
          key={group.kind}
          {...group}
          options={briefing.briefing?.[group.kind] ?? []}
          chosen={state[group.kind]}
          onChange={(values) => update({ [group.kind]: values })}
        />
      ))}
    </div>
  );
}

function EmphasisGroup({
  kind,
  title,
  hint,
  options,
  chosen,
  onChange,
}: {
  kind: EmphasisKind;
  title: string;
  hint: string;
  options: Briefing[EmphasisKind];
  chosen: string[];
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const full = chosen.length >= MAX_EMPHASIS;
  const own = chosen.filter((value) => !options.includes(value));
  const add = () => {
    const value = draft.trim().replace(/\s+/g, " ");
    if (!value || full || chosen.includes(value)) return;
    onChange([...chosen, value]);
    setDraft("");
  };
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="flex w-full items-baseline justify-between gap-3">
        <span className="text-type-body-small font-medium">{title}</span>
        <span className="text-type-caption-1 text-sub-text tabular-nums">
          {chosen.length} of {MAX_EMPHASIS} · {hint}
        </span>
      </legend>
      <div className="flex flex-col gap-1.5">
        {[...options, ...own].map((option) => {
          const checked = chosen.includes(option);
          return (
            <label
              key={option}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-md bg-foreground-01 px-3 py-2 text-type-caption-1 hover:bg-foreground-02 has-checked:bg-highlight-indigo-50 has-focus-visible:ring-2 has-focus-visible:ring-ring",
                !checked && full && "cursor-not-allowed opacity-50",
              )}
            >
              <input
                type="checkbox"
                name={kind}
                value={option}
                checked={checked}
                disabled={!checked && full}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...chosen, option]
                      : chosen.filter((v) => v !== option),
                  )
                }
                className="mt-0.5 size-4 shrink-0 accent-spot-500-indigo"
              />
              <span className="min-w-0 flex-1">{option}</span>
              {own.includes(option) ? (
                <span className="shrink-0 text-caption-1">Yours</span>
              ) : null}
            </label>
          );
        })}
      </div>
      <div className="flex gap-2">
        <Input
          aria-label={`Add your own ${title.toLowerCase().replace(/s$/, "")}`}
          placeholder={`Add your own ${title.toLowerCase().replace(/s$/, "")}`}
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
          className="h-8"
        />
        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0"
          disabled={full || !draft.trim()}
          onClick={add}
        >
          <PlusIcon aria-hidden />
          Add
        </Button>
      </div>
    </fieldset>
  );
}
