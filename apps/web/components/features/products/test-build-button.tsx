"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { LoadingIcon, PagesIcon } from "@/components/ui/icons";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { startTestBuild } from "@/lib/builds/actions";

export type BuildableTemplate = { id: string; name: string; group: string };

/**
 * Temporary (B0.6a; template picker B1.1a): builds a page for this product from a library or
 * workspace template and opens it. The create wizard (B1.2) replaces it.
 */
export function TestBuildButton({
  productId,
  templates,
}: {
  productId: string;
  templates: BuildableTemplate[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const groups = [...new Set(templates.map((t) => t.group))];
  if (templates.length === 0) {
    return (
      <p className="text-sm text-fg-muted">
        No templates yet: load the library with pnpm seed:library.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={templateId} onValueChange={setTemplateId}>
          <SelectTrigger aria-label="Template" className="h-8 w-64">
            <SelectValue placeholder="Choose a template" />
          </SelectTrigger>
          <SelectContent>
            {groups.map((group) => (
              <SelectGroup key={group}>
                <SelectLabel>{group}</SelectLabel>
                {templates
                  .filter((t) => t.group === group)
                  .map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="h-8"
          disabled={pending || !templateId}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await startTestBuild(productId, templateId);
              if (result.buildId) router.push(`/pages/${result.buildId}`);
              else setError(result.error ?? "Couldn't start the build.");
            })
          }
        >
          {pending ? (
            <LoadingIcon
              aria-hidden
              className="animate-spin motion-reduce:animate-spin-slow"
            />
          ) : (
            <PagesIcon aria-hidden />
          )}
          Build a test page
        </Button>
      </div>
      <span className="text-sm text-fg-muted">
        Temporary: pick a template to try until the create wizard arrives.
      </span>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
