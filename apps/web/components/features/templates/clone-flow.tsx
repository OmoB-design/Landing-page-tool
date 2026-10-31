"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { JobSteps } from "@/components/app/job-steps";
import { SelectField } from "@/components/app/select-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { AlertIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { ExternalLinkFigmaIcon } from "@/components/ui/lp-icons";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiFetch } from "@/lib/api/client";
import { jobKeys, useJob } from "@/lib/queries/jobs";
import {
  CLONE_TYPES,
  type CloneResult,
  type CloneTermsState,
  type CloneType,
  cloneRequestSchema,
  cloneResultSchema,
  cloneStartedSchema,
  cloneTermsStateSchema,
} from "@/lib/validators/clone";

import { CloneTermsDialog } from "./clone-terms-dialog";

type Source = "url" | "paste";

export const CLONE_STEPS = {
  url: [
    { id: "load", label: "Load the page" },
    { id: "check", label: "Check it’s a real page" },
    { id: "styles", label: "Bring in its styles" },
    { id: "clean", label: "Remove trackers, fix images" },
    { id: "save", label: "Save the template" },
  ],
  paste: [
    { id: "load", label: "Read the pasted page" },
    { id: "check", label: "Check it’s a real page" },
    { id: "styles", label: "Bring in its styles" },
    { id: "clean", label: "Remove trackers, fix images" },
    { id: "save", label: "Save the template" },
  ],
};

/** template_analyze's steps (B2.2). */
export const ANALYSIS_STEPS = [
  { id: "read", label: "Read the page" },
  { id: "ask", label: "Find its colours, brand and sections" },
  { id: "mark", label: "Mark the sections" },
  { id: "save", label: "Save it for your review" },
];

const PLATFORMS: Record<string, string> = {
  shopify: "Shopify",
  replo: "Replo",
  webflow: "Webflow",
  clickfunnels: "ClickFunnels",
  funnelish: "Funnelish",
  wordpress: "WordPress",
  framer: "Framer",
};

/**
 * /templates/clone (B2.1, BUILD_SPEC §8.4; no Figma frame yet, drawn like Brands/Enter details):
 * the serif title and line, then a 400 px form: From an address or Paste HTML, the name and type,
 * Clone page. The first clone in a workspace asks for the clone terms (owners and admins accept
 * them once). Below the line, the 300 px loader ticks through the job's steps; when it finishes,
 * the form makes way for what was cloned, any warnings, Preview and See it in Yours.
 */
