import type { Metadata } from "next";
import { Suspense } from "react";

import { EmptyState } from "@/components/app/empty-state";
import { PageBody } from "@/components/app/page-body";
import { PageHeader } from "@/components/app/page-header";
import { SegmentedTabs } from "@/components/app/segmented-tabs";
import { TemplateCard } from "@/components/features/templates/template-card";
import { TemplatesIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/shimmer-loader";
import { getSessionContext } from "@/lib/auth/session";
import { getLibraryTemplates, getOrgTemplates } from "@/lib/templates/queries";

export const metadata: Metadata = { title: "Templates" };

type View = "library" | "yours";

/** /templates: the curated library and the workspace's own templates (BUILD_SPEC §8.3). */
export default function TemplatesPage({
  searchParams,
}: PageProps<"/templates">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader icon={TemplatesIcon} title="Templates" />
          <PageBody width="xl">
            <Skeleton
              height="calc(var(--spacing-row) * 6)"
              radius="var(--radius-lg)"
            />
          </PageBody>
        </>
      }
    >
      <Templates searchParams={searchParams} />
    </Suspense>
  );
}

async function Templates({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const view: View =
    (await searchParams).view === "yours" ? "yours" : "library";
  const { currentOrg } = await getSessionContext();
  const templates =
    view === "library"
      ? await getLibraryTemplates()
      : await getOrgTemplates(currentOrg.id);
  const tabs = [
    { id: "library", label: "Library", href: "/templates" },
    { id: "yours", label: "Yours", href: "/templates?view=yours" },
  ];
  return (
    <>
      <PageHeader
        icon={TemplatesIcon}
        title="Templates"
        tabs={
          <SegmentedTabs label="Template views" tabs={tabs} active={view} />
        }
      />
      <PageBody width="xl">
        <p className="text-type-body-small text-sub-text">
          {view === "library"
            ? "Proven page designs. Use one to make it yours; every page built from it is rewritten for your brand and product."
            : "Your copies of library templates. Open one to rearrange its sections; builds use your arrangement."}
        </p>
        {templates.length === 0 ? (
          <EmptyState
            icon={TemplatesIcon}
            title={
              view === "yours" ? "No templates yet" : "The library is empty"
            }
          >
            {view === "yours"
              ? "Choose Use template on a library template to add it here."
              : "Library templates are loaded with pnpm seed:library."}
          </EmptyState>
        ) : (
          <ul role="list" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((template) => (
              <li key={template.id} className="flex">
                <TemplateCard template={template} kind={view} />
              </li>
            ))}
          </ul>
        )}
      </PageBody>
    </>
  );
}
