import type { Metadata } from "next";
import { Suspense } from "react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { type ViewTab, ViewTabs } from "@/components/app/view-tabs";
import { TemplateCard } from "@/components/features/templates/template-card";
import { TemplatesIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/shimmer-loader";
import { getSessionContext } from "@/lib/auth/session";
import { getLibraryTemplates, getOrgTemplates } from "@/lib/templates/queries";

export const metadata: Metadata = { title: "Templates" };

type View = "library" | "yours";

/**
 * /templates (BUILD_SPEC §8.3; Figma: Template/Library and Template/Yours, light and dark): the
 * Pages layout, a 1100 px column 48 px under the header with the serif title and its line,
 * Library / Yours with counts on a hairline, and 32 px below, the cards four to a row, 10 px
 * apart.
 */
export default function TemplatesPage({
  searchParams,
}: PageProps<"/templates">) {
  return (
    <Suspense fallback={<TemplatesFallback />}>
      <Templates searchParams={searchParams} />
    </Suspense>
  );
}

async function Templates({
  searchParams,
}: Pick<PageProps<"/templates">, "searchParams">) {
  const view: View =
    (await searchParams).view === "yours" ? "yours" : "library";
  const { currentOrg } = await getSessionContext();
  const [library, yours] = await Promise.all([
    getLibraryTemplates(),
    getOrgTemplates(currentOrg.id),
  ]);
  const templates = view === "library" ? library : yours;
  const tabs: ViewTab<View>[] = [
    {
      id: "library",
      label: "Library",
      count: library.length,
      href: "/templates",
    },
    {
      id: "yours",
      label: "Yours",
      count: yours.length,
      href: "/templates?view=yours",
    },
  ];
  return (
    <>
      <PageHeader icon={TemplatesIcon} title="Templates" />
      <div className="mx-auto box-content flex w-full max-w-pages flex-col gap-8 px-6 py-12">
        <div className="flex flex-col gap-1">
          <div className="flex flex-col gap-1.5 pr-1 pb-4">
            <h1 className="font-serif text-type-title font-medium text-button-secondary-text">
              Templates
            </h1>
            <p className="text-type-body-small leading-5 font-medium text-sub-text">
              Proven page designs. Use one to make it yours; every page built
              from it is rewritten for your brand and product.
            </p>
          </div>
          <div className="flex h-9 items-center divider-b-thin">
            <ViewTabs label="Template views" tabs={tabs} active={view} />
          </div>
        </div>
        {templates.length === 0 ? (
          <EmptyState
            icon={TemplatesIcon}
            title={
              view === "yours" ? "No templates yet" : "The library is empty"
            }
          >
            {view === "yours"
              ? "Choose Use Template on a library template to add it here."
              : "Library templates are loaded with pnpm seed:library."}
          </EmptyState>
        ) : (
          <ul
            role="list"
            className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {templates.map((template) => (
              <li key={template.id} className="flex">
                <TemplateCard template={template} kind={view} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function TemplatesFallback() {
  return (
    <>
      <PageHeader icon={TemplatesIcon} title="Templates" />
      <div className="mx-auto box-content flex w-full max-w-pages flex-col gap-8 px-6 py-12">
        <Skeleton
          height="calc(var(--spacing) * 29)"
          radius="var(--radius-sm)"
        />
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton
              key={index}
              height="calc(var(--spacing) * 83)"
              radius="var(--radius-card)"
            />
          ))}
        </div>
      </div>
    </>
  );
}
