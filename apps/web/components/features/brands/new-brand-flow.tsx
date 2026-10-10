"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { JobSteps } from "@/components/app/job-steps";
import { toast } from "@/components/app/toaster";
import { authLinkClass } from "@/components/app/auth-frame";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { AlertIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { createBrand } from "@/lib/brands/actions";
import { EMPTY_BRAND_FORM, draftToForm } from "@/lib/brands/form";
import { deriveDark, deriveTint } from "@/lib/brands/palette";
import { useJob, useStartJob } from "@/lib/queries/jobs";
import { type BrandDraft, brandDraftSchema } from "@/lib/validators/brand";

import { BrandForm } from "./brand-form";
import { PalettePicker } from "./palette-picker";

export const FETCH_STEPS = [
  { id: "load", label: "Load the page" },
  { id: "read", label: "Read the page" },
  { id: "render", label: "Look at the rendered page" },
  { id: "colours", label: "Pick colours and fonts" },
  { id: "profile", label: "Write the brand profile" },
];

/** /brands/new: paste a URL → live fetch steps → review the draft → save. Or fill in by hand. */
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

  const fetchBrand = () => {
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
      <div className="flex flex-col gap-6">
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

  const busy =
    startJob.isPending || job?.status === "queued" || job?.status === "running";
  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          fetchBrand();
        }}
        noValidate
      >
        <Field data-invalid={urlError ? true : undefined}>
          <FieldLabel htmlFor="brand-url">Brand website</FieldLabel>
          <div className="flex gap-2">
            <Input
              id="brand-url"
              type="url"
              className="h-9"
              placeholder="https://www.yourbrand.com"
              value={url}
              aria-invalid={urlError ? true : undefined}
              aria-describedby={urlError ? "brand-url-error" : "brand-url-hint"}
              onChange={(event) => setUrl(event.target.value)}
              disabled={busy}
            />
            <Button type="submit" disabled={busy} className="h-9 px-4">
              Fetch details
            </Button>
          </div>
          {urlError ? (
            <FieldError id="brand-url-error">{urlError}</FieldError>
          ) : (
            <FieldDescription id="brand-url-hint">
              We read the site&apos;s name, colours, fonts, logo and tone.
              Nothing is saved until you review it.
            </FieldDescription>
          )}
        </Field>
        {startJob.error ? (
          <p role="alert" className="text-type-caption-1 text-text-danger">
            {startJob.error.message}
          </p>
        ) : null}
      </form>

      {job ? (
        <JobSteps
          title="Fetching brand details"
          steps={FETCH_STEPS}
          job={job}
        />
      ) : null}

      {job?.status === "failed" ? (
        <div className="flex gap-3">
          <Button variant="outline" onClick={fetchBrand}>
            Try again
          </Button>
          <Button variant="ghost" onClick={() => setManual(true)}>
            Fill in by hand
          </Button>
        </div>
      ) : (
        <p className="text-type-caption-1 text-sub-text">
          No website, or prefer to type it?{" "}
          <button
            type="button"
            className={authLinkClass}
            onClick={() => setManual(true)}
          >
            Fill in by hand
          </button>
        </p>
      )}
    </div>
  );
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
