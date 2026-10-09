import type { StepDefinition } from "@/lib/jobs/steps";

/**
 * The pipeline's steps for an owned build, in order (services/worker/app/pipeline/graph.py
 * ORDER["owned"]). Each node reports `data.step` when it finishes. Cloned builds get their own
 * list in M2.
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
