"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { toast } from "@/components/app/toaster";
import { Button } from "@/components/ui/button";
import { LoadingIcon, PlusIcon } from "@/components/ui/icons";
import { addTemplate } from "@/lib/templates/actions";

/** Copies a library template into the workspace, then shows it under Yours. */
export function UseTemplateButton({
  templateId,
  name,
}: {
  templateId: string;
  name: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      className="h-8"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await addTemplate(templateId);
          if (result.ok) {
            toast.success(`Added ${name} to your templates`);
            router.push("/templates?view=yours");
          } else {
            toast.error(result.error ?? "Couldn't add the template.");
          }
        })
      }
    >
      {pending ? (
        <LoadingIcon
          aria-hidden
          className="animate-spin motion-reduce:animate-spin-slow"
        />
      ) : (
        <PlusIcon aria-hidden />
      )}
      Use template
    </Button>
  );
}
