import type { ReactNode } from "react";

/**
 * The frame every brand page shares (Figma Brands Details), under the section tabs that the
 * brand layout draws: 40 px below them the page's own header (`header`), closed 20 px further
 * down by a full-width hairline; then 16 px below, the page body. With no header (Pages, Brand
 * DNA) there is no second line: the body starts 40 px under the tabs.
 */
export function BrandFrame({
  header,
  children,
}: {
  header?: ReactNode;
  children?: ReactNode;
}) {
  if (!header) {
    // 34 px plus the column's own 6 px.
    return <div className="flex flex-col pt-8.5 pb-12">{children}</div>;
  }
  return (
    <div className="flex flex-col gap-4 pb-12">
      <section className="flex flex-col items-center px-6 pt-10 pb-5 divider-b-thin">
        <div className="flex w-full max-w-pages flex-col">{header}</div>
      </section>
      {children}
    </div>
  );
}

/** A centred column below the frame's line: 600 px for details, 1100 px for lists. */
export function BrandColumn({
  width = "detail",
  children,
}: {
  width?: "detail" | "list" | "wide";
  children: ReactNode;
}) {
  const max = {
    detail: "max-w-150",
    wide: "max-w-200",
    list: "max-w-pages",
  }[width];
  return (
    <div className="px-6 py-1.5">
      <div className={`mx-auto w-full ${max}`}>{children}</div>
    </div>
  );
}