export function CloneFlow({
  initialTerms,
  workspace,
}: {
  initialTerms: CloneTermsState;
  workspace: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const ids = { url: useId(), html: useId(), from: useId(), name: useId() };
  const [terms, setTerms] = useState(initialTerms);
  const [termsOpen, setTermsOpen] = useState(false);
  const [source, setSource] = useState<Source>("url");
  const [url, setUrl] = useState("");
  const [html, setHtml] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<CloneType>("advertorial");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const { data: job } = useJob(jobId);
  const refreshed = useRef<string | null>(null);

  const request = () =>
    cloneRequestSchema.safeParse(
      source === "url"
        ? { url, name, type }
        : { html, source_url: sourceUrl, name, type },
    );

  const start = useMutation({
    mutationFn: () => {
      const parsed = request();
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message);
      return apiFetch("/api/templates/clone", cloneStartedSchema, {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
    },
    onSuccess: ({ job: started }) => {
      setJobId(started.id);
      void queryClient.invalidateQueries({ queryKey: jobKeys.all });
    },
    onError: (failure) => {
      if (failure instanceof ApiError && failure.status === 409) {
        setTerms((current) => ({ ...current, accepted_at: null }));
        setTermsOpen(true);
      }
    },
  });

  const accept = useMutation({
    mutationFn: () =>
      apiFetch("/api/clone-terms", cloneTermsStateSchema, { method: "POST" }),
    onSuccess: (next) => {
      setTerms(next);
      setTermsOpen(false);
      start.mutate();
    },
  });

  const busy =
    start.isPending || job?.status === "queued" || job?.status === "running";
  const parsedResult =
    job?.status === "succeeded"
      ? cloneResultSchema.safeParse(job.result)
      : null;
  const result = parsedResult?.success ? parsedResult.data : null;
  const { data: analysisJob } = useJob(result?.analysis_job_id ?? null);

  // A finished clone is new in Yours: drop cached copies of the templates pages.
  useEffect(() => {
    if (result && refreshed.current !== result.template_id) {
      refreshed.current = result.template_id;
      router.refresh();
    }
  }, [result, router]);

  const submit = () => {
    if (busy) return;
    const parsed = request();
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Check the form.");
      return;
    }
    setFieldError(null);
    if (!terms.clone_enabled) return;
    if (terms.accepted_at === null) {
      accept.reset();
      setTermsOpen(true);
      return;
    }
    start.mutate();
  };

  const reset = () => {
    setJobId(null);
    start.reset();
    setUrl("");
    setHtml("");
    setSourceUrl("");
    setName("");
  };

  const failed = job?.status === "failed";
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col items-center px-6 pb-8 divider-b-thin">
        <div className="flex w-full max-w-brands flex-col gap-2">
          <CloneHeading />
          <div className="mx-auto flex w-full max-w-100 flex-col gap-4 py-1.5">
            {!terms.clone_enabled ? (
              <p className="text-center text-type-body-small font-medium text-sub-text">
                Cloning is switched off for this workspace.
              </p>
            ) : result ? (
              <CloneDone
                result={result}
                analysed={analysisJob?.status === "succeeded"}
                onAnother={reset}
              />
            ) : (
              <form
                className="flex flex-col gap-4"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  submit();
                }}
              >
                <SourceSwitch
                  value={source}
                  disabled={busy}
                  onChange={(next) => {
                    setSource(next);
                    setFieldError(null);
                  }}
                />
                {source === "url" ? (
                  <Field data-invalid={fieldError ? true : undefined}>
                    <FieldLabel htmlFor={ids.url}>Page address</FieldLabel>
                    <Input
                      id={ids.url}
                      type="url"
                      placeholder="https://competitor.com/pages/offer"
                      value={url}
                      readOnly={busy}
                      aria-invalid={fieldError ? true : undefined}
                      aria-describedby={
                        fieldError ? `${ids.url}-error` : undefined
                      }
                      onChange={(event) => setUrl(event.target.value)}
                    />
                    {fieldError ? (
                      <FieldError id={`${ids.url}-error`}>
                        {fieldError}
                      </FieldError>
                    ) : null}
                  </Field>
                ) : (
                  <>
                    <Field data-invalid={fieldError ? true : undefined}>
                      <FieldLabel htmlFor={ids.html}>Page HTML</FieldLabel>
                      <Textarea
                        id={ids.html}
                        value={html}
                        readOnly={busy}
                        spellCheck={false}
                        placeholder="Paste the page’s source (in your browser: View Page Source, select all, copy)"
                        aria-invalid={fieldError ? true : undefined}
                        aria-describedby={
                          fieldError ? `${ids.html}-error` : undefined
                        }
                        className="max-h-60 min-h-30 overflow-y-auto font-mono"
                        onChange={(event) => setHtml(event.target.value)}
                      />
                      {fieldError ? (
                        <FieldError id={`${ids.html}-error`}>
                          {fieldError}
                        </FieldError>
                      ) : null}
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={ids.from}>
                        Where it came from{" "}
                        <span className="font-normal text-heading-05">
                          (optional)
                        </span>
                      </FieldLabel>
                      <Input
                        id={ids.from}
                        type="url"
                        placeholder="https://competitor.com/pages/offer"
                        value={sourceUrl}
                        readOnly={busy}
                        aria-describedby={`${ids.from}-hint`}
                        onChange={(event) => setSourceUrl(event.target.value)}
                      />
                      <p
                        id={`${ids.from}-hint`}
                        className="text-type-caption-1 text-heading-05"
                      >
                        So its images and styles load. Not needed if the HTML
                        names its own address.
                      </p>
                    </Field>
                  </>
                )}
                <Field>
                  <FieldLabel htmlFor={ids.name}>
                    Name{" "}
                    <span className="font-normal text-heading-05">
                      (optional)
                    </span>
                  </FieldLabel>
                  <Input
                    id={ids.name}
                    placeholder="The page’s own title"
                    value={name}
                    readOnly={busy}
                    maxLength={120}
                    onChange={(event) => setName(event.target.value)}
                  />
                </Field>
                <SelectField
                  label="Type"
                  labelClassName="text-type-body-large leading-normal text-heading-01"
                  value={type}
                  placeholder="Choose a type"
                  options={[...CLONE_TYPES]}
                  disabled={busy}
                  onValueChange={(value) => setType(value as CloneType)}
                />
                <Button
                  type="submit"
                  size="compact"
                  className="h-8.5 w-full"
                  aria-disabled={busy || undefined}
                >
                  {failed ? "Try again" : "Clone page"}
                </Button>
                {start.error &&
                !(
                  start.error instanceof ApiError && start.error.status === 409
                ) ? (
                  <p
                    role="alert"
                    className="text-type-caption-1 text-text-danger"
                  >
                    {start.error.message}
                  </p>
                ) : null}
                <TermsLine
                  terms={terms}
                  workspace={workspace}
                  onRead={() => {
                    accept.reset();
                    setTermsOpen(true);
                  }}
                />
              </form>
            )}
          </div>
        </div>
      </section>
      {job ? (
        <div className="flex flex-wrap items-start justify-center gap-4 px-6 py-1.5">
          <JobSteps
            title="Cloning the page"
            steps={CLONE_STEPS[source]}
            job={job}
            className="w-75 [&_.ui-progress]:pb-6.5"
          />
          {analysisJob ? (
            <JobSteps
              title="Analysing it"
              steps={ANALYSIS_STEPS}
              job={analysisJob}
              className="w-75 [&_.ui-progress]:pb-6.5"
            />
          ) : null}
        </div>
      ) : null}
      <CloneTermsDialog
        open={termsOpen}
        onOpenChange={setTermsOpen}
        terms={terms}
        workspace={workspace}
        accepting={accept.isPending}
        error={accept.error?.message ?? null}
        onAccept={() => accept.mutate()}
      />
    </div>
  );
}

