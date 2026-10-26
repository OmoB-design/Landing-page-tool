"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { toast } from "@/components/app/toaster";
import { apiFetch } from "@/lib/api/client";
import { POLL_ACTIVE_MS } from "@/lib/jobs/progress";
import { useJob } from "@/lib/queries/jobs";
import type { JobDetail } from "@/lib/validators/jobs";
import {
  type PublishingState,
  publishingStateSchema,
} from "@/lib/validators/publishing";

import { useDeskOptional } from "./desk-context";

/** What the published modal shows beside the page. */
export type PublishedPage = {
  key: string;
  /** The page's brand (its Shopify store is the brand's, D90). */
  brandId: string | null;
  title: string;
  brand: string | null;
  product: string | null;
  template: string | null;
};

type PublishContextValue = {
  buildId: string;
  page: PublishedPage;
  publishing: PublishingState;
  /** The running publish's job (its steps), once loaded. */
  job: JobDetail | undefined;
  publish: (
    override: boolean,
    destination?: "vercel" | "shopify_page",
  ) => Promise<boolean>;
  /** Fetches the publishing state again (after connecting a store). */
  refresh: () => void;
  /** Takes the page down from Vercel (D89). */
  unpublish: () => Promise<boolean>;
  starting: boolean;
  /** The published modal (opens by itself when a publish finishes). */
  modalOpen: boolean;
  setModalOpen: (open: boolean) => void;
};

const PublishContext = createContext<PublishContextValue | null>(null);

export function usePublishOptional(): PublishContextValue | null {
  return useContext(PublishContext);
}

export function usePublish(): PublishContextValue {
  const value = useContext(PublishContext);
  if (!value) throw new Error("usePublish needs a PublishProvider.");
  return value;
}

/**
 * Publishing for one build (D87): the gate, the live page, a publish in progress and the history,
 * from /api/builds/[id]/publishing (polled while a publish runs). When a publish finishes the desk
 * catches up (the status becomes Published) and the published modal opens; a failure says why.
 * `onPublish` replaces the real call (the states page).
 */
export function PublishProvider({
  buildId,
  page,
  initial,
  initialModalOpen = false,
  onPublish,
  onUnpublish,
  children,
}: {
  buildId: string;
  page: PublishedPage;
  initial: PublishingState;
  initialModalOpen?: boolean;
  onPublish?: (override: boolean, destination: string) => void;
  onUnpublish?: () => void;
  children: ReactNode;
}) {
  const desk = useDeskOptional();
  const [modalOpen, setModalOpen] = useState(initialModalOpen);
  // Samples (the states page) keep their own state rather than sharing one cache entry.
  const sampleKey = useId();
  const query = useQuery({
    queryKey: onPublish
      ? ["publishing-sample", sampleKey]
      : ["publishing", buildId],
    queryFn: () =>
      apiFetch(`/api/builds/${buildId}/publishing`, publishingStateSchema),
    initialData: initial,
    // The server's copy is fresh: refetched only while a publish runs and after one starts.
    // "static" also keeps React Query from reading the clock while the page prerenders.
    initialDataUpdatedAt: 0,
    staleTime: "static",
    enabled: !onPublish,
    refetchInterval: (q) => (q.state.data?.running ? POLL_ACTIVE_MS : false),
  });
  const publishing = query.data ?? initial;
  const job = useJob(onPublish ? null : publishing.job_id);

  const mutation = useMutation({
    mutationFn: ({
      override,
      destination,
    }: {
      override: boolean;
      destination: "vercel" | "shopify_page";
    }) =>
      apiFetch(`/api/builds/${buildId}/publish`, publishingStateSchema, {
        method: "POST",
        body: JSON.stringify({
          base_version: publishing.page_version,
          destination,
          override,
        }),
      }),
    onSuccess: () => void query.refetch(),
    onError: (error) => toast.error(error.message),
  });
  const takeDown = useMutation({
    mutationFn: () =>
      apiFetch(`/api/builds/${buildId}/unpublish`, publishingStateSchema, {
        method: "POST",
      }),
    onSuccess: () => void query.refetch(),
    onError: (error) => toast.error(error.message),
  });

  // A publish (or unpublish) that was running has finished: catch up, then open the modal (or
  // close it, once the page is down) or say what failed.
  const watching = useRef<string | null>(initial.running?.id ?? null);
  useEffect(() => {
    if (publishing.running) {
      watching.current = publishing.running.id;
      return;
    }
    const id = watching.current;
    if (!id) return;
    watching.current = null;
    const done = publishing.publications.find((p) => p.id === id);
    void desk?.reload();
    if (done?.status === "succeeded" && done.destination === "shopify_page") {
      setModalOpen(true);
      toast.success("Draft saved in Shopify", {
        action: done.admin_url
          ? {
              label: "Open in admin",
              onClick: () => window.open(done.admin_url ?? "", "_blank"),
            }
          : undefined,
      });
    } else if (done?.status === "succeeded") setModalOpen(true);
    else if (done?.status === "unpublished") {
      setModalOpen(false);
      toast.success(`${page.key} is unpublished`, {
        description: "The brand’s other pages are still live.",
      });
    } else if (done?.status === "failed")
      toast.error(
        done.error ??
          (done.action === "unpublish"
            ? "Unpublishing didn’t finish."
            : "Publishing didn’t finish."),
      );
  }, [publishing, desk, page.key]);

  const value: PublishContextValue = {
    buildId,
    page,
    publishing,
    job: job.data?.id === publishing.job_id ? job.data : undefined,
    publish: async (override, destination = "vercel") => {
      if (onPublish) {
        onPublish(override, destination);
        return true;
      }
      try {
        await mutation.mutateAsync({ override, destination });
        return true;
      } catch {
        return false;
      }
    },
    refresh: () => void query.refetch(),
    unpublish: async () => {
      if (onUnpublish) {
        onUnpublish();
        return true;
      }
      try {
        await takeDown.mutateAsync();
        return true;
      } catch {
        return false;
      }
    },
    starting: mutation.isPending || takeDown.isPending,
    modalOpen,
    setModalOpen,
  };
  return <PublishContext value={value}>{children}</PublishContext>;
}
