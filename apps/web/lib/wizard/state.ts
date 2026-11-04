import type { Briefing } from "@/lib/validators/product";

// The create wizard's state (BUILD_SPEC §9, D66). It lives in the URL, so a refresh or a shared
// link keeps every choice; this module turns it into search params and back, and into the build
// payload. Pure.

export const WIZARD_STEPS = [
  { id: "product", label: "Brand & product" },
  { id: "template", label: "Template" },
  { id: "competitors", label: "Competitors" },
  { id: "imagery", label: "Imagery" },
  { id: "audience", label: "Audience" },
  { id: "emphasis", label: "Emphasis" },
  { id: "review", label: "Review & build" },
] as const;
export type StepId = (typeof WIZARD_STEPS)[number]["id"];

/** The steps the wizard shows: Competitors only for a Top 5 ranking template (B2.4a). */
export function wizardSteps(ranking: boolean) {
  return ranking
    ? WIZARD_STEPS
    : WIZARD_STEPS.filter((step) => step.id !== "competitors");
}

/** A Top 5 ranking compares four competitors, at ranks #2 to #5 (BUILD_SPEC §8.7). */
export const COMPETITOR_SLOTS = 4;
export const MAX_URL_CHARS = 2000;
export type Naming = "neutral" | "real";
const URL_LIKE = /^(https?:\/\/)?[^\s/]+\.[^\s]+$/i;

/** The address the same as another, whatever its scheme or trailing slash. */
const urlKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");

/** Why a competitor's address can't be used yet, or null when it can. */
export function competitorProblem(
  urls: string[],
  index: number,
): string | null {
  const value = urls[index]?.trim() ?? "";
  if (!value) return "Add a competitor’s product page";
  if (!URL_LIKE.test(value) || value.length > MAX_URL_CHARS)
    return "Enter a page address, e.g. https://brand.com/products/name";
  if (urls.slice(0, index).some((other) => urlKey(other) === urlKey(value)))
    return "This page is already in the ranking";
  return null;
}
export const IMAGE_STYLES = [
  {
    id: "editorial",
    label: "Editorial photo",
    hint: "Documentary, natural light",
  },
  { id: "ugc", label: "UGC style", hint: "Phone-shot, real-person energy" },
  { id: "studio", label: "Studio", hint: "Clean set, controlled light" },
  { id: "macro", label: "Macro close-up", hint: "Texture and detail" },
  {
    id: "illustration",
    label: "Editorial illustration",
    hint: "Drawn, warm, human",
  },
  {
    id: "anatomical",
    label: "Anatomical explainer",
    hint: "How it works, inside the body",
  },
  {
    id: "diagram",
    label: "Instructional diagram",
    hint: "Steps, numbered, didactic",
  },
  { id: "render", label: "3D render", hint: "Molecular or abstract depth" },
] as const;
export type ImageStyle = (typeof IMAGE_STYLES)[number]["id"];

export const AUTHOR_TYPES = [
  {
    id: "writer",
    label: "Article writer",
    hint: "A writer who tried the product and reports on it.",
  },
  {
    id: "customer",
    label: "Customer",
    hint: "A customer telling their own story.",
  },
  {
    id: "influencer",
    label: "Influencer",
    hint: "A creator recommending it to their followers.",
  },
  {
    id: "expert",
    label: "Expert",
    hint: "An expert's voice that never claims credentials: no titles, degrees or licences.",
  },
] as const;
export type AuthorType = (typeof AUTHOR_TYPES)[number]["id"];

export const GENDERS = [
  { id: "any", label: "Anyone" },
  { id: "women", label: "Women" },
  { id: "men", label: "Men" },
] as const;
export type Gender = (typeof GENDERS)[number]["id"];

export const AGE_RANGES = [
  "18-24",
  "25-34",
  "35-44",
  "45-54",
  "55-64",
  "65+",
] as const;

export const MAX_EMPHASIS = 3;
export const MAX_EMPHASIS_CHARS = 200;
export type EmphasisKind = "benefits" | "features" | "objections";

export type WizardState = {
  step: StepId;
  brand: string | null;
  product: string | null;
  template: string | null;
  ai: boolean;
  styles: ImageStyle[];
  /** An audience's name from the briefing; null lets the desk pick. */
  audience: string | null;
  gender: Gender;
  age: string | null;
  benefits: string[];
  features: string[];
  objections: string[];
  author: AuthorType;
  /** The chosen template is a Top 5 ranking (set from the templates, not kept in the URL). */
  ranking: boolean;
  /** Ranks #2 to #5, in order: product page addresses (empty until filled). */
  competitors: string[];
  naming: Naming;
};

const UUID = /^[0-9a-f-]{36}$/i;
const PARAM: Record<EmphasisKind, string> = {
  benefits: "benefit",
  features: "feature",
  objections: "objection",
};

type Params = Pick<URLSearchParams, "get" | "getAll">;

const oneOf = <T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T,
): T => (allowed.includes(value as T) ? (value as T) : fallback);

const list = (values: string[], max: number) =>
  [
    ...new Set(
      values
        .map((v) => v.trim().slice(0, MAX_EMPHASIS_CHARS))
        .filter((v) => v.length > 0),
    ),
  ].slice(0, max);