/** The title block, as Brands' on its new-brand screen: serif title, line, a half-pixel rule. */
function CloneHeading() {
  return (
    <div className="pb-6">
      <div className="flex flex-col gap-1.5 pr-1 pb-6 divider-b-half">
        <h1 className="font-serif text-type-title font-medium text-button-secondary-text">
          Clone a page
        </h1>
        <p className="text-type-body-small leading-5 font-medium text-sub-text">
          Copy a landing page you rate into your templates, without its
          trackers. Every page you build from it is rewritten for your brand.
        </p>
      </div>
    </div>
  );
}

/** From an address or Paste HTML, as a segmented switch (the Analytics period's look). */
function SourceSwitch({
  value,
  disabled,
  onChange,
}: {
  value: Source;
  disabled: boolean;
  onChange: (value: Source) => void;
}) {
  const options: { id: Source; label: string }[] = [
    { id: "url", label: "From an address" },
    { id: "paste", label: "Paste HTML" },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Clone from"
      className="flex rounded-sm bg-foreground-01 p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          data-current={value === option.id ? "" : undefined}
          disabled={disabled}
          onClick={() => onChange(option.id)}
          className="flex-1 rounded-xsm px-2.5 py-0.5 text-type-body-small font-medium text-heading-05 outline-none hover:text-heading-01 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed data-current:bg-surface-primary data-current:text-heading-01 data-current:shadow-light"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function TermsLine({
  terms,
  workspace,
  onRead,
}: {
  terms: CloneTermsState;
  workspace: string;
  onRead: () => void;
}) {
  const read = (
    <button
      type="button"
      onClick={onRead}
      className="text-heading-01 underline underline-offset-2 outline-none hover:text-sub-text focus-visible:rounded-xsm focus-visible:ring-2 focus-visible:ring-ring"
    >
      Read them
    </button>
  );
  return (
    <p className="text-center text-type-caption-1 text-heading-05">
      {terms.accepted_at ? (
        <>
          Clone terms accepted
          {terms.accepted_by ? ` by ${terms.accepted_by}` : ""} on{" "}
          {format(new Date(terms.accepted_at), "d MMM yyyy")}. {read}
        </>
      ) : terms.can_accept ? (
        <>
          You’ll accept the clone terms for {workspace} first. {read}
        </>
      ) : (
        <>An owner or admin needs to accept the clone terms first. {read}</>
      )}
    </p>
  );
}

/** What was cloned: the name, where from and on what, any warnings, and where to go next. */
function CloneDone({
  result,
  analysed,
  onAnother,
}: {
  result: CloneResult;
  /** Its analysis finished: it's ready for review. */
  analysed: boolean;
  onAnother: () => void;
}) {
  const platform = PLATFORMS[result.platform];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-type-body-small font-medium text-heading-01">
          {result.name}
        </p>
        <p className="text-type-caption-1 text-heading-05">
          Cloned from {result.source_host}
          {platform ? `, built with ${platform}` : ""}.{" "}
          {analysed
            ? "Analysed: check its sections and rules, then confirm it to build pages from it."
            : result.analysis_job_id
              ? "It’s being analysed now; then you check it and can build pages from it."
              : "It’s in your templates; analyse it there to build pages from it."}
        </p>
      </div>
      {result.warnings.map((warning) => (
        <Alert
          key={warning}
          className="border-spot-500-yellow/30 bg-highlight-yellow-50"
        >
          <AlertIcon aria-hidden className="text-text-warning" />
          <AlertDescription className="text-body">{warning}</AlertDescription>
        </Alert>
      ))}
      <div className="flex gap-1.5">
        <Button asChild size="compact" className="h-8.5 flex-1">
          {analysed ? (
            <Link href={`/templates/${result.template_id}`}>Review it</Link>
          ) : (
            <Link href="/templates?view=yours">See it in Yours</Link>
          )}
        </Button>
        <Button
          asChild
          variant="secondary"
          size="compact"
          className="h-8.5 flex-1"
        >
          <a
            href={`/preview/template/${result.template_id}`}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLinkFigmaIcon />
            Preview
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </Button>
      </div>
      <p className="text-center text-type-body-small font-medium text-sub-text">
        <button
          type="button"
          onClick={onAnother}
          className="text-heading-01 underline underline-offset-2 outline-none hover:text-sub-text focus-visible:rounded-xsm focus-visible:ring-2 focus-visible:ring-ring"
        >
          Clone another page
        </button>
      </p>
    </div>
  );
}
