import type { TemplateEditorState } from "@/lib/validators/template";

/** The Look tab: the colours and fonts the template declares (builds swap them for the brand's). */
export function LookPanel({ look }: { look: TemplateEditorState["look"] }) {
  const fonts = [
    ["Headings", look.heading_font],
    ["Body", look.body_font],
  ] as const;
  return (
    <div className="flex flex-col gap-6 p-4">
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
            This template doesn’t declare brand colours (--lp-primary and
            friends), so builds can’t recolour it.
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
