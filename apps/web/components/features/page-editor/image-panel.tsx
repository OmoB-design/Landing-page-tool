"use client";

import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { type DragEvent, useEffect, useRef, useState } from "react";

import { toast } from "@/components/app/toaster";
import { Button } from "@/components/ui/button";
import {
  BackIcon,
  CheckIcon,
  ImageOffIcon,
  UploadIcon,
} from "@/components/ui/icons";
import { SparkleFigmaIcon } from "@/components/ui/lp-icons";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, apiFetch } from "@/lib/api/client";
import {
  KIND_LABELS,
  SOURCE_LABELS,
  prepareUpload,
  uploadable,
} from "@/lib/pages/images";
import { cn } from "@/lib/utils";
import {
  ALT_MAX,
  type ImageChoice,
  type ImageFit,
  type ImageAiInput,
  type ImageFocus,
  type ImageJob,
  type ImageRatio,
  PROMPT_MAX,
  REFERENCES_MAX,
  type ImageStudio,
  imageStudioSchema,
  uploadedImageSchema,
} from "@/lib/validators/images";

import { useDesk } from "../builds/desk-context";

const RATIO_LABELS: [ImageRatio, string][] = [
  ["original", "Original"],
  ["1:1", "1:1"],
  ["4:3", "4:3"],
  ["3:4", "3:4"],
  ["16:9", "16:9"],
];
const FIT_LABELS: [ImageFit, string][] = [
  ["cover", "Fill"],
  ["contain", "Fit"],
];
const FOCUS_LABELS: [ImageFocus, string][] = [
  ["top", "Top"],
  ["center", "Centre"],
  ["bottom", "Bottom"],
];

/**
 * The image studio (BUILD_SPEC §11.2, B3.2a, D109), in the page editor's left drawer where the
 * section list opens; the back arrow returns to the list. Click an image on the page to open it.
 * Replace it with one of the product's photos, another image on the page, or an upload; set its
 * shape, fit and focus, and its alt text; and bring back one of its last five versions. Every
 * change is one undoable step on the page.
 */
/** A picture being made for an image (B3.2b): how, and since when (for the seconds). */
export type Making = { mode: ImageJob["mode"]; startedAt: number };

