"use client";

import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteItemForGood, restoreItem } from "@/lib/trash/actions";
import { useHydrated } from "@/lib/use-hydrated";
import type { TrashItem, TrashKind, TrashState } from "@/lib/validators/trash";

import { SettingsPage } from "./settings-page";

const KIND_LABEL: Record<TrashKind, string> = {
  page: "Page",
  brand: "Brand",
  product: "Product",
  template: "Template",
};

const GONE_FOR_GOOD: Record<TrashKind, string> = {
  page: "This permanently removes the page, its versions and its files.",
  brand: "This permanently removes the brand with its pages and products.",
  product:
    "This permanently removes the product. Pages made with it keep working.",
  template:
    "This permanently removes the template. Pages built from it keep working.",
};

function day(date: string) {
  return format(new Date(date), "d MMM yyyy");
}

/**
 * Settings → Trash (D92; Quality's Trash, read from its app): the serif title and its line, then
 * a table of what was deleted (name, type, who removed it, when) with Restore and Permanently
 * delete (owners and admins; it asks first). Empty, loading and failed states as Quality's.
 * `sample` (the states page) makes the buttons say so instead of acting.
 */
export function TrashSettings({
  initial,
  loading = false,
  sample = false,
}: {
  /** null: the Trash couldn't be loaded. */
  initial?: TrashState | null;
  loading?: boolean;
  sample?: boolean;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [state, setState] = useState(initial ?? null);
  const [confirming, setConfirming] = useState<TrashItem | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const items = state?.items ?? [];
  const failed = !loading && state === null;

  const act = (
    item: TrashItem,
    run: typeof restoreItem,
    done: string,
    after?: () => void,
  ) => {
    if (sample) {
      toast("Sample only: nothing changed.");
      after?.();
      return;
    }
    setActing(item.id);
    startTransition(async () => {
      const result = await run(item.kind, item.id);
      setActing(null);
      if (result.ok && result.state) {
        setState(result.state);
        toast.success(`${item.name} ${done}`);
        after?.();
        router.refresh();
      } else toast.error(result.error ?? "That didn’t work. Try again.");
    });
  };

  let body: ReactNode;
  if (loading) body = <MessageRow>Loading Trash…</MessageRow>;
  else if (failed)
    body = (
      <MessageRow>We couldn’t load Trash. Refresh and try again.</MessageRow>
    );
  else
    body = items.map((item) => (
      <TableRow key={`${item.kind}-${item.id}`}>
        <TableCell>
          <span className="block truncate">
            <span className="font-medium">{item.name}</span>
            {item.detail ? (
              <span className="text-heading-05"> · {item.detail}</span>
            ) : null}
          </span>
        </TableCell>
        <TableCell className="text-heading-05">
          {KIND_LABEL[item.kind]}
        </TableCell>
        <TableCell className="truncate text-heading-05">
          {item.deleted_by ?? "A workspace member"}
        </TableCell>
        <TableCell
          className="whitespace-nowrap text-heading-05"
          title={
            hydrated
              ? `Permanently deleted on ${day(item.expires_at)}`
              : undefined
          }
        >
          {hydrated ? day(item.deleted_at) : null}
        </TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => act(item, restoreItem, "restored")}
            >
              {pending && acting === item.id && !confirming ? (
                <Spinner className="size-3.5" label="Restoring" />
              ) : null}
              Restore
            </Button>
            {state?.can_permanently_delete ? (
              <Button
                variant="destructive-secondary"
                size="sm"
                disabled={pending}
                onClick={() => setConfirming(item)}
              >
                Permanently delete
              </Button>
            ) : null}
          </div>
        </TableCell>
      </TableRow>
    ));

  return (
    <SettingsPage
      wide
      title="Trash"
      description="Deleted pages, brands, products and templates stay here for 7 days before they are permanently deleted."
    >
      {!loading && !failed && items.length === 0 ? (
        <div className="flex items-center justify-center px-8 py-16">
          <p className="text-center text-type-body-small font-medium text-heading-05">
            Trash is empty
          </p>
        </div>
      ) : (
        <Table className="min-w-184">
          <caption className="sr-only">Deleted items</caption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col" className="w-7/20">
                Name
              </TableHead>
              <TableHead scope="col" className="w-1/10">
                Type
              </TableHead>
              <TableHead scope="col" className="w-3/20">
                Removed by
              </TableHead>
              <TableHead scope="col" className="w-3/20">
                Removed
              </TableHead>
              <TableHead scope="col" className="w-1/4 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{body}</TableBody>
        </Table>
      )}
      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setConfirming(null);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Permanently delete {confirming?.name}?</DialogTitle>
            <DialogDescription>
              {confirming ? GONE_FOR_GOOD[confirming.kind] : null} This cannot
              be undone.
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
              onClick={() =>
                confirming &&
                act(confirming, deleteItemForGood, "permanently deleted", () =>
                  setConfirming(null),
                )
              }
            >
              {pending ? (
                <Spinner className="size-3.5" label="Deleting" />
              ) : null}
              Permanently delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsPage>
  );
}

function MessageRow({ children }: { children: ReactNode }) {
  return (
    <TableRow>
      <TableCell colSpan={5} className="py-24 text-center text-heading-05">
        {children}
      </TableCell>
    </TableRow>
  );
}
