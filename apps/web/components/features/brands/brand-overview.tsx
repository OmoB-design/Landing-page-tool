import Link from "next/link";

import { authLinkClass } from "@/components/app/auth-frame";
import { PageBody } from "@/components/app/page-body";
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
    <PageBody className="gap-8">
      <section className="flex items-center gap-4">
        <div className="flex h-14 w-36 items-center justify-center rounded-md border border-stroke bg-foreground-01">
          {brand.logoUrl ? (
            // Brand logos are stored in the public assets bucket.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logoUrl}
              alt={`${row.name} logo`}
              className="max-h-11 max-w-32 object-contain"
            />
          ) : (
            <span className="text-type-caption-1 text-caption-1">
              No logo yet
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-type-body-large font-semibold">{row.name}</p>
          {row.tagline ? (
            <p className="text-type-body-small text-sub-text">{row.tagline}</p>
          ) : null}
          {row.url ? (
            <a
              href={row.url}
              target="_blank"
              rel="noreferrer"
              className={`${authLinkClass} text-type-caption-1`}
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
              <li
                key={swatch.name}
                className="flex items-center gap-2 text-type-caption-1"
              >
                <span
                  aria-hidden
                  style={{ backgroundColor: swatch.hex }}
                  className="size-6 rounded-xsm border border-stroke"
                />
                <span className="text-sub-text capitalize">{swatch.name}</span>
                <span className="font-mono">{swatch.hex}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-type-caption-1 text-sub-text">No colours yet.</p>
        )}
      </Detail>

      <Detail title="Fonts">
        <p className="text-type-body-small">
          {fonts.heading || fonts.body
            ? `${fonts.heading ?? "—"} for headings · ${fonts.body ?? "—"} for text`
            : "No fonts yet."}
        </p>
      </Detail>

      <Detail title="Voice">
        <p className="text-type-body-small">
          {row.voice ?? "Not written yet."}
        </p>
        {row.voice_examples.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-1 text-type-caption-1 text-sub-text">
            {row.voice_examples.map((line) => (
              <li key={line}>“{line}”</li>
            ))}
          </ul>
        ) : null}
      </Detail>

      <p className="text-type-caption-1 text-sub-text">
        <Link href={`/brands/${row.id}/dna`} className={authLinkClass}>
          Edit Brand DNA
        </Link>{" "}
        to change any of this.
      </p>
    </PageBody>
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
      <h2 className="text-type-caption-1 font-medium text-sub-text">{title}</h2>
      {children}
    </section>
  );
}