export function ImagePanel({
  buildId,
  number,
  busy,
  onBack,
  making,
  onMake,
  onAdopt,
}: {
  buildId: string;
  number: number;
  /** A change is saving or Lander is working: changes wait. */
  busy: string | null;
  onBack: () => void;
  /** The picture being made for this image, if any. */
  making: Making | null;
  /** Starts an AI picture for the image. */
  onMake: (number: number, input: ImageAiInput) => Promise<void>;
  /** A picture the worker is already making for it (opened after a reload): follow it. */
  onAdopt: (number: number, job: ImageJob) => void;
}) {
  const { desk, changeImage } = useDesk();
  const version = desk.build.page_version;
  const studio = useQuery({
    queryKey: ["image-studio", buildId, number, version],
    queryFn: () =>
      apiFetch(`/api/builds/${buildId}/images/${number}`, imageStudioSchema),
    placeholderData: (previous) =>
      previous?.image.number === number ? previous : undefined,
    retry: false,
  });
  const data = studio.data;
  // A picture the worker is already making for this image (the page was reloaded): follow it.
  const running = data?.making ?? null;
  useEffect(() => {
    if (running && !making) onAdopt(number, running);
  }, [running, making, number, onAdopt]);

  return (
    <div className="flex flex-col gap-2 p-4">
      <div className="flex h-9 items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back to sections"
          onClick={onBack}
          className="-ml-1.5 size-7 text-icon-system hover:text-body"
        >
          <BackIcon aria-hidden className="size-4" />
        </Button>
        <h2 className="min-w-0 flex-1 truncate text-type-body-small font-medium">
          Image
          {data ? (
            <span className="font-normal text-sub-text">
              {" "}
              · {KIND_LABELS[data.image.kind] ?? "Image"}
              {data.image.section_label
                ? ` in ${data.image.section_label}`
                : ""}
            </span>
          ) : null}
        </h2>
        {studio.isFetching && data ? (
          <Spinner className="size-3.5 text-icon-system" />
        ) : null}
      </div>
      {studio.isError ? (
        <div className="flex flex-col items-start gap-2 py-6">
          <ImageOffIcon aria-hidden className="size-5 text-icon-system" />
          <p className="text-type-caption-1 text-sub-text">
            {studio.error instanceof ApiError && studio.error.status === 404
              ? "This image isn’t on the page any more."
              : studio.error instanceof Error
                ? studio.error.message
                : "Couldn’t load that image."}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void studio.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : !data ? (
        <ImagePanelSkeleton />
      ) : (
        <Studio
          key={data.image.number}
          buildId={buildId}
          data={data}
          busy={busy}
          onChange={changeImage}
          making={making}
          onMake={(input) => onMake(number, input)}
        />
      )}
    </div>
  );
}

function Studio({
  buildId,
  data,
  busy,
  onChange,
  making,
  onMake,
}: {
  buildId: string;
  data: ImageStudio;
  busy: string | null;
  onChange: ReturnType<typeof useDesk>["changeImage"];
  making: Making | null;
  onMake: (input: ImageAiInput) => Promise<void>;
}) {
  const { image } = data;
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const waiting = Boolean(busy) || uploading;

  const replace = (
    src: string,
    source: "product" | "reused" | "uploaded",
    assetId?: string,
  ) =>
    onChange(image.number, "replace", {
      src,
      source,
      ...(assetId ? { asset_id: assetId } : {}),
    });

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!uploadable(file)) {
      toast.error("Pictures must be PNG, JPEG or WebP.");
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await prepareUpload(file);
      const stored = await apiFetch(
        `/api/builds/${buildId}/images/upload`,
        uploadedImageSchema,
        { method: "POST", body: JSON.stringify({ data_url: dataUrl }) },
      );
      await replace(stored.url, "uploaded", stored.asset_id);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn’t upload that picture.",
      );
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (!waiting) void upload(event.dataTransfer.files[0]);
  };

  return (
    <div className="flex flex-col gap-4 pb-4">
      <figure className="flex flex-col gap-1.5">
        <div className="flex aspect-4/3 items-center justify-center overflow-hidden rounded-md bg-foreground-02 ring-thin ring-stroke ring-inset">
          {/* eslint-disable-next-line @next/next/no-img-element -- the page's own picture, from anywhere it's hosted */}
          <img
            src={image.src}
            alt={image.alt}
            className="max-h-full max-w-full object-contain"
          />
        </div>
        {image.alt ? (
          <figcaption className="line-clamp-2 text-type-caption-1 text-sub-text">
            {image.alt}
          </figcaption>
        ) : null}
      </figure>

      <Group title="Replace with">
        {data.product_photos.length ? (
          <Choices
            label="Product photos"
            choices={data.product_photos}
            current={image.src}
            disabled={waiting}
            onPick={(c) => void replace(c.src, "product")}
          />
        ) : (
          <p className="text-type-caption-1 text-sub-text">
            The product has no photos yet. Add them on the product.
          </p>
        )}
        {data.page_images.length ? (
          <Choices
            label="On this page"
            choices={data.page_images}
            current={image.src}
            disabled={waiting}
            onPick={(c) => void replace(c.src, "reused")}
          />
        ) : null}
        <div
          onDragOver={(event) => {
            event.preventDefault();
            if (!waiting) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "flex flex-col items-center gap-1.5 rounded-md border border-dashed border-stroke px-3 py-3 text-center transition-colors duration-150",
            dragging && "border-stroke-input-active bg-foreground-02",
          )}
        >
          <Button
            variant="outline"
            size="sm"
            disabled={waiting}
            onClick={() => input.current?.click()}
          >
            {uploading ? (
              <Spinner className="size-3.5" />
            ) : (
              <UploadIcon aria-hidden className="size-3.5" />
            )}
            {uploading ? "Uploading…" : "Upload a picture"}
          </Button>
          <span className="text-type-caption-2 text-heading-06">
            or drop one here · PNG, JPEG or WebP
          </span>
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            tabIndex={-1}
            aria-label="Upload a picture"
            onChange={(event) => void upload(event.target.files?.[0])}
          />
        </div>
      </Group>

      <MakeWithAi
        image={data.image}
        photos={data.product_photos}
        ai={data.ai}
        making={making}
        disabled={waiting}
        onMake={onMake}
      />

      <Group
        title="Crop and fit"
        action={
          image.changed ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={waiting}
              onClick={() =>
                void onChange(image.number, "adjust", { ratio: "original" })
              }
              className="-my-1 h-6 px-1.5 text-type-caption-1 text-heading-02 hover:bg-foreground-03"
            >
              Reset
            </Button>
          ) : null
        }
      >
        <Options
          label="Shape"
          options={RATIO_LABELS}
          value={image.ratio}
          disabled={waiting}
          onPick={(ratio) => void onChange(image.number, "adjust", { ratio })}
        />
        <Options
          label="Fit"
          options={FIT_LABELS}
          value={image.fit}
          disabled={waiting}
          onPick={(fit) => void onChange(image.number, "adjust", { fit })}
        />
        <Options
          label="Focus"
          options={FOCUS_LABELS}
          value={image.focus}
          disabled={waiting}
          onPick={(focus) => void onChange(image.number, "adjust", { focus })}
        />
      </Group>

      <AltText
        key={image.alt}
        alt={image.alt}
        disabled={waiting}
        onSave={(alt) => onChange(image.number, "adjust", { alt })}
      />

      {data.versions.length ? (
        <Group title={`Versions · ${data.versions.length}`}>
          <ol className="flex flex-col gap-1">
            {data.versions.map((v) => (
              <li
                key={v.id}
                className="flex h-11 items-center gap-2.5 rounded-md px-1.5 hover:bg-foreground-02"
              >
                <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-foreground-02 ring-thin ring-stroke ring-inset">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a version of the page's picture */}
                  <img src={v.src} alt="" className="size-full object-cover" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-type-caption-1 font-medium text-heading-02">
                    {SOURCE_LABELS[v.source] ?? "Picture"}
                  </span>
                  <span className="truncate text-type-caption-2 text-heading-06">
                    {formatDistanceToNowStrict(new Date(v.created_at), {
                      addSuffix: true,
                    })}
                  </span>
                </span>
                {v.current ? (
                  <span className="flex shrink-0 items-center gap-1 text-type-caption-2 text-sub-text">
                    <CheckIcon aria-hidden className="size-3" />
                    On the page
                  </span>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={waiting}
                    onClick={() =>
                      void onChange(image.number, "restore", {
                        version_id: v.id,
                      })
                    }
                    className="h-7 px-2 text-type-caption-1 text-heading-02 hover:bg-foreground-03"
                  >
                    Restore
                  </Button>
                )}
              </li>
            ))}
          </ol>
        </Group>
      ) : null}
    </div>
  );
}

