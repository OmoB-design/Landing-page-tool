import type { StepDefinition } from "@/lib/jobs/steps";

/**
 * The pipeline's steps for an owned build, in order (services/worker/app/pipeline/graph.py
 * ORDER["owned"]). Each node reports `data.step` when it finishes.
 */
export const OWNED_BUILD_STEPS: StepDefinition[] = [
  { id: "load_inputs", label: "Load the template, brand and product" },
  { id: "apply_section_layout", label: "Arrange the sections" },
  { id: "recolor", label: "Apply the brand colours and fonts" },
  { id: "swap_logos", label: "Swap in the logo" },
  { id: "regenerate_variants", label: "Build the product options" },
  { id: "copy_rewrite", label: "Rewrite the copy" },
  { id: "purge_terms", label: "Remove forbidden terms" },
  { id: "prepare_media_slots", label: "Prepare the image slots" },
  { id: "image_pass", label: "Place the images" },
  { id: "finalize_common", label: "Finish the page" },
  { id: "product_fidelity", label: "Match the product photos" },
  { id: "compliance_scan", label: "Check the claims" },
  { id: "write_report", label: "Write the report" },
];

/**
 * A cloned build's steps (ORDER["cloned"], B2.3): the owned steps with the clone-only ones where
 * the pipeline runs them.
 */
export const CLONED_BUILD_STEPS: StepDefinition[] = OWNED_BUILD_STEPS.flatMap(
  (step): StepDefinition[] => {
    switch (step.id) {
      case "prepare_media_slots":
        return [
          { id: "strip_chrome", label: "Strip the store's header and footer" },
          step,
        ];
      case "product_fidelity":
        return [
          { id: "scrub_source_brand", label: "Remove the source brand" },
          { id: "scrub_scripts", label: "Clean up scripts and fonts" },
          { id: "rewrite_links", label: "Point the links at the product" },
          { id: "purge_foreign_assets", label: "Remove the source's files" },
          step,
        ];
      case "compliance_scan":
        return [
          { id: "residue_scan", label: "Score what's left of the source" },
          step,
        ];
      default:
        return [step];
    }
  },
);

/** The steps for a build of this origin. */
export function buildStepsFor(
  origin: string | null | undefined,
): StepDefinition[] {
  return origin === "cloned" ? CLONED_BUILD_STEPS : OWNED_BUILD_STEPS;
}
