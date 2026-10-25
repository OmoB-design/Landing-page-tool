"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { toast } from "@/components/app/toaster";
import { ApiError, apiFetch } from "@/lib/api/client";
import { pickDesk } from "@/lib/builds/desk";
import { isActive } from "@/lib/jobs/progress";
import { useJob } from "@/lib/queries/jobs";
import type { JobDetail } from "@/lib/validators/jobs";
import {
  type DeskAction,
  type DeskPalette,
  type DeskRedraft,
  type DeskState,
  type RedraftScope,
  deskStateSchema,
} from "@/lib/validators/desk";

export type DeskTab = "overview" | "copy" | "history";

/** A paragraph the panel wants the preview to outline (`nonce` repeats a request for the same one). */
export type DeskFocus = { block: number; nonce: number; scroll: boolean };

/** A paragraph by its number, or by one of its fragments (a click in the preview, a claim). */
export type DeskTarget = { block: number } | { fragment: string };

/** What to redraft (D86): the page, a section, a paragraph, or the lines left unwritten. */
export type RedraftInput = {
  scope: RedraftScope;
  section?: string;
  block?: number;
  note?: string;
};

type DeskContextValue = {
  buildId: string;
  /** The signed-in user, to tell their changes from a teammate's. */
  meId: string;
  desk: DeskState;
  tab: DeskTab;
  setTab: (tab: DeskTab) => void;
  /** The paragraph open for editing in the Copy tab. */
  editing: number | null;
  setEditing: (block: number | null) => void;
  /** The paragraph outlined in the preview. */
  focus: DeskFocus | null;
  /** Outlines a paragraph in the preview (and scrolls to it). */
  show: (target: DeskTarget | null) => void;
  /** Opens a paragraph in the Copy tab and outlines it (a click in the preview, a claim's Edit). */
  open: (target: DeskTarget, options?: { scroll?: boolean }) => void;
  /** The paragraph a target names, if the page has it. */
  blockOf: (target: DeskTarget) => number | null;
  saveEdit: (block: number, original: string, text: string) => Promise<boolean>;
  setStatus: (status: "approved" | "needs_review") => void;
  undo: () => void;
  restore: (seq: number) => void;
  /** Queues a redraft; the Copy tab shows it running and other changes wait until it's done. */
  redraft: (input: RedraftInput) => Promise<boolean>;
  /** Recolours the page to these colours (undoable). */
  recolor: (colors: DeskPalette) => Promise<boolean>;
  /** Fetches the desk again (publishing changes the status without a new page version). */
  reload: () => Promise<void>;
  /** The redraft queued or running on the page, with its job (progress) once loaded. */
  redrafting: { redraft: DeskRedraft; job: JobDetail | undefined } | null;
  pending: DeskAction | null;
};

const DeskContext = createContext<DeskContextValue | null>(null);

/** The review desk (D84) for a finished build. Outside a desk (the demo, the states page), null. */
export function useDeskOptional(): DeskContextValue | null {
  return useContext(DeskContext);
}

export function useDesk(): DeskContextValue {
  const desk = useContext(DeskContext);
  if (!desk) throw new Error("useDesk needs a DeskProvider.");
  return desk;
}

/**
 * Holds the review desk for one build: the server's desk (from the page) until this tab saves a
 * change, then the worker's answer, unless the server has a newer page. Each change goes to
 * /api/builds/[id]/desk/[action]; afterwards the page refreshes so the report (claims, facts)
 * follows. A change made on an outdated page is refused (409), with Reload to catch up.
 * A redraft is a job: its progress is polled, and when it ends the desk catches up and says so
 * (Undo, or Retry if it failed). `onChange` replaces the real calls (the states page).
 */
