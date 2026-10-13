"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { JobSteps } from "@/components/app/job-steps";
import { toast } from "@/components/app/toaster";
import { authLinkClass } from "@/components/app/auth-frame";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { AlertIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { createBrand } from "@/lib/brands/actions";
import { EMPTY_BRAND_FORM, draftToForm } from "@/lib/brands/form";
import { deriveDark, deriveTint } from "@/lib/brands/palette";
import { useJob, useStartJob } from "@/lib/queries/jobs";
import { type BrandDraft, brandDraftSchema } from "@/lib/validators/brand";
import type { JobDetail } from "@/lib/validators/jobs";

import { BrandForm } from "./brand-form";
import { BrandLogoSlot } from "./brand-logo-slot";
import { BrandsHeading } from "./brands-heading";
import { PalettePicker } from "./palette-picker";

export const FETCH_STEPS = [
  { id: "load", label: "Load the page" },
  { id: "read", label: "Read the page" },
  { id: "render", label: "Look at the rendered page" },
  { id: "colours", label: "Pick colours and fonts" },
  { id: "profile", label: "Write the brand profile" },
];

/**
 * /brands/new (Figma: Brands/Enter details and fetch details, light and dark): paste a URL →
 * the logo square shimmers while the 300 px loader ticks through the fetch steps → review the
 * draft → save. Or fill in by hand. A failed fetch keeps the form: Try again, or Fill by hand.
 */
export function NewBrandFlow() {
  const router = useRouter();
  const startJob = useStartJob();
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const { data: job } = useJob(jobId);

  const parsedDraft =
    job?.status === "succeeded"
      ? brandDraftSchema.safeParse(
          (job.result as { draft?: unknown } | null)?.draft,
        )
      : null;
  const draft: BrandDraft | null = parsedDraft?.success
    ? parsedDraft.data
    : null;

  const busy =
    startJob.isPending || job?.status === "queued" || job?.status === "running";

  const fetchBrand = () => {
    if (busy) return;
    const value = url.trim();
    if (!/^(https?:\/\/)?[^\s/]+\.[^\s]+$/i.test(value)) {
      setUrlError("Enter the brand's website, e.g. https://www.allbirds.com");
      return;
    }
    setUrlError(null);
    startJob.mutate(
      { kind: "brand_autofetch", payload: { url: value } },
      { onSuccess: ({ job: started }) => setJobId(started.id) },
    );
  };

  const reset = () => {
    setJobId(null);
    setManual(false);
  };

  if (draft || manual) {
    return (
      <div className="mx-auto box-content flex w-full max-w-brands flex-col gap-6 px-6">
        <BrandsHeading bordered />
        <ReviewNotes draft={draft} onStartOver={reset} />
        <BrandForm
          defaultValues={draft ? draftToForm(draft) : EMPTY_BRAND_FORM}
          submitLabel="Save brand"
          aboveFields={(form) =>
            draft ? (
              <div className="flex flex-col gap-4">
                <LogoPreview draft={draft} />
                <PalettePicker
                  candidates={draft.palette_candidates}
                  onChoose={(hex) => {
                    // Picking the current accent as primary swaps the two.
                    const previous = form.getValues("palette_primary");
                    if (
                      form.getValues("palette_accent").toLowerCase() ===
                      hex.toLowerCase()
                    ) {
                      form.setValue("palette_accent", previous, {
                        shouldDirty: true,
                      });
                    }
                    form.setValue("palette_primary", hex, {
                      shouldDirty: true,
                    });
                    form.setValue("palette_dark", deriveDark(hex) ?? "", {
                      shouldDirty: true,
                    });
                    form.setValue("palette_tint", deriveTint(hex) ?? "", {
                      shouldDirty: true,
                    });
                  }}
                />
              </div>
            ) : null
          }
          onSubmit={async (values) => {
            const result = await createBrand(
              values,
              draft
                ? {
                    logo_url: draft.logo_url,
                    logo_svg: draft.logo_svg,
                    favicon_url: draft.favicon_url,
                  }
                : null,
            );
            if (result.ok && result.id) {
              if (result.warning) toast(result.warning);
              router.push(`/brands/${result.id}`);
            }
            return result;
          }}
        />
      </div>
    );
  }

  const failed = job?.status === "failed";
  return (
    <div className="flex flex-col gap-4">
      {/* Figma Brands/Enter details: the title and the form, closed by a full-width line. */}
      <section className="flex flex-col items-center px-6 pb-8 divider-b-thin">
        <div className="flex w-full max-w-brands flex-col gap-2">
          <BrandsHeading bordered />
          <form
            className="mx-auto flex w-full max-w-100 flex-col gap-4 py-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              fetchBrand();
            }}
            noValidate
          >
            <BrandLogoSlot logoUrl={foundLogo(job)} searching={busy} />
            <div className="flex flex-col gap-4">
              <Field data-invalid={urlError ? true : undefined}>
                <FieldLabel htmlFor="brand-url">Enter Website</FieldLabel>
                <Input
                  id="brand-url"
                  type="url"
                  placeholder="https://www.yourbrand.com"
                  value={url}
                  aria-invalid={urlError ? true : undefined}
                  aria-describedby={urlError ? "brand-url-error" : undefined}
                  onChange={(event) => setUrl(event.target.value)}
                  // Figma's fetch frame keeps the field as it was; it just can't change mid-fetch.
                  readOnly={busy}
                />
                {urlError ? (
                  <FieldError id="brand-url-error">{urlError}</FieldError>
                ) : null}
              </Field>
              <Button
                type="submit"
                size="compact"
                className="h-8.5 w-full"
                aria-disabled={busy || undefined}
              >
                {failed ? "Try again" : "Fetch details"}
              </Button>
              {startJob.error ? (
                <p
                  role="alert"
                  className="text-type-caption-1 text-text-danger"
                >
                  {startJob.error.message}
                </p>
              ) : null}
              <p className="text-center text-type-body-small font-medium text-sub-text">
                No website, or prefer to type it?{" "}
                <button
                  type="button"
                  className="text-heading-01 underline underline-offset-2 outline-none hover:text-sub-text focus-visible:rounded-xsm focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setManual(true)}
                >
                  Fill by hand
                </button>
              </p>
            </div>
          </form>
        </div>
      </section>

      {job ? (
        <div className="flex justify-center px-6 py-1.5">
          <JobSteps
            title="Fetching brand details"
            steps={FETCH_STEPS}
            job={job}
            className="w-75 [&_.ui-progress]:pb-6.5"
          />
        </div>
      ) : null}
    </div>
  );
}

