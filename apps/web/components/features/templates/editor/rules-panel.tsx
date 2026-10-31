"use client";

import { useId, useState, useTransition } from "react";

import { toast } from "@/components/app/toaster";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { saveRules } from "@/lib/templates/actions";
import type {
  TemplateEditorState,
  TemplateInstructions,
} from "@/lib/validators/template";

const lines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

/**
 * The Rules tab for clones (B2.2, BUILD_SPEC §8.5; no Figma frame yet, drawn like Details): what
 * the analysis drafted and every build follows. Words to never use, copy rules, images to keep
 * as they are or swap for generic scenes, image rules (one per line where it's a list), then
 * the line-length budgets (read only) and Save rules.
 */
export function RulesPanel({
  state,
  onState,
}: {
  state: TemplateEditorState;
  onState: (next: TemplateEditorState) => void;
}) {
  const ids = {
    terms: useId(),
    copy: useId(),
    keep: useId(),
    generic: useId(),
    images: useId(),
  };
  const initial = state.instructions;
  const [terms, setTerms] = useState(initial.forbidden_terms.join("\n"));
  const [copy, setCopy] = useState(initial.copy_rules);
  const [keep, setKeep] = useState(initial.keep_images.join("\n"));
  const [generic, setGeneric] = useState(initial.generic_images.join("\n"));
  const [images, setImages] = useState(initial.image_rules);
  const [saving, startSaving] = useTransition();
  const next: TemplateInstructions = {
    ...initial,
    forbidden_terms: lines(terms),
    copy_rules: copy.trim(),
    keep_images: lines(keep),
    generic_images: lines(generic),
    image_rules: images.trim(),
  };
  const dirty =
    JSON.stringify([
      next.forbidden_terms,
      next.copy_rules,
      next.keep_images,
      next.generic_images,
      next.image_rules,
    ]) !==
    JSON.stringify([
      initial.forbidden_terms,
      initial.copy_rules,
      initial.keep_images,
      initial.generic_images,
      initial.image_rules,
    ]);

  return (
    <form
      noValidate
      className="flex flex-col gap-6 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        startSaving(async () => {
          const result = await saveRules(state.template.id, next);
          if (result.state) {
            onState(result.state);
            toast.success("Saved the rules");
          } else {
            toast.error(result.error ?? "Couldn’t save the rules.");
          }
        });
      }}
    >
      <p className="text-type-caption-1 text-sub-text">
        Every page built from this clone follows these rules. The analysis
        drafted them; change anything that’s wrong.
      </p>
      <RuleField
        id={ids.terms}
        label="Never use these words"
        hint="One per line: the source’s brand and product names, its people and its own claims. A build removes any sentence still holding one."
        value={terms}
        onChange={setTerms}
        mono
      />
      <RuleField
        id={ids.copy}
        label="Copy rules"
        hint="Told to the copywriter for every page, e.g. “First person, like a diary.”"
        value={copy}
        onChange={setCopy}
      />
      <RuleField
        id={ids.keep}
        label="Keep these images as they are"
        hint="One per line: an image address (or part of one) or a CSS selector. Stars, ticks, badges, icons."
        value={keep}
        onChange={setKeep}
        mono
      />
      <RuleField
        id={ids.generic}
        label="Swap these for generic scenes"
        hint="One per line: photos that don’t show the product."
        value={generic}
        onChange={setGeneric}
        mono
      />
      <RuleField
        id={ids.images}
        label="Image rules"
        hint="Told to the image planner for every page."
        value={images}
        onChange={setImages}
      />
      <section className="flex flex-col gap-2">
        <h2 className="text-type-body-small font-medium">Line lengths</h2>
        <p className="text-type-caption-1 text-sub-text">
          Headings and buttons may run about 12 % longer than on the source.
        </p>
        {initial.length_caps.length > 0 ? (
          <ul role="list" className="flex flex-col gap-1">
            {initial.length_caps.map((cap) => (
              <li
                key={cap.match}
                className="flex items-baseline justify-between gap-4 rounded-md bg-foreground-01 px-3 py-1.5 text-type-caption-1"
              >
                <code className="min-w-0 truncate text-sub-text">
                  {cap.match}
                </code>
                <span className="shrink-0 tabular-nums">
                  {cap.max_chars} characters
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-type-caption-1 text-sub-text">None.</p>
        )}
      </section>
      <Button
        type="submit"
        size="sm"
        className="h-8 self-start"
        disabled={saving || !dirty}
      >
        Save rules
      </Button>
    </form>
  );
}

function RuleField({
  id,
  label,
  hint,
  value,
  onChange,
  mono = false,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  mono?: boolean;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea
        id={id}
        value={value}
        spellCheck={!mono}
        aria-describedby={`${id}-hint`}
        className={mono ? "max-h-48 overflow-y-auto font-mono" : "max-h-48"}
        onChange={(event) => onChange(event.target.value)}
      />
      <p id={`${id}-hint`} className="text-type-caption-1 text-sub-text">
        {hint}
      </p>
    </Field>
  );
}