export function DeskProvider({
  buildId,
  meId,
  initial,
  onChange,
  initialTab = "overview",
  initialEditing,
  children,
}: {
  buildId: string;
  meId: string;
  initial: DeskState;
  onChange?: (action: DeskAction, body: Record<string, unknown>) => void;
  initialTab?: DeskTab;
  /** A paragraph open for editing at first (the states page). */
  initialEditing?: number;
  children: ReactNode;
}) {
  const router = useRouter();
  const [local, setLocal] = useState<DeskState | null>(null);
  const [tab, setTab] = useState<DeskTab>(initialTab);
  const [editing, setEditing] = useState<number | null>(initialEditing ?? null);
  const [focus, setFocus] = useState<DeskFocus | null>(null);
  const desk = pickDesk(local, initial);

  const mutation = useMutation({
    mutationFn: ({
      action,
      body,
    }: {
      action: DeskAction;
      body: Record<string, unknown>;
    }) =>
      apiFetch(`/api/builds/${buildId}/desk/${action}`, deskStateSchema, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (next) => {
      setLocal(next);
      router.refresh();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        toast.error(error.message, {
          action: {
            label: "Reload",
            onClick: () => {
              setLocal(null);
              setEditing(null);
              router.refresh();
            },
          },
        });
      } else {
        toast.error(error.message);
      }
    },
  });

  const run = useCallback(
    async (action: DeskAction, body: Record<string, unknown>) => {
      const payload = { base_version: desk.build.page_version, ...body };
      if (onChange) {
        onChange(action, payload);
        return true;
      }
      try {
        await mutation.mutateAsync({ action, body: payload });
        return true;
      } catch {
        return false;
      }
    },
    [desk.build.page_version, mutation, onChange],
  );
  // Toast actions run later, on the page as it is then.
  const latestRun = useRef(run);
  useEffect(() => {
    latestRun.current = run;
  }, [run]);

  const redraftInput = useRef<RedraftInput | null>(null);
  const redraft = useCallback(
    async (input: RedraftInput) => {
      redraftInput.current = input;
      const started = await run("redraft", input);
      if (started) setEditing(null);
      return started;
    },
    [run],
  );

  // A redraft's job: polled while it runs; when it ends, the desk catches up once.
  const job = useJob(onChange ? null : (desk.redraft?.job_id ?? null));
  const settled = useRef<string | null>(null);
  useEffect(() => {
    const finished = job.data;
    if (!finished || isActive(finished.status)) return;
    if (settled.current === finished.id) return;
    settled.current = finished.id;
    const result = finished.result ?? {};
    const retry = redraftInput.current;
    // Say so once the desk has caught up, so Undo and Retry act on the page as it is now.
    const announce = (version?: number) => {
      const on = version ? { base_version: version } : {};
      if (finished.status === "succeeded") {
        const failedChunks = Number(result.failed_chunks ?? 0);
        toast.success(String(result.reason ?? "Redrafted"), {
          description:
            failedChunks > 0
              ? "Some lines couldn’t be redrafted, so they kept their words."
              : undefined,
          action: {
            label: "Undo",
            onClick: () => void latestRun.current("undo", on),
          },
        });
      } else {
        toast.error(finished.error?.message ?? "The redraft didn’t finish.", {
          action: retry
            ? {
                label: "Retry",
                onClick: () =>
                  void latestRun.current("redraft", { ...retry, ...on }),
              }
            : undefined,
        });
      }
    };
    void apiFetch(`/api/builds/${buildId}/desk`, deskStateSchema)
      .then((next) => {
        setLocal(next);
        router.refresh();
        announce(next.build.page_version);
      })
      .catch(() => {
        router.refresh();
        announce();
      });
  }, [job.data, buildId, router]);

  const blockOf = useCallback(
    (target: DeskTarget) => {
      if ("block" in target)
        return desk.paragraphs.some((p) => p.number === target.block)
          ? target.block
          : null;
      return (
        desk.fragments.find((fragment) => fragment.id === target.fragment)
          ?.block ?? null
      );
    },
    [desk],
  );

  const show = useCallback(
    (target: DeskTarget | null) => {
      const block = target ? blockOf(target) : null;
      setFocus((previous) =>
        block
          ? { block, nonce: (previous?.nonce ?? 0) + 1, scroll: true }
          : null,
      );
    },
    [blockOf],
  );

  const value = useMemo<DeskContextValue>(
    () => ({
      buildId,
      meId,
      desk,
      tab,
      setTab,
      editing,
      setEditing,
      focus,
      show,
      blockOf,
      open: (target, options) => {
        const block = blockOf(target);
        if (!block) return;
        const paragraph = desk.paragraphs.find((p) => p.number === block);
        setTab("copy");
        setEditing(paragraph?.locked ? null : block);
        setFocus((previous) => ({
          block,
          nonce: (previous?.nonce ?? 0) + 1,
          scroll: options?.scroll ?? true,
        }));
      },
      saveEdit: async (block, original, text) => {
        const saved = await run("copy", {
          edits: [{ block, original, text }],
        });
        if (saved) setEditing(null);
        return saved;
      },
      setStatus: (status) => void run("status", { status }),
      undo: () => void run("undo", {}),
      restore: (seq) => void run("restore", { seq }),
      redraft,
      reload: async () => {
        if (onChange) return;
        const next = await apiFetch(
          `/api/builds/${buildId}/desk`,
          deskStateSchema,
        ).catch(() => null);
        if (next) setLocal(next);
        router.refresh();
      },
      recolor: async (colors) => {
        const done = await run("recolor", { colors });
        if (done && !onChange) {
          toast.success("Recoloured the page", {
            action: {
              label: "Undo",
              onClick: () => void latestRun.current("undo", {}),
            },
          });
        }
        return done;
      },
      redrafting: desk.redraft
        ? {
            redraft: desk.redraft,
            job: job.data?.id === desk.redraft.job_id ? job.data : undefined,
          }
        : null,
      pending: mutation.isPending ? (mutation.variables?.action ?? null) : null,
    }),
    [
      buildId,
      meId,
      desk,
      tab,
      editing,
      focus,
      show,
      blockOf,
      run,
      redraft,
      onChange,
      router,
      job.data,
      mutation.isPending,
      mutation.variables,
    ],
  );

  return <DeskContext value={value}>{children}</DeskContext>;
}
