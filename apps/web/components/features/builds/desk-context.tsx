"use client";

import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
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
import { type AgentStart, agentStartSchema } from "@/lib/validators/agent";
import type { ImageAction, ImageActionBody } from "@/lib/validators/images";
import {
  type DeskAction,
  type DeskPalette,
  type DeskRedraft,
  type DeskState,
  type FormatRange,
  type FormattedLine,
  type RedraftScope,
  type SectionAction,
  type TextFormat,
  deskStateSchema,
} from "@/lib/validators/desk";

export type DeskTab = "overview" | "copy" | "history";

/** A paragraph the panel wants the preview to outline (`nonce` repeats a request for the same one). */
export type DeskFocus = { block: number; nonce: number; scroll: boolean };

/** A paragraph by its number, or by one of its fragments (a click in the preview, a claim). */
export type DeskTarget = { block: number } | { fragment: string };

/** A redraft that has finished, as the page editor's Lander keeps it (B3.1b): how it ended, its
 * result, and the page's lines afterwards (to show what changed). */
export type SettledRedraft = {
  job: JobDetail;
  /** The page's lines once the desk caught up (null if it couldn't be fetched). */
  paragraphs: { number: number; text: string; section: string | null }[] | null;
  pageVersion: number | null;
};

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
  /** Puts back the change Undo took off last (the page editor, B3.1a). */
  redo: () => void;
  /** Moves, copies or removes a section (the page editor, B3.1a). */
  editSections: (action: SectionAction) => Promise<boolean>;
  /** Saves a line typed on the page (the page editor, D104) without refreshing the route: saves
   * of one line share an undo step. Resolves to the new desk, or null when it was refused. */
  saveTyping: (
    block: number,
    original: string,
    text: string,
  ) => Promise<DeskState | null>;
  restore: (seq: number) => void;
  /** The page version the editor's canvas should show: changes but this tab's typing (which the
   * canvas already shows, so loading it again would lose your place). */
  frameVersion: number;
  /** Queues a redraft; the Copy tab shows it running and other changes wait until it's done. */
  redraft: (input: RedraftInput) => Promise<boolean>;
  /** Queues a redraft and resolves to its job's id (null when refused): the page editor's Lander
   * follows that job in its thread (B3.1b). */
  startRedraft: (input: RedraftInput) => Promise<string | null>;
  /** Redrafts that finished while this desk was open, by job id (B3.1b). */
  settledRedrafts: Record<string, SettledRedraft>;
  /** Sends a request to Lander (B3.1c): it runs as the page's job, so the desk follows it like a
   * redraft. Resolves to the conversation and the job (null when refused, with a toast). */
  startAgent: (request: {
    text: string;
    target_key: string | null;
    thread_id: string | null;
    images?: string[];
  }) => Promise<AgentStart | null>;
  /** Stop on Lander's running request: it keeps what it did by its next step. */
  stopAgent: () => Promise<void>;
  /** Recolours the page to these colours (undoable). */
  recolor: (colors: DeskPalette) => Promise<boolean>;
  /** Formats the selected text (B3.1g, D118): one undoable change, saved like typing (the canvas
   * already shows it, so the page isn't loaded again). Resolves to the lines as saved, to swap in,
   * or null when it was refused. */
  format: (
    ranges: FormatRange[],
    format: TextFormat,
  ) => Promise<FormattedLine[] | null>;
  /** Restore page to here: the page as it was when a request to Lander was sent (undoable). */
  restoreTo: (messageId: string) => Promise<boolean>;
  /** Replaces, crops or restores image `number` (the image studio, B3.2a; undoable). */
  changeImage: <A extends ImageAction>(
    number: number,
    action: A,
    body: ImageActionBody<A>,
  ) => Promise<boolean>;
  /** Fetches the desk again (publishing changes the status without a new page version). */
  reload: () => Promise<void>;
  /** The redraft queued or running on the page, with its job (progress) once loaded. */
  redrafting: { redraft: DeskRedraft; job: JobDetail | undefined } | null;
  /** The change saving now ("image" for the image studio's). */
  pending: DeskAction | "image" | null;
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
  quietRedrafts = false,
  children,
}: {
  buildId: string;
  meId: string;
  initial: DeskState;
  onChange?: (action: DeskAction, body: Record<string, unknown>) => void;
  initialTab?: DeskTab;
  /** A paragraph open for editing at first (the states page). */
  initialEditing?: number;
  /** The page editor (B3.1b): a finished redraft is told in Lander's thread, not a toast. */
  quietRedrafts?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [local, setLocal] = useState<DeskState | null>(null);
  const [tab, setTab] = useState<DeskTab>(initialTab);
  const [editing, setEditing] = useState<number | null>(initialEditing ?? null);
  const [focus, setFocus] = useState<DeskFocus | null>(null);
  const desk = pickDesk(local, initial);
  const [shownVersion, setShownVersion] = useState(initial.build.page_version);
  // A desk from anywhere but typing moves the canvas on; typing saves leave it where it is.
  const showDesk = useCallback((next: DeskState) => {
    setLocal(next);
    setShownVersion(next.build.page_version);
  }, []);
  const frameVersion =
    local === null
      ? initial.build.page_version
      : Math.max(shownVersion, desk === local ? 0 : desk.build.page_version);

  const mutation = useMutation({
    mutationFn: ({
      action,
      body,
      path,
    }: {
      action: DeskAction | "image";
      body: Record<string, unknown>;
      /** Where the change goes, when it isn't the desk's own route (the image studio's). */
      path?: string;
    }) =>
      apiFetch(
        path ?? `/api/builds/${buildId}/desk/${action}`,
        deskStateSchema,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      ),
    onSuccess: (next) => {
      showDesk(next);
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

  // Typing saves follow each other faster than renders: each change uses the version the last
  // typing save returned, when that's newer than the desk this render has.
  const typedVersion = useRef(desk.build.page_version);
  // The last change saved in place (typing, formatting) still on its way: every other change
  // waits for it, so Undo straight after a format undoes that format.
  const settling = useRef<Promise<unknown> | null>(null);
  const run = useCallback(
    async (
      action: DeskAction | "image",
      body: Record<string, unknown>,
      path?: string,
    ) => {
      if (settling.current) await settling.current;
      const payload = {
        base_version: Math.max(typedVersion.current, desk.build.page_version),
        ...body,
      };
      if (onChange) {
        if (action !== "image") onChange(action, payload);
        return true;
      }
      try {
        await mutation.mutateAsync({ action, body: payload, path });
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

  // Changes the canvas already shows (typing, formatting): saved without refreshing the route or
  // loading the page again; each carries the version the last one returned.
  const save = useCallback(
    async (
      action: "copy" | "format",
      payload: Record<string, unknown>,
      failure: string,
    ): Promise<DeskState | null> => {
      try {
        const next = await apiFetch(
          `/api/builds/${buildId}/desk/${action}`,
          deskStateSchema,
          { method: "POST", body: JSON.stringify(payload) },
        );
        typedVersion.current = next.build.page_version;
        setLocal(next);
        return next;
      } catch (error) {
        const message = error instanceof Error ? error.message : failure;
        if (error instanceof ApiError && error.status === 409) {
          toast.error(message, {
            action: {
              label: "Reload",
              onClick: () => {
                setLocal(null);
                router.refresh();
              },
            },
          });
        } else {
          toast.error(message);
        }
        return null;
      }
    },
    [buildId, router],
  );
  const saveInPlace = useCallback(
    (
      action: "copy" | "format",
      body: Record<string, unknown>,
      failure: string,
    ): Promise<DeskState | null> => {
      const payload = {
        base_version: Math.max(typedVersion.current, desk.build.page_version),
        ...body,
      };
      if (onChange) {
        onChange(action, payload);
        return Promise.resolve(null);
      }
      const saving = save(action, payload, failure);
      settling.current = saving;
      void saving.finally(() => {
        if (settling.current === saving) settling.current = null;
      });
      return saving;
    },
    [desk.build.page_version, onChange, save],
  );
  const saveTyping = useCallback(
    (block: number, original: string, text: string) =>
      saveInPlace(
        "copy",
        { edits: [{ block, original, text }], typing: true },
        "Couldn’t save the line.",
      ),
    [saveInPlace],
  );
  const format = useCallback(
    async (ranges: FormatRange[], change: TextFormat) => {
      const next = await saveInPlace(
        "format",
        { ranges, format: change },
        "Couldn’t format the text.",
      );
      return next ? (next.lines ?? []) : null;
    },
    [saveInPlace],
  );

  const redraftInput = useRef<RedraftInput | null>(null);
  const [settledRedrafts, setSettledRedrafts] = useState<
    Record<string, SettledRedraft>
  >({});
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
  // Lander's request is followed closely, so its steps arrive one at a time.
  const job = useJob(
    onChange ? null : (desk.redraft?.job_id ?? null),
    desk.redraft?.scope === "agent",
  );
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
    const remember = (next: DeskState | null) =>
      setSettledRedrafts((all) => ({
        ...all,
        [finished.id]: {
          job: finished,
          paragraphs:
            next?.paragraphs.map(({ number, text, section }) => ({
              number,
              text,
              section,
            })) ?? null,
          pageVersion: next?.build.page_version ?? null,
        },
      }));
    void apiFetch(`/api/builds/${buildId}/desk`, deskStateSchema)
      .then((next) => {
        showDesk(next);
        remember(next);
        router.refresh();
        if (!quietRedrafts) announce(next.build.page_version);
      })
      .catch(() => {
        remember(null);
        router.refresh();
        if (!quietRedrafts) announce();
      });
  }, [job.data, buildId, router, showDesk, quietRedrafts]);

  const startRedraft = useCallback(
    async (input: RedraftInput) => {
      redraftInput.current = input;
      const body = {
        base_version: Math.max(typedVersion.current, desk.build.page_version),
        ...input,
      };
      if (onChange) {
        onChange("redraft", body);
        return null;
      }
      try {
        const next = await mutation.mutateAsync({ action: "redraft", body });
        return next.redraft?.job_id ?? null;
      } catch {
        return null;
      }
    },
    [desk.build.page_version, mutation, onChange],
  );

  const startAgent = useCallback(
    async (request: {
      text: string;
      target_key: string | null;
      thread_id: string | null;
      images?: string[];
    }) => {
      try {
        const started = await apiFetch(
          `/api/builds/${buildId}/agent`,
          agentStartSchema,
          {
            method: "POST",
            body: JSON.stringify({
              base_version: Math.max(
                typedVersion.current,
                desk.build.page_version,
              ),
              ...request,
            }),
          },
        );
        showDesk(started.desk);
        return started;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Buddy couldn’t start that.";
        if (error instanceof ApiError && error.status === 409) {
          toast.error(message, {
            action: {
              label: "Reload",
              onClick: () => {
                setLocal(null);
                router.refresh();
              },
            },
          });
        } else {
          toast.error(message);
        }
        return null;
      }
    },
    [buildId, desk.build.page_version, router, showDesk],
  );
  const stopAgent = useCallback(async () => {
    try {
      await apiFetch(
        `/api/builds/${buildId}/agent/stop`,
        z.object({ stopping: z.boolean() }),
        { method: "POST" },
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn’t stop Buddy.",
      );
    }
  }, [buildId]);

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
        setTab("copy");
        setEditing(block);
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
      redo: () => void run("redo", {}),
      editSections: (action) => run("sections", { action }),
      format,
      saveTyping,
      frameVersion,
      restore: (seq) => void run("restore", { seq }),
      redraft,
      startRedraft,
      settledRedrafts,
      startAgent,
      stopAgent,
      reload: async () => {
        if (onChange) return;
        const next = await apiFetch(
          `/api/builds/${buildId}/desk`,
          deskStateSchema,
        ).catch(() => null);
        if (next) showDesk(next);
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
      restoreTo: async (messageId) => {
        const done = await run(
          "restore",
          { message_id: messageId },
          `/api/builds/${buildId}/agent/restore`,
        );
        if (done && !onChange)
          toast.success("Restored the page to how it was then", {
            action: {
              label: "Undo",
              onClick: () => void latestRun.current("undo", {}),
            },
          });
        return done;
      },
      changeImage: (number, action, body) =>
        run("image", body, `/api/builds/${buildId}/images/${number}/${action}`),
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
      startRedraft,
      settledRedrafts,
      startAgent,
      stopAgent,
      saveTyping,
      format,
      frameVersion,
      showDesk,
      onChange,
      router,
      job.data,
      mutation.isPending,
      mutation.variables,
    ],
  );

  return <DeskContext value={value}>{children}</DeskContext>;
}
