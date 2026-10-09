import Link from "next/link";

import { authLinkClass } from "@/components/app/auth-frame";
import type { getBrand } from "@/lib/brands/queries";

type Brand = NonNullable<Awaited<ReturnType<typeof getBrand>>>;

/** Overview tab: logo, tagline, colours, fonts, voice and what's next. */
export function BrandOverview({ brand }: { brand: Brand }) {
  const { row } = brand;
  const palette = (row.palette ?? {}) as Record<
    string,
    string | null | undefined
  >;
  const fonts = (row.fonts ?? {}) as Record<string, string | null | undefined>;
  const swatches = (["primary", "dark", "tint", "accent"] as const)
    .map((name) => ({ name, hex: palette[name] }))
    .filter((swatch): swatch is { name: typeof swatch.name; hex: string } =>
      Boolean(swatch.hex),
    );

  return (
    <div className="flex max-w-2xl flex-col gap-8 px-6 py-6">
      <section className="flex items-center gap-4">
        <div className="flex h-14 w-36 items-center justify-center rounded-md border border-border bg-surface-muted">
          {brand.logoUrl ? (
            // Brand logos are stored in the public assets bucket.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logoUrl}
              alt={`${row.name} logo`}
              className="max-h-11 max-w-32 object-contain"
            />
          ) : (
            <span className="text-sm text-fg-subtle">No logo yet</span>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-md font-semibold">{row.name}</p>
          {row.tagline ? (
            <p className="text-base text-fg-muted">{row.tagline}</p>
          ) : null}
          {row.url ? (
            <a
              href={row.url}
              target="_blank"
              rel="noreferrer"
              className={`${authLinkClass} text-sm`}
            >
              {new URL(row.url).hostname}
            </a>
          ) : null}
        </div>
      </section>

      <Detail title="Colours">
        {swatches.length > 0 ? (
          <ul className="flex flex-wrap gap-3">
            {swatches.map((swatch) => (
              <li key={swatch.name} className="flex items-center gap-2 text-sm">
                <span
                  aria-hidden
                  style={{ backgroundColor: swatch.hex }}
                  className="size-6 rounded-xs border border-border"
                />
                <span className="text-fg-muted capitalize">{swatch.name}</span>
                <span className="font-mono">{swatch.hex}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-muted">No colours yet.</p>
        )}
      </Detail>

      <Detail title="Fonts">
        <p className="text-base">
          {fonts.heading || fonts.body
            ? `${fonts.heading ?? "—"} for headings · ${fonts.body ?? "—"} for text`
            : "No fonts yet."}
        </p>
      </Detail>

      <Detail title="Voice">
        <p className="text-base">{row.voice ?? "Not written yet."}</p>
        {row.voice_examples.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-1 text-sm text-fg-muted">
            {row.voice_examples.map((line) => (
              <li key={line}>“{line}”</li>
            ))}
          </ul>
        ) : null}
      </Detail>

      <p className="text-sm text-fg-muted">
        <Link href={`/brands/${row.id}/dna`} className={authLinkClass}>
          Edit Brand DNA
        </Link>{" "}
        to change any of this.
      </p>
    </div>
  );
}

function Detail({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-fg-muted">{title}</h2>
      {children}
    </section>
  );
}