/** The logo the fetch found, as soon as it reports one (the "Read the page" step carries it). */
function foundLogo(job: JobDetail | null | undefined): string | null {
  for (const event of [...(job?.events ?? [])].reverse()) {
    const logo = event.data?.logo_url;
    if (typeof logo === "string" && /^https?:\/\//.test(logo)) return logo;
  }
  return null;
}

function ReviewNotes({
  draft,
  onStartOver,
}: {
  draft: BrandDraft | null;
  onStartOver: () => void;
}) {
  const notes = [
    ...(draft?.warnings ?? []),
    ...(draft?.ai === "mock"
      ? [
          "The voice and audience fields are placeholders: AI calls are in mock mode. Edit them, or fetch again once real AI is switched on.",
        ]
      : []),
  ];
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <p className="text-type-body-small text-sub-text">
          {draft
            ? `Here's what we found on ${new URL(draft.url).hostname}. Check it, change anything, then save.`
            : "Fill in what you know; you can change it any time."}
        </p>
        <Button variant="ghost" size="sm" onClick={onStartOver}>
          Start over
        </Button>
      </div>
      {notes.map((note) => (
        <Alert
          key={note}
          className="border-spot-500-yellow/30 bg-highlight-yellow-50"
        >
          <AlertIcon aria-hidden className="text-text-warning" />
          <AlertDescription className="text-body">{note}</AlertDescription>
        </Alert>
      ))}
    </div>
  );
}

function LogoPreview({ draft }: { draft: BrandDraft }) {
  const src = draft.logo_url
    ? draft.logo_url
    : draft.logo_svg
      ? `data:image/svg+xml;utf8,${encodeURIComponent(draft.logo_svg)}`
      : null;
  return (
    <div className="flex items-center gap-4 rounded-lg border border-stroke p-3">
      <div className="flex h-12 w-32 items-center justify-center rounded-sm bg-foreground-01">
        {src ? (
          // The logo is shown from the brand's own site until the brand is saved.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt="Logo found on the site"
            className="max-h-10 max-w-28 object-contain"
          />
        ) : (
          <span className="text-type-caption-1 text-caption-1">
            No logo found
          </span>
        )}
      </div>
      <p className="text-type-caption-1 text-sub-text">
        {src
          ? "This logo is saved with the brand. You can replace it later."
          : "You can add a logo later."}{" "}
        <Link href="/brands" className={authLinkClass}>
          Back to brands
        </Link>
      </p>
    </div>
  );
}
