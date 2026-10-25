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
  publish: (override: boolean) => Promise<boolean>;
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
  children,
}: {
  buildId: string;
  page: PublishedPage;
  initial: PublishingState;
  initialModalOpen?: boolean;
  onPublish?: (override: boolean) => void;
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
    mutationFn: (override: boolean) =>
      apiFetch(`/api/builds/${buildId}/publish`, publishingStateSchema, {
        method: "POST",
        body: JSON.stringify({
          base_version: publishing.page_version,
          destination: "vercel",
          override,
        }),
      }),
    onSuccess: () => void query.refetch(),
    onError: (error) => toast.error(error.message),
  });

  // A publish that was running has finished: catch up, then open the modal or say what failed.
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
    if (done?.status === "succeeded") setModalOpen(true);
    else if (done?.status === "failed")
      toast.error(done.error ?? "Publishing didn’t finish.");
  }, [publishing, desk]);

  const value: PublishContextValue = {
    buildId,
    page,
    publishing,
    job: job.data?.id === publishing.job_id ? job.data : undefined,
    publish: async (override) => {
      if (onPublish) {
        onPublish(override);
        return true;
      }
      try {
        await mutation.mutateAsync(override);
        return true;
      } catch {
        return false;
      }
    },
    starting: mutation.isPending,
    modalOpen,
    setModalOpen,
  };
  return <PublishContext value={value}>{children}</PublishContext>;
}
