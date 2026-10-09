"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { toast } from "@/components/app/toaster";
import { Button } from "@/components/ui/button";
import { RemoveIcon } from "@/components/ui/icons";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { deleteTemplate } from "@/lib/templates/actions";

/** Deletes one of your templates after a confirm (pages built from it keep working). */
export function DeleteTemplateButton({
  templateId,
  name,
}: {
  templateId: string;
  name: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8" disabled={pending}>
          <RemoveIcon aria-hidden />
          Delete
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <PopoverHeader>
          <PopoverTitle>Delete {name}?</PopoverTitle>
          <PopoverDescription>
            Pages already built from it keep working. You can add it again from
            the library.
          </PopoverDescription>
        </PopoverHeader>
        <Button
          variant="destructive"
          size="sm"
          className="h-8 w-fit"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await deleteTemplate(templateId);
              if (result.ok) {
                toast.success(`Deleted ${name}`);
                router.refresh();
              } else {
                toast.error(result.error ?? "Couldn't delete the template.");
              }
            })
          }
        >
          Delete template
        </Button>
      </PopoverContent>
    </Popover>
  );
}
