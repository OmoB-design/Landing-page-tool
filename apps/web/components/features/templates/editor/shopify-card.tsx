import {
  AlertIcon,
  CheckIcon,
  InfoIcon,
  WarningIcon,
} from "@/components/ui/icons";
import type { ShopifyMap } from "@/lib/validators/template";

const LEVEL = {
  error: { icon: AlertIcon, label: "Problem", tone: "text-spot-500-red" },
  warning: {
    icon: WarningIcon,
    label: "Warning",
    tone: "text-spot-500-yellow",
  },
  info: { icon: InfoIcon, label: "Note", tone: "text-caption-1" },
} as const;

function count(n: number, noun: string) {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/**
 * Shopify editing (B4.1, D120; no Figma frame yet, styled as the Details tab's other sections and
 * the Issues tab's rows): what a page from this template would let people change in Shopify's theme
 * editor once M4 publishes editable sections. One line with the totals (and what can't be edited
 * there, which still shows), notes and problems, then each section with its editable texts,
 * pictures and videos; sections gathered from parts outside the marked ones say "Added".
 */
export function ShopifyCard({ map }: { map: ShopifyMap }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="shopify-editing">
      <h2
        id="shopify-editing"
        className="flex items-center gap-2 text-type-body-small font-medium"
      >
        {map.ready ? (
          <CheckIcon aria-hidden className="size-4 text-spot-500-green" />
        ) : (
          <AlertIcon aria-hidden className="size-4 text-spot-500-red" />
        )}
        Shopify editing
      </h2>
      <p className="text-type-caption-1 text-sub-text">
        {map.ready
          ? "When a page from this template goes to Shopify as editable sections, these parts can be changed in Shopify’s theme editor."
          : "Pages from this template can’t go to Shopify as editable sections yet."}
      </p>
      <p className="text-type-caption-1 font-medium">
        {count(map.sections.length, "section")} · {count(map.texts, "text")} ·{" "}
        {count(map.images, "picture")}
        {map.media > 0 ? ` · ${count(map.media, "video")}` : ""} editable
      </p>
      {map.static > 0 ? (
        <p className="text-type-caption-1 text-sub-text">
          {map.static} can’t be edited in Shopify. They still show on the page;
          change them in LP and publish again.
        </p>
      ) : null}
      {map.issues.length > 0 ? (
        <ul role="list" className="flex flex-col gap-1.5">
          {map.issues.map((issue, i) => {
            const { icon: LevelIcon, label, tone } = LEVEL[issue.level];
            return (
              <li
                key={`${issue.level}-${i}`}
                className="flex items-start gap-2.5 rounded-md bg-foreground-01 px-3 py-2 text-type-caption-1"
              >
                <LevelIcon
                  aria-hidden
                  className={`mt-0.5 size-4 shrink-0 ${tone}`}
                />
                <span className="sr-only">{label}: </span>
                <span className="min-w-0 flex-1 break-words">
                  {issue.message}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {map.sections.length > 0 ? (
        <ol className="flex flex-col gap-1.5">
          {map.sections.map((section) => (
            <li
              key={section.key}
              className="flex items-baseline justify-between gap-4 rounded-md bg-foreground-01 px-3 py-2 text-type-caption-1"
            >
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="truncate font-medium">{section.name}</span>
                {section.loose ? (
                  <span className="shrink-0 text-sub-text">Added</span>
                ) : null}
              </span>
              <span className="shrink-0 text-sub-text tabular-nums">
                {[
                  section.texts > 0 ? count(section.texts, "text") : null,
                  section.images > 0 ? count(section.images, "picture") : null,
                  section.media > 0 ? count(section.media, "video") : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Nothing to edit"}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
