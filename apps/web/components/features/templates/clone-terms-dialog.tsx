"use client";

import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertIcon } from "@/components/ui/icons";
import { ModalCard, ModalFrame } from "@/components/ui/modal-stack";
import { Spinner } from "@/components/ui/spinner";
import type { CloneTermsState } from "@/lib/validators/clone";

/**
 * PLACEHOLDER clone terms (BUILD_SPEC §3, D4, O2): the owner supplies the final wording after
 * legal review. Until then this stand-in says plainly what the clone path does and who answers
 * for what, and the dialog marks it as a placeholder.
 */
const TERMS = [
  "Clone only pages you have the right to use, or pages you study for their structure and then rebuild with your own words, images and brand.",
  "A clone is a starting point. Every page built from it is rewritten for your brand, scrubbed of the source brand and checked; publishing stops while traces of the source remain, unless an owner or admin overrides it, which is recorded.",
  "You are responsible for what you publish: copyright in text and images, trademarks and look-alike design, the source site’s terms of use, and the claims your pages make.",
  "Pages are read the way a visitor’s browser reads them. Bot protection is not bypassed unless your workspace has the proxied fetch switched on (it is off unless the platform turns it on for you).",
  "An owner or admin accepts these terms once for the whole workspace. Their name and the date are recorded.",
];

/**
 * The clone terms (B2.1), in the modal frame the Settings dialogs wear: the title and line on the
 * white card, the terms on a Dashboard band, then the footer on the frame. An owner or admin can
 * accept them for the workspace (and the clone they asked for starts); anyone else, or anyone
 * once they're accepted, can read them.
 */
export function CloneTermsDialog({
  open,
  onOpenChange,
  terms,
  workspace,
  accepting,
  error,
  onAccept,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  terms: CloneTermsState;
  workspace: string;
  accepting: boolean;
  error: string | null;
  onAccept: () => void;
}) {
  const accepted = terms.accepted_at !== null;
  const canAccept = !accepted && terms.can_accept;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!accepting) onOpenChange(next);
      }}
    >
      <DialogContent className="block bg-transparent p-0 ring-0 sm:max-w-md">
        <ModalFrame>
          <ModalCard className="rounded-lg">
            <div className="flex flex-col gap-1 px-6 pt-6 pb-4 text-center">
              <DialogTitle className="text-type-body-small font-medium text-heading-01">
                Clone terms
              </DialogTitle>
              <DialogDescription className="text-type-caption-1 text-heading-05">
                {accepted
                  ? `Accepted for ${workspace}${terms.accepted_by ? ` by ${terms.accepted_by}` : ""} on ${format(new Date(terms.accepted_at ?? ""), "d MMM yyyy")}.`
                  : `Accepted once for ${workspace}, before its first clone.`}
              </DialogDescription>
            </div>
            <div className="flex flex-col gap-3 bg-dashboard px-6 py-4 divider-y-half dark:bg-surface-primary">
              <p className="flex items-start gap-1.5 text-type-caption-1 font-medium text-text-warning">
                <AlertIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                Placeholder wording: the final terms follow legal review.
              </p>
              <ol className="flex list-decimal flex-col gap-2 pl-4 text-type-caption-1 text-heading-03">
                {TERMS.map((term) => (
                  <li key={term}>{term}</li>
                ))}
              </ol>
            </div>
            {!accepted && !terms.can_accept ? (
              <p className="px-6 py-4 text-type-caption-1 text-heading-05">
                Only an owner or admin can accept these for {workspace}. Ask one
                to open Clone a page and accept them.
              </p>
            ) : null}
          </ModalCard>
          <div className="flex items-center gap-2 px-6 py-4">
            {error ? (
              <p
                role="alert"
                className="min-w-0 flex-1 text-type-caption-1 font-medium text-text-danger"
              >
                {error}
              </p>
            ) : (
              <span className="flex-1" />
            )}
            <Button
              type="button"
              variant="ghost"
              size="compact"
              className="text-body"
              disabled={accepting}
              onClick={() => onOpenChange(false)}
            >
              {canAccept ? "Cancel" : "Close"}
            </Button>
            {canAccept ? (
              <Button
                type="button"
                size="compact"
                disabled={accepting}
                onClick={onAccept}
              >
                {accepting ? (
                  <Spinner className="size-3.5" label="Accepting" />
                ) : null}
                {accepting ? "Accepting…" : "Accept and clone"}
              </Button>
            ) : null}
          </div>
        </ModalFrame>
      </DialogContent>
    </Dialog>
  );
}
