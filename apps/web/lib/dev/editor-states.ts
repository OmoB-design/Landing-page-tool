import type { AnalysisJob } from "@/lib/templates/queries";
import {
  type TemplateEditorState,
  templateEditorSchema,
} from "@/lib/validators/template";

// Sample data for /dev/editor-states (development only): a made-up competitor, "Vitalis".
// Kept out of app/ because its colours are data, which the token lint can't tell from styling.

export type LibrarySample = {
  id: string;
  name: string;
  template_sections: {
    key: string;
    role: string;
    label: string;
    position: number;
    removable: boolean;
    duplicable: boolean;
  }[];
};

const ANALYSIS = {
  ai: "claude",
  model: "claude-sonnet-5-5",
  analysed_at: "2026-10-30T10:12:00Z",
  palette: {
    primary: "#a82420",
    dark: "#252a32",
    tint: "#edeae5",
    accent: "#c60000",
  },
  brand_tokens: ["Vitalis", "Vitalis Aged Garlic", "Vitalis Heart Complex"],
  logo_srcs: [],
  cta_hrefs: ["https://vitalis-health.example/products/aged-garlic"],
  notes:
    "A fake-article advertorial with a dateline and read time, an FDA disclaimer and sticky top and bottom buy bars.",
  reviewed_at: null,
  reviewed_by: null,
};

const INSTRUCTIONS = {
  copy_rules:
    "Written in the first person to a reader over 60. Short paragraphs, soft ‘helps support’ claims, and the garden-hose metaphor for two-sided heart health.",
  length_caps: [
    { match: "h1@", max_chars: 112 },
    { match: "h2@", max_chars: 68 },
    { match: "h3@", max_chars: 50 },
    { match: "a.btn.btn-v2", max_chars: 32 },
  ],
  image_rules: "Photos of people over 60 at home, natural light.",
  generic_images: ["https://img.vitalis-health.example/kitchen-morning.webp"],
  keep_images: [
    "https://img.vitalis-health.example/stars-5.svg",
    "https://img.vitalis-health.example/check.svg",
  ],
  forbidden_terms: [
    "Vitalis",
    "Vitalis Aged Garlic",
    "Dr. Helen Reyes",
    "20-month aged",
    "50,312 customers",
  ],
  notes: "Drafted by analysis (claude, claude-sonnet-5-5) on 2026-10-30.",
};

const SAMPLE_FIELDS = [
  {
    label: "Headline",
    text: "You’ve done everything right. Your numbers stayed the same.",
  },
  {
    label: "Text",
    text: "Heart health has two sides. Almost every conversation you’ve had about it has only been about one of them.",
  },
  { label: "Text", text: "Updated: May 6, 2026 • 9 min read" },
];

export function sample(
  id: string,
  library: LibrarySample,
): { state: TemplateEditorState; job: AnalysisJob | null } {
  const owned = id === "owned";
  const analysed = !["unanalysed", "owned"].includes(id);
  const rows = [...library.template_sections].sort(
    (a, b) => a.position - b.position,
  );
  const sections =
    id === "unanalysed"
      ? []
      : rows.map((row, index) => ({
          ...row,
          number: null,
          title: row.label,
          fields: index === 0 ? SAMPLE_FIELDS : SAMPLE_FIELDS.slice(1),
          words: 120 + index * 37,
          images: index % 3,
          group: 0,
        }));
  const state = templateEditorSchema.parse({
    template: {
      id: library.id,
      name: owned ? library.name : "Cardio report (cloned)",
      description: null,
      type: "advertorial",
      version: analysed ? 2 : 1,
      parent_name: owned ? library.name : null,
      updated_at: "2026-10-30T10:12:00Z",
      origin: owned ? "owned" : "cloned",
      source: owned
        ? null
        : {
            url: "https://try.vitalis-health.example/cardio-report",
            host: "try.vitalis-health.example",
            name: "Vitalis",
            platform: "funnelish",
            verdict: null,
          },
      analysis: analysed
        ? {
            ...ANALYSIS,
            ...(id === "confirmed"
              ? {
                  reviewed_at: "2026-10-30T10:20:00Z",
                  reviewed_by: "Bolaji",
                }
              : {}),
          }
        : null,
      ready: owned || id === "confirmed",
    },
    instructions: owned ? {} : analysed ? INSTRUCTIONS : {},
    sections,
    versions: [
      ...(analysed
        ? [
            {
              version: 2,
              reason: `Analysed: ${sections.length} sections`,
              created_at: "2026-10-30T10:12:00Z",
              current: true,
            },
          ]
        : []),
      {
        version: 1,
        reason: owned
          ? "Copied from the library"
          : "Cloned from try.vitalis-health.example",
        created_at: "2026-10-30T10:11:00Z",
        current: !analysed,
      },
    ],
    can_undo: analysed,
    can_redo: false,
    issues: owned
      ? []
      : [
          {
            severity: "info",
            section: null,
            message:
              "A block outside every section (div.sticky-bar, “DISCOVER THE SOLUTION - SHOP NOW”) can't be moved or removed.",
          },
          {
            severity: "info",
            section: null,
            message: "8 scripts: they run in exports, not in this preview.",
          },
          {
            severity: "info",
            section: null,
            message:
              "Mentions Vitalis, Dr. Helen Reyes; builds remove these words.",
          },
        ],
    look: { colours: [], heading_font: null, body_font: null },
    words: sections.reduce((sum, s) => sum + s.words, 0),
    read_minutes: 9,
  });
  const job: AnalysisJob | null =
    id === "analysing"
      ? { id: crypto.randomUUID(), status: "running", error: null }
      : id === "failed"
        ? {
            id: crypto.randomUUID(),
            status: "failed",
            error:
              "The analysis came back incomplete, so nothing was saved. Try again.",
          }
        : null;
  return { state, job };
}
