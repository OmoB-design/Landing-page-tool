import { Skeleton } from "@/components/ui/shimmer-loader";

/**
 * The brand's logo above the website field (Figma: the 36 px square in Brands/Enter details,
 * Foreground-02 with 8 px corners). While the site is being read it shimmers; as soon as the
 * fetch finds a logo it shows here.
 */
export function BrandLogoSlot({
  logoUrl,
  searching,
}: {
  logoUrl: string | null;
  searching: boolean;
}) {
  if (logoUrl) {
    return (
      <span className="flex size-9 items-center justify-center overflow-hidden rounded-md bg-foreground-02 p-1">
        {/* The logo is shown from the brand's own site until the brand is saved. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt="Logo found on the site"
          className="max-h-full max-w-full object-contain"
        />
      </span>
    );
  }
  if (searching) {
    return (
      <span role="status" aria-label="Looking for the logo" className="size-9">
        <Skeleton
          width="100%"
          height="100%"
          radius="var(--radius-md)"
          // Starts from the square's own colour; the sweep runs over it.
          style={{ backgroundColor: "var(--color-foreground-02)" }}
        />
      </span>
    );
  }
  return <span aria-hidden className="size-9 rounded-md bg-foreground-02" />;
}
