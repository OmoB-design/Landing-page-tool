"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { toast } from "@/components/app/toaster";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { PlusFigmaIcon } from "@/components/ui/lp-icons";
import { addTemplate } from "@/lib/templates/actions";

/** Library card → Use Template: copies the template into the workspace, then shows it under Yours. */
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
      size="compact"
      className="flex-1"
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
      {pending ? <Spinner className="size-3.5" /> : <PlusFigmaIcon />}
      Use Template
      <span className="sr-only"> {name}</span>
    </Button>
  );
}
