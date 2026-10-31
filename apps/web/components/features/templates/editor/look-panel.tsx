import type {
  TemplateAnalysis,
  TemplateEditorState,
} from "@/lib/validators/template";

const unique = (values: string[]) => [...new Set(values)];

const PALETTE_ROLES = [
  ["primary", "Primary"],
  ["dark", "Dark"],
  ["tint", "Tint"],
  ["accent", "Accent"],
] as const;

/** The Look tab: the colours and fonts the template declares (builds swap them for the brand's);
 * for an analysed clone, first what the analysis found on the source (B2.2). */
export function LookPanel({
  look,
  analysis = null,
}: {
  look: TemplateEditorState["look"];
  analysis?: TemplateAnalysis | null;
}) {
  const fonts = [
    ["Headings", look.heading_font],
    ["Body", look.body_font],
  ] as const;
  return (
    <div className="flex flex-col gap-6 p-4">
      {analysis ? <SourceLook analysis={analysis} /> : null}
      <p className="text-type-caption-1 text-sub-text">
        The template’s own colours and fonts. Every build swaps them for the
        brand’s, from its Brand DNA.
      </p>
      <section className="flex flex-col gap-3">
        <h2 className="text-type-body-small font-medium">Colours</h2>
        {look.colours.length > 0 ? (
          <ul role="list" className="grid grid-cols-2 gap-2">
            {look.colours.map((colour) => (
              <li
                key={colour.token}
                className="flex items-center gap-3 rounded-md bg-foreground-01 p-2"
              >
                <span
                  aria-hidden
                  className="size-8 shrink-0 rounded-sm border border-stroke"
                  // The template's own colour value is data, not app styling.
                  style={{ backgroundColor: colour.value }}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="text-type-caption-1 font-medium">
                    {colour.name}
                  </span>
                  <span className="truncate font-mono text-type-caption-1 text-sub-text uppercase">
                    {colour.value}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-type-caption-1 text-sub-text">
            {analysis
              ? "None declared: builds recolour this clone from the colours found on the source."
              : "This template doesn’t declare brand colours (--lp-primary and friends), so builds can’t recolour it."}
          </p>
        )}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-type-body-small font-medium">Fonts</h2>
        <dl className="flex flex-col gap-1.5">
          {fonts.map(([label, font]) => (
            <div
              key={label}
              className="flex items-baseline justify-between gap-4 rounded-md bg-foreground-01 px-3 py-2 text-type-caption-1"
            >
              <dt className="text-sub-text">{label}</dt>
              <dd>{font ?? "Not set"}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

/** What the analysis found on the source: its colours, brand words, logos and buy links. */
function SourceLook({ analysis }: { analysis: TemplateAnalysis }) {
  return (
    <section className="flex flex-col gap-4 rounded-md bg-foreground-01 p-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-type-body-small font-medium">
          Found on the source
        </h2>
        <p className="text-type-caption-1 text-sub-text">
          Builds map these colours to the brand’s, put its logo where these
          logos are and its name where these words are.
        </p>
      </div>
      {/* Figma 722:15053: the swatches sit on a Dashboard band the card's full width. */}
      <ul
        role="list"
        className="-mx-3 grid grid-cols-4 gap-2 bg-dashboard px-3 py-2.5"
      >
        {PALETTE_ROLES.map(([role, label]) => {
          const value = analysis.palette[role];
          return (
            <li key={role} className="flex min-w-0 flex-col gap-1">
              <span
                aria-hidden
                className="h-8 rounded-sm border border-stroke"
                // The source's colour is data, not app styling.
                style={{ backgroundColor: value ?? "transparent" }}
              />
              <span className="text-type-caption-1 font-medium">{label}</span>
              <span className="truncate font-mono text-type-caption-2 text-sub-text uppercase">
                {value ?? "—"}
              </span>
            </li>
          );
        })}
      </ul>
      <SourceList title="Brand words" empty="None found.">
        {unique(analysis.brand_tokens).map((token) => (
          <li
            key={token}
            className="rounded-sm bg-surface-primary px-1.5 py-0.5 text-type-caption-1 ring-thin ring-stroke"
          >
            {token}
          </li>
        ))}
      </SourceList>
      <SourceList title="Logos" empty="None found.">
        {unique(analysis.logo_srcs).map((src) => (
          <li
            key={src}
            className="flex h-10 items-center rounded-sm bg-surface-primary px-2 ring-thin ring-stroke"
          >
            {/* The source's own logo, from its site (preview only). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="max-h-7 max-w-32 object-contain" />
          </li>
        ))}
      </SourceList>
      <SourceList title="Buy links" empty="None found.">
        {unique(analysis.cta_hrefs).map((href) => (
          <li
            key={href}
            className="max-w-full truncate font-mono text-type-caption-2 text-sub-text"
          >
            {href}
          </li>
        ))}
      </SourceList>
      {analysis.notes ? (
        <p className="text-type-caption-1 text-sub-text">{analysis.notes}</p>
      ) : null}
    </section>
  );
}

function SourceList({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-type-caption-1 font-medium text-sub-text">{title}</h3>
      {children.length > 0 ? (
        <ul role="list" className="flex flex-wrap gap-1.5">
          {children}
        </ul>
      ) : (
        <p className="text-type-caption-1 text-sub-text">{empty}</p>
      )}
    </div>
  );
}
