"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { toast } from "@/components/app/toaster";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { restoreItem, trashItem } from "@/lib/trash/actions";
import type { TrashKind } from "@/lib/validators/trash";

const WHAT_HAPPENS: Record<TrashKind, string> = {
  page: "It leaves your pages.",
  brand: "Its pages and products go with it, and come back with it.",
  product: "It leaves the brand’s products; pages made with it keep working.",
  template: "Pages already built from it keep working.",
};

/**
 * "Move … to Trash?" (Quality's wording, D92): what moving it does, and that it can be restored
 * from Settings → Trash for 7 days. Moved, a toast says so with Undo. A page that's building or
 * published is refused, with the reason (unpublish it first).
 */
export function MoveToTrashDialog({
  open,
  onOpenChange,
  kind,
  id,
  name,
  onMoved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: TrashKind;
  id: string;
  /** How the item is called in the title and the toast (a page's key, a brand's name…). */
  name: string;
  /** After it moved (e.g. leave its page); by default the current page refreshes. */
  onMoved?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // A plain call, not a transition: the toast outlives this dialog (its row may be gone).
  const undo = async () => {
    const result = await restoreItem(kind, id);
    if (result.ok) {
      toast.success(`${name} restored`);
      router.refresh();
    } else toast.error(result.error ?? "Couldn’t restore it.");
  };

  const move = () =>
    startTransition(async () => {
      const result = await trashItem(kind, id);
      if (!result.ok) {
        toast.error(result.error ?? "Couldn’t move it to Trash.");
        return;
      }
      onOpenChange(false);
      toast.success(`${name} moved to Trash`, {
        action: { label: "Undo", onClick: () => void undo() },
      });
      if (onMoved) onMoved();
      else router.refresh();
    });

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Move {name} to Trash?</DialogTitle>
          <DialogDescription>
            {WHAT_HAPPENS[kind]} You can restore it from Settings → Trash for 7
            days.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            size="sm"
            disabled={pending}
            onClick={move}
          >
            {pending ? (
              <Spinner className="size-3.5" label="Moving to Trash" />
            ) : null}
            Move to Trash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
