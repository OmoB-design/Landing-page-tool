import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  type Tab,
  TemplateEditor,
} from "@/components/features/templates/editor/template-editor";
import { createClient } from "@/lib/supabase/server";
import { sample } from "@/lib/dev/editor-states";

export const metadata: Metadata = { title: "Editor states" };

/**
 * The section editor for a cloned page in each state (B2.2), development only, with sample data
 * (a made-up competitor, "Vitalis"), for designing it in Figma. The preview shows one of the
 * library's templates, so its sections are real; the panel shows the sample. Buttons reach the
 * worker with a template that doesn't exist, so they only fail politely.
 */
const STATES: {
  id: string;
  label: string;
  tab?: Tab;
}[] = [
  { id: "review", label: "Analysed, waiting for review (Content)" },
  { id: "look", label: "Analysed: Look, found on the source", tab: "look" },
  { id: "rules", label: "Analysed: Rules", tab: "rules" },
  { id: "details", label: "Analysed: Details", tab: "details" },
  { id: "issues", label: "Analysed: Issues", tab: "issues" },
  { id: "analysing", label: "Analysing" },
  { id: "failed", label: "Analysis failed (an earlier one waits)" },
  { id: "unanalysed", label: "Not analysed yet" },
  { id: "confirmed", label: "Confirmed (ready to build)" },
  { id: "owned", label: "An owned template, for comparison" },
];

async function libraryTemplate() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("templates")
    .select(
      "id, name, template_sections(key, role, label, position, removable, duplicable)",
    )
    .is("org_id", null)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("name")
    .limit(1)
    .maybeSingle();
  return data;
}

export default async function EditorStatesPage({
  searchParams,
}: PageProps<"/dev/editor-states">) {
  if (process.env.NODE_ENV !== "development") notFound();
  const id = (await searchParams).state;
  const library = await libraryTemplate();
  const chosen = STATES.find((s) => s.id === id);
  if (!chosen || !library) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 overflow-y-auto p-10">
        <h1 className="font-serif text-type-title font-medium text-heading-01">
          Editor states
        </h1>
        <p className="text-type-body-small text-sub-text">
          The section editor for a cloned page in each state (B2.2), with sample
          data. Each opens full screen.
          {library ? "" : " (Load the library first: pnpm seed:library.)"}
        </p>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-type-body-small">
          {STATES.map((state) => (
            <li key={state.id}>
              <Link
                href={`/dev/editor-states?state=${state.id}`}
                className="text-text-link hover:underline"
              >
                {state.label}
              </Link>
            </li>
          ))}
        </ol>
      </div>
    );
  }
  const { state, job } = sample(chosen.id, library);
  return (
    <TemplateEditor
      key={chosen.id}
      initial={state}
      analysisJob={job}
      initialTab={chosen.tab}
    />
  );
}
