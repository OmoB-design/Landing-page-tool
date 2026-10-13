import { cn } from "@/lib/utils";

/**
 * The Brands title block (Figma: Brands/Empty, Enter details, fetch details): the 28 px serif
 * "Brands" with its line 6 px under it, then 48 px to what follows. On the new-brand screen a
 * 0.5 px Surface/Stroke line sits halfway (`bordered`).
 */
export function BrandsHeading({ bordered = false }: { bordered?: boolean }) {
  return (
    <div className="pb-6">
      <div
        className={cn(
          "flex flex-col gap-1.5 pr-1 pb-6",
          bordered && "divider-b-half",
        )}
      >
        <h1 className="font-serif text-type-title font-medium text-button-secondary-text">
          Brands
        </h1>
        <p className="text-type-body-small leading-5 font-medium text-sub-text">
          Brands you create will show here
        </p>
      </div>
    </div>
  );
}
