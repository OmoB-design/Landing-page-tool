import type { Icon } from "@/components/ui/icons";

import { EmptyState } from "./empty-state";
import { PageHeader } from "./page-header";

/** Placeholder for a route whose screen is built later: the page header and an empty state. */
export function PageStub({
  title,
  icon,
  arrivesIn,
}: {
  title: string;
  icon: Icon;
  /** The build that delivers the screen, e.g. "B0.5". */
  arrivesIn?: string;
}) {
  return (
    <>
      <PageHeader icon={icon} title={title} />
      <EmptyState icon={icon} title="Not built yet">
        {arrivesIn
          ? `This screen arrives in ${arrivesIn}.`
          : "This screen arrives in a later build."}
      </EmptyState>
    </>
  );
}