/** The wizard's state from search params; anything invalid falls back to its default. */
export function parseWizard(params: Params): WizardState {
  const id = (name: string) => {
    const value = params.get(name);
    return value && UUID.test(value) ? value : null;
  };
  return {
    step: oneOf(
      params.get("step"),
      WIZARD_STEPS.map((s) => s.id),
      "product",
    ),
    ranking: false,
    competitors: Array.from(
      { length: COMPETITOR_SLOTS },
      (_, i) =>
        params
          .get(`c${i + 2}`)
          ?.trim()
          .slice(0, MAX_URL_CHARS) ?? "",
    ),
    naming: oneOf(
      params.get("naming"),
      ["neutral", "real"] as const,
      "neutral",
    ),
    brand: id("brand"),
    product: id("product"),
    template: id("template"),
    ai: params.get("ai") !== "0",
    styles: list(params.getAll("style"), IMAGE_STYLES.length).filter(
      (s): s is ImageStyle => IMAGE_STYLES.some((style) => style.id === s),
    ),
    audience: params.get("audience")?.trim().slice(0, 120) || null,
    gender: oneOf(
      params.get("gender"),
      GENDERS.map((g) => g.id),
      "any",
    ),
    age: oneOf(params.get("age"), [...AGE_RANGES, ""], "") || null,
    benefits: list(params.getAll(PARAM.benefits), MAX_EMPHASIS),
    features: list(params.getAll(PARAM.features), MAX_EMPHASIS),
    objections: list(params.getAll(PARAM.objections), MAX_EMPHASIS),
    author: oneOf(
      params.get("author"),
      AUTHOR_TYPES.map((a) => a.id),
      "writer",
    ),
  };
}

/** Search params for a state, leaving out defaults so links stay short. */
export function wizardSearch(state: WizardState): string {
  const params = new URLSearchParams();
  if (state.step !== "product") params.set("step", state.step);
  if (state.brand) params.set("brand", state.brand);
  if (state.product) params.set("product", state.product);
  if (state.template) params.set("template", state.template);
  if (!state.ai) params.set("ai", "0");
  for (const style of state.styles) params.append("style", style);
  if (state.audience) params.set("audience", state.audience);
  if (state.gender !== "any") params.set("gender", state.gender);
  if (state.age) params.set("age", state.age);
  for (const kind of ["benefits", "features", "objections"] as const)
    for (const value of state[kind]) params.append(PARAM[kind], value);
  if (state.author !== "writer") params.set("author", state.author);
  state.competitors.forEach((url, i) => {
    if (url.trim()) params.set(`c${i + 2}`, url.trim());
  });
  if (state.naming !== "neutral") params.set("naming", state.naming);
  return params.toString();
}

/** Whether a step has what it needs (the later steps all have defaults). */
export function stepReady(state: WizardState, step: StepId): boolean {
  if (step === "product") return Boolean(state.brand && state.product);
  if (step === "template") return Boolean(state.template);
  if (step === "competitors")
    return (
      !state.ranking ||
      state.competitors.every(
        (_, i) => !competitorProblem(state.competitors, i),
      )
    );
  return true;
}

/** A step can be opened once every step before it is ready (and the wizard shows it). */
export function canOpen(state: WizardState, step: StepId): boolean {
  const steps = wizardSteps(state.ranking);
  const index = steps.findIndex((s) => s.id === step);
  return (
    index >= 0 && steps.slice(0, index).every((s) => stepReady(state, s.id))
  );
}

/** Where a step sits among the steps the wizard shows (-1 if it doesn't show it). */
export function stepIndex(step: StepId, ranking = false): number {
  return wizardSteps(ranking).findIndex((s) => s.id === step);
}

export type WizardPayload = {
  template_id: string;
  brand_id: string;
  product_id: string;
  wizard: {
    author_type: AuthorType;
    ai_images: boolean;
    image_styles: ImageStyle[];
    audience: string | null;
    audience_gender: Gender;
    audience_age: string | null;
    emphasis: Record<EmphasisKind, string[]>;
    competitors: { urls: string[]; naming: Naming } | null;
  };
};

/** The build payload (BUILD_SPEC §9). The audience goes to the copywriter with its description
 * from the briefing ("Name: who they are"). Null until brand, product and template are chosen. */
export function wizardPayload(
  state: WizardState,
  briefing: Briefing | null,
): WizardPayload | null {
  if (!state.brand || !state.product || !state.template) return null;
  const audience = state.audience
    ? briefing?.audiences.find((a) => a.name === state.audience)
    : undefined;
  return {
    template_id: state.template,
    brand_id: state.brand,
    product_id: state.product,
    wizard: {
      author_type: state.author,
      ai_images: state.ai,
      image_styles: state.ai ? state.styles : [],
      audience: state.audience
        ? (audience
            ? `${audience.name}: ${audience.description}`
            : state.audience
          ).slice(0, 300)
        : null,
      audience_gender: state.gender,
      audience_age: state.age,
      emphasis: {
        benefits: state.benefits,
        features: state.features,
        objections: state.objections,
      },
      competitors: state.ranking
        ? {
            urls: state.competitors.map((url) => url.trim()),
            naming: state.naming,
          }
        : null,
    },
  };
}