/** Whole seconds since `from`, ticking while it's set. */
function useSeconds(from: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (from === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [from]);
  return from === null ? 0 : Math.max(0, Math.floor((now - from) / 1000));
}

/**
 * Make with AI (B3.2b, D110): a new picture from a description, or the one shown edited, with up
 * to three product photos so the product stays true. The price is on the button ($0.15 a picture
 * once live; a free grey placeholder in mock mode). While it's made the page stays editable; the
 * picture lands as one undoable change and a new version.
 */
function MakeWithAi({
  image,
  photos,
  ai,
  making,
  disabled,
  onMake,
}: {
  image: ImageStudio["image"];
  photos: ImageChoice[];
  ai: ImageStudio["ai"];
  making: Making | null;
  disabled: boolean;
  onMake: (input: ImageAiInput) => Promise<void>;
}) {
  const [mode, setMode] = useState<ImageJob["mode"]>("generate");
  // A new picture starts from what the image is of (its alt text); an edit starts empty.
  const [prompts, setPrompts] = useState({ generate: image.alt, edit: "" });
  const [picked, setPicked] = useState<number[]>([]);
  const [sending, setSending] = useState(false);
  const seconds = useSeconds(making?.startedAt ?? null);
  const prompt = prompts[mode];
  const price = ai.mock ? "free placeholder" : ai.price ? `$${ai.price}` : null;
  const locked = disabled || sending || making !== null;
  const make = async () => {
    setSending(true);
    try {
      await onMake({ mode, prompt: prompt.trim(), product_photos: picked });
    } finally {
      setSending(false);
    }
  };
  const toggle = (n: number) =>
    setPicked((all) =>
      all.includes(n) ? all.filter((one) => one !== n) : [...all, n],
    );
  return (
    <Group title="Make with AI">
      <Options
        label="Make"
        options={[
          ["generate", "New picture"],
          ["edit", "Edit this one"],
        ]}
        value={mode}
        disabled={locked}
        onPick={setMode}
      />
      <label htmlFor="image-ai-prompt" className="sr-only">
        {mode === "generate"
          ? "Describe the new picture"
          : "Say what to change in the picture"}
      </label>
      <textarea
        id="image-ai-prompt"
        rows={3}
        value={prompt}
        maxLength={PROMPT_MAX}
        disabled={locked}
        placeholder={
          mode === "generate"
            ? "Describe the picture: what’s in it, the setting, the light."
            : "Say what to change, like “put the bottle on a marble counter”."
        }
        onChange={(event) =>
          setPrompts((all) => ({ ...all, [mode]: event.target.value }))
        }
        className="resize-none rounded-md bg-surface-primary px-2.5 py-2 text-type-caption-1 text-heading-01 ring-thin ring-stroke outline-none ring-inset placeholder:text-caption-1 focus-visible:ring-stroke-input-active disabled:opacity-60"
      />
      {photos.length ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-type-caption-2 text-heading-06">
            Keep the product true to (up to {REFERENCES_MAX})
          </span>
          <ul className="flex flex-wrap gap-1.5">
            {photos.map((photo, i) => {
              const n = i + 1;
              const on = picked.includes(n);
              return (
                <li key={photo.src}>
                  <button
                    type="button"
                    aria-pressed={on}
                    aria-label={`Use ${photo.label} as a reference`}
                    disabled={
                      locked || (!on && picked.length >= REFERENCES_MAX)
                    }
                    onClick={() => toggle(n)}
                    className={cn(
                      "relative flex size-10 items-center justify-center overflow-hidden rounded-md bg-foreground-02 ring-thin ring-stroke outline-none ring-inset focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                      on && "ring-2 ring-stroke-input-active",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- a product photo */}
                    <img
                      src={photo.src}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                    {on ? (
                      <span className="absolute top-0.5 right-0.5 flex size-3.5 items-center justify-center rounded-full bg-stroke-input-active text-surface-primary">
                        <CheckIcon aria-hidden className="size-2.5" />
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {making ? (
        <p
          role="status"
          className="flex h-8 items-center gap-2 text-type-caption-1 text-sub-text"
        >
          <Spinner className="size-3.5" label="Making" />
          {making.mode === "generate"
            ? "Making a new picture…"
            : "Editing the picture…"}{" "}
          <span className="tabular-nums">{seconds}s</span>
        </p>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          disabled={locked || prompt.trim().length < 3}
          onClick={() => void make()}
        >
          {sending ? (
            <Spinner className="size-3.5" />
          ) : (
            <SparkleFigmaIcon aria-hidden className="size-3.5" />
          )}
          {mode === "generate" ? "Make a new picture" : "Edit the picture"}
          {price ? (
            <span className="font-normal text-sub-text">· {price}</span>
          ) : null}
        </Button>
      )}
      <p className="text-type-caption-2 text-heading-06">
        {ai.mock
          ? "Mock mode: each picture is a grey placeholder, free. Real pictures need a fal key."
          : "The page stays editable while it’s made. Undo takes the picture back."}
      </p>
    </Group>
  );
}

function Group({
  title,
  action,
  children,
}: {
  title: string;
  /** A control beside the title (Crop and fit's Reset). */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5 border-t border-stroke pt-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-type-caption-1 font-medium text-heading-02">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Choices({
  label,
  choices,
  current,
  disabled,
  onPick,
}: {
  label: string;
  choices: ImageChoice[];
  current: string;
  disabled: boolean;
  onPick: (choice: ImageChoice) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-type-caption-2 text-heading-06">{label}</span>
      <ul className="grid grid-cols-3 gap-1.5">
        {choices.map((choice) => {
          const on = choice.src === current;
          return (
            <li key={choice.src}>
              <button
                type="button"
                aria-label={
                  on ? `${choice.label} (on the page)` : `Use ${choice.label}`
                }
                aria-pressed={on}
                disabled={disabled || on}
                onClick={() => onPick(choice)}
                className={cn(
                  "group/choice relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-md bg-foreground-02 ring-thin ring-stroke outline-none ring-inset focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
                  on && "ring-2 ring-stroke-input-active",
                  !on && !disabled && "hover:ring-stroke-input-active",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a product photo or a picture on the page */}
                <img
                  src={choice.src}
                  alt=""
                  loading="lazy"
                  className={cn(
                    "size-full object-cover transition-transform duration-200 ease-out",
                    !on && !disabled && "group-hover/choice:scale-105",
                    disabled && !on && "opacity-60",
                  )}
                />
                {on ? (
                  <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-stroke-input-active text-surface-primary">
                    <CheckIcon aria-hidden className="size-2.5" />
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Options<T extends string>({
  label,
  options,
  value,
  disabled,
  onPick,
}: {
  label: string;
  options: [T, string][];
  value: T;
  disabled: boolean;
  onPick: (value: T) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-type-caption-1 text-sub-text">{label}</span>
      <div
        role="group"
        aria-label={label}
        className="flex items-center rounded-md bg-foreground-03 p-0.5 ring-hair ring-stroke ring-inset dark:bg-foreground-01 dark:ring-0"
      >
        {options.map(([id, text]) => (
          <button
            key={id}
            type="button"
            aria-pressed={value === id}
            disabled={disabled}
            onClick={() => value !== id && onPick(id)}
            className="h-6 rounded-sm px-1.5 text-type-caption-1 font-medium text-heading-02 tabular-nums outline-none hover:text-body focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 aria-pressed:bg-surface-primary aria-pressed:text-body aria-pressed:shadow-sm dark:text-sub-text dark:aria-pressed:bg-letter-paper"
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function AltText({
  alt,
  disabled,
  onSave,
}: {
  alt: string;
  disabled: boolean;
  onSave: (alt: string) => Promise<boolean>;
}) {
  const [text, setText] = useState(alt);
  const dirty = text.trim() !== alt.trim();
  const save = () => {
    if (dirty && !disabled) void onSave(text.trim());
  };
  return (
    <section className="flex flex-col gap-2 border-t border-stroke pt-3">
      <label
        htmlFor="image-alt"
        className="text-type-caption-1 font-medium text-heading-02"
      >
        Alt text
      </label>
      <textarea
        id="image-alt"
        rows={3}
        value={text}
        maxLength={ALT_MAX}
        disabled={disabled}
        placeholder="Describe the picture plainly, for screen readers and search."
        onChange={(event) => setText(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            save();
          } else if (event.key === "Escape") {
            setText(alt);
          }
        }}
        className="resize-none rounded-md bg-surface-primary px-2.5 py-2 text-type-caption-1 text-heading-01 ring-thin ring-stroke outline-none ring-inset placeholder:text-caption-1 focus-visible:ring-stroke-input-active disabled:opacity-60"
      />
      <span className="text-type-caption-2 text-heading-06 tabular-nums">
        {dirty
          ? "Enter saves · Esc puts it back"
          : `${ALT_MAX - text.length} characters left`}
      </span>
    </section>
  );
}

/** The panel while the image loads: the preview box and three groups, box for box. */
function ImagePanelSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-4 pb-4">
      <div className="aspect-4/3 animate-pulse rounded-md bg-foreground-02" />
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex flex-col gap-2.5 border-t border-stroke pt-3"
        >
          <div className="h-4 w-24 animate-pulse rounded-sm bg-foreground-02" />
          <div className="grid grid-cols-3 gap-1.5">
            {[0, 1, 2].map((j) => (
              <div
                key={j}
                className="aspect-square animate-pulse rounded-md bg-foreground-02"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
