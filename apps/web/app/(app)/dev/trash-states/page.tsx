import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/app/page-header";
import { TrashSettings } from "@/components/features/settings/trash";
import { SettingsIcon } from "@/components/ui/icons";
import type { TrashState } from "@/lib/validators/trash";

export const metadata: Metadata = { title: "Trash states" };

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 28, 12);
function item(
  kind: TrashState["items"][number]["kind"],
  name: string,
  detail: string | null,
  daysAgo: number,
  by: string | null,
) {
  return {
    kind,
    id: crypto.randomUUID(),
    name,
    detail,
    deleted_at: new Date(NOW - daysAgo * DAY).toISOString(),
    deleted_by: by,
    expires_at: new Date(NOW + (7 - daysAgo) * DAY).toISOString(),
  };
}
const ITEMS: TrashState["items"] = [
  item("page", "LUM-12 · Calm skin in a week", "Lumé", 0, "Ada Lovelace"),
  item("brand", "Bré", "With 3 pages and 2 products", 1, "Grace Hopper"),
  item("product", "Black Cherry Lemonade", "Bré", 2, null),
  item("template", "Listicle: 10 reasons", null, 5, "Ada Lovelace"),
];

/** Settings → Trash in each state (D92), development only; the buttons only say they're samples. */
export default function TrashStatesPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <>
      <PageHeader icon={SettingsIcon} title="Trash states" />
      <State label="1 · An owner or admin: Restore and Permanently delete">
        <TrashSettings
          sample
          initial={{ items: ITEMS, can_permanently_delete: true }}
        />
      </State>
      <State label="2 · A member: Restore only">
        <TrashSettings
          sample
          initial={{ items: ITEMS, can_permanently_delete: false }}
        />
      </State>
      <State label="3 · Empty">
        <TrashSettings
          sample
          initial={{ items: [], can_permanently_delete: true }}
        />
      </State>
      <State label="4 · Loading">
        <TrashSettings sample loading />
      </State>
      <State label="5 · The worker can't be reached">
        <TrashSettings sample initial={null} />
      </State>
    </>
  );
}

function State({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="divider-b-half">
      <p className="px-6 pt-6 text-type-caption-1 font-medium text-heading-05">
        {label}
      </p>
      {children}
    </section>
  );
}
