"use client";

import { useMutation } from "@tanstack/react-query";
import { type ReactNode, useId } from "react";

import { SkeletonText } from "@/components/app/skeletons";
import { toast } from "@/components/app/toaster";
import { Skeleton } from "@/components/ui/shimmer-loader";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/lib/api/client";
import {
  useIntegrations,
  useSetIntegrations,
} from "@/lib/queries/integrations";
import {
  type IntegrationsState,
  integrationsStateSchema,
} from "@/lib/validators/publishing";

import { SettingsDivider, SettingsPage } from "./settings-page";

/** A labelled row of a settings section: the label and its hint on the left, the control right. */
function Row({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6">
      <div className="min-w-0">
        <label
          htmlFor={htmlFor}
          className="text-type-body-small font-medium text-heading-01"
        >
          {label}
        </label>
        {hint ? (
          <p className="mt-0.5 text-type-caption-1 text-heading-05">{hint}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/**
 * Settings → General (D88): the workspace's name, and Testing with the owner's switch that lets
 * pages with placeholder images be published (D87). Renaming arrives with Members (B1.6).
 */
export function GeneralSettings({
  workspace,
  initial,
}: {
  workspace: { name: string };
  initial: IntegrationsState;
}) {
  const { data } = useIntegrations(initial);
  const save = useSetIntegrations();
  const switchId = useId();
  const toggle = useMutation({
    mutationFn: (allow: boolean) =>
      apiFetch("/api/orgs/testing", integrationsStateSchema, {
        method: "POST",
        body: JSON.stringify({ allow_placeholder_publish: allow }),
      }),
    onSuccess: (next) => {
      save(next);
      toast.success(
        next.allow_placeholder_publish
          ? "Pages with placeholder images can be published"
          : "Placeholder images block publishing again",
      );
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <SettingsPage
      title="General"
      description="Your workspace, and settings for trying things out."
    >
      <section className="flex flex-col gap-4">
        <h2 className="text-type-body-small font-medium text-heading-01">
          Workspace
        </h2>
        <Row label="Name" hint="Shown in the sidebar and on invitations.">
          <span className="truncate text-type-body-small text-heading-05">
            {workspace.name}
          </span>
        </Row>
      </section>
      <SettingsDivider />
      <section className="flex flex-col gap-4">
        <h2 className="text-type-body-small font-medium text-heading-01">
          Testing
        </h2>
        <Row
          label="Publish with placeholder images"
          htmlFor={switchId}
          hint={
            data.role === "owner"
              ? "Until real images arrive, pages have placeholders, which normally block publishing. Each such publish is recorded as published anyway."
              : "Only the owner can change this."
          }
        >
          <Switch
            id={switchId}
            checked={data.allow_placeholder_publish}
            disabled={data.role !== "owner" || toggle.isPending}
            onCheckedChange={(checked) => toggle.mutate(checked)}
          />
        </Row>
      </section>
    </SettingsPage>
  );
}

/**
 * General while it loads, measured against the loaded page (2026-10-31): the same title, sections
 * and rows; the workspace name and the switch are the only things still to come.
 */
export function GeneralSettingsSkeleton() {
  return (
    <SettingsPage
      title="General"
      description="Your workspace, and settings for trying things out."
    >
      <section aria-hidden className="flex flex-col gap-4">
        <h2 className="text-type-body-small font-medium text-heading-01">
          Workspace
        </h2>
        <Row label="Name" hint="Shown in the sidebar and on invitations.">
          <SkeletonText className="text-type-body-small" width={72} />
        </Row>
      </section>
      <SettingsDivider />
      <section aria-hidden className="flex flex-col gap-4">
        <h2 className="text-type-body-small font-medium text-heading-01">
          Testing
        </h2>
        <Row
          label="Publish with placeholder images"
          hint="Until real images arrive, pages have placeholders, which normally block publishing. Each such publish is recorded as published anyway."
        >
          <Skeleton width={34} height={19} radius="var(--radius-max)" />
        </Row>
      </section>
    </SettingsPage>
  );
}
