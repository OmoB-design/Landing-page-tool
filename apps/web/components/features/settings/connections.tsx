"use client";

import { useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { type ReactNode, useId, useState } from "react";

import { toast } from "@/components/app/toaster";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { BackIcon, ExternalLinkIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { ShopifyLogo, VercelLogo } from "@/components/ui/lp-icons";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, apiFetch } from "@/lib/api/client";
import {
  useIntegrations,
  useSetIntegrations,
} from "@/lib/queries/integrations";
import {
  type IntegrationsState,
  integrationsStateSchema,
} from "@/lib/validators/publishing";

import { SettingsDivider, SettingsPage } from "./settings-page";

const VERCEL_DESCRIPTION =
  "Publish pages to your Vercel account: one project per brand, each page at its own address.";
const SHOPIFY_DESCRIPTION =
  "Publish pages to a brand’s Shopify store as draft pages, ready to check and switch on.";
const TOKENS_URL = "https://vercel.com/account/settings/tokens";

const EASE = [0.23, 1, 0.32, 1] as const;
// Quality's micro button (its Connect): 24 px tall, 8 px across, 12 px text, 6 px corners.
const MICRO = "self-start rounded-sm text-type-caption-1";

/**
 * Settings → Connections (D88; Quality's Connections): the services pages are published to, as
 * cards two to a row, the connected ones first. Connect opens a modal for the service's details
 * (Vercel: an access token); a connected card's View connection opens its page (when and by whom
 * it was connected, its brand projects, Replace token and Disconnect). Shopify arrives with B1.5b.
 */
export function Connections({
  initial,
  brands,
}: {
  initial: IntegrationsState;
  /** Brand names by id, for the Vercel projects list. */
  brands: Record<string, string>;
}) {
  const { data } = useIntegrations(initial);
  const [view, setView] = useState<"list" | "vercel">("list");
  const [direction, setDirection] = useState(1);
  const [connectOpen, setConnectOpen] = useState(false);
  const canManage = data.role !== "member";
  const vercel = data.vercel;
  const open = (next: "list" | "vercel") => {
    setDirection(next === "list" ? -1 : 1);
    setView(next);
  };

  const vercelCard = (
    <ConnectionCard
      logo={<VercelLogo className="w-6 text-heading-01" />}
      name="Vercel"
      description={VERCEL_DESCRIPTION}
      state={vercel ? "connected" : "connect"}
      action={vercel ? "View connection" : "Connect"}
      disabled={!vercel && !canManage}
      onAction={() => (vercel ? open("vercel") : setConnectOpen(true))}
    />
  );
  const shopifyCard = (
    <ConnectionCard
      logo={<ShopifyLogo className="h-6" />}
      name="Shopify"
      description={SHOPIFY_DESCRIPTION}
      state="soon"
      action="Connect"
    />
  );

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="popLayout" initial={false} custom={direction}>
        <motion.div
          key={view === "vercel" && vercel ? "vercel" : "list"}
          custom={direction}
          initial={{ opacity: 0, x: direction * 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction * -16 }}
          transition={{ duration: 0.2, ease: EASE }}
        >
          {view === "vercel" && vercel ? (
            <VercelDetail
              state={data}
              brands={brands}
              canManage={canManage}
              onBack={() => open("list")}
              onReplace={() => setConnectOpen(true)}
              onDisconnected={() => open("list")}
            />
          ) : (
            <SettingsPage
              title="Connections"
              description="Connect the services your pages are published to. Each is connected once for the whole workspace."
            >
              {vercel ? (
                <>
                  <section className="flex flex-col gap-3">
                    <h2 className="text-type-body-small font-medium text-heading-01">
                      Connected
                    </h2>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {vercelCard}
                    </div>
                  </section>
                  <SettingsDivider />
                </>
              ) : null}
              <section className="flex flex-col gap-4">
                {vercel ? (
                  <h2 className="text-type-body-small font-medium text-heading-01">
                    Connect other services
                  </h2>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  {vercel ? null : vercelCard}
                  {shopifyCard}
                </div>
              </section>
              {!canManage ? (
                <p className="text-type-caption-1 font-medium text-heading-05">
                  Only owners and admins can connect services.
                </p>
              ) : null}
            </SettingsPage>
          )}
        </motion.div>
      </AnimatePresence>
      <VercelConnectDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        replacing={Boolean(vercel)}
      />
    </MotionConfig>
  );
}

/** A service's logo on its tile (Quality: a 40 px tile, 6 px corners; 54 px and 8 px on its page). */
function LogoTile({
  children,
  large = false,
}: {
  children: ReactNode;
  large?: boolean;
}) {
  return (
    <div
      className={
        large
          ? "flex size-13.5 shrink-0 items-center justify-center rounded-md bg-foreground-01 dark:bg-foreground-02"
          : "flex size-10 shrink-0 items-center justify-center rounded-sm bg-foreground-01"
      }
    >
      {children}
    </div>
  );
}

/**
 * A service card (Quality's connection card): 16 px corners, a hairline, 12 px in; the logo tile,
 * the name with Connected or Soon, two lines of description, then a small outline button.
 */
function ConnectionCard({
  logo,
  name,
  description,
  state,
  action,
  disabled = false,
  onAction,
}: {
  logo: ReactNode;
  name: string;
  description: string;
  state: "connect" | "connected" | "soon";
  action: string;
  disabled?: boolean;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col justify-center gap-4 rounded-panel bg-surface-primary p-3 edge-hairline">
      <LogoTile>{logo}</LogoTile>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <p
            className={
              state === "soon"
                ? "text-type-body-small font-medium text-heading-05"
                : "text-type-body-small font-medium text-heading-01"
            }
          >
            {name}
          </p>
          {state === "connected" ? (
            <span className="rounded-sm bg-tint-green px-1.5 text-type-caption-2 font-medium text-text-success">
              Connected
            </span>
          ) : state === "soon" ? (
            <span className="rounded-sm bg-foreground-02 px-1.5 text-type-caption-2 font-medium text-heading-05">
              Soon
            </span>
          ) : null}
        </div>
        <p className="line-clamp-2 text-type-caption-1 text-heading-05">
          {description}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="xs"
        className={MICRO}
        disabled={state === "soon" || disabled}
        onClick={onAction}
      >
        {action}
      </Button>
    </div>
  );
}

/** One fact on a connection's page (Quality: a label over its value). */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <p className="text-type-caption-1 text-heading-05">{label}</p>
      <div className="truncate text-type-caption-1 font-medium text-heading-01">
        {children}
      </div>
    </div>
  );
}

function VercelDetail({
  state,
  brands,
  canManage,
  onBack,
  onReplace,
  onDisconnected,
}: {
  state: IntegrationsState;
  brands: Record<string, string>;
  canManage: boolean;
  onBack: () => void;
  onReplace: () => void;
  onDisconnected: () => void;
}) {
  const save = useSetIntegrations();
  const vercel = state.vercel!;
  const disconnect = useMutation({
    mutationFn: () =>
      apiFetch("/api/integrations/vercel", integrationsStateSchema, {
        method: "DELETE",
      }),
    onSuccess: (next) => {
      save(next);
      onDisconnected();
      toast.success("Vercel disconnected");
    },
    onError: (error) => toast.error(error.message),
  });
  const account = vercel.account || "your account";
  return (
    <div className="mx-auto box-content flex w-full max-w-settings flex-col gap-10 px-4 pt-10 pb-24 md:px-6">
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Back to connections"
          onClick={onBack}
          className="self-start"
        >
          <BackIcon className="size-3.5" />
        </Button>
        <div className="flex items-center gap-4">
          <LogoTile large>
            <VercelLogo className="w-8 text-heading-01" />
          </LogoTile>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h1 className="font-serif text-type-h4 font-medium text-heading-01">
              Vercel
            </h1>
            <p className="text-type-body-small text-heading-05">
              {VERCEL_DESCRIPTION}
            </p>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-6">
        <SettingsDivider />
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex min-w-0 flex-1 gap-2">
            <Fact label="Connected on">
              {format(new Date(vercel.connected_at), "d MMM yyyy")}
            </Fact>
            <Fact label="Account">
              {account}
              {vercel.team_id ? " (team)" : ""}
            </Fact>
            <Fact label="Connected by">{vercel.connected_by ?? "—"}</Fact>
          </div>
          {canManage ? (
            <div className="flex gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="compact"
                onClick={onReplace}
              >
                Replace token
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="compact"
                disabled={disconnect.isPending}
                onClick={() => disconnect.mutate()}
              >
                {disconnect.isPending ? (
                  <Spinner className="size-3.5" label="Disconnecting" />
                ) : null}
                Disconnect
              </Button>
            </div>
          ) : null}
        </div>
        <SettingsDivider />
        <section className="flex flex-col gap-4">
          <h2 className="text-type-body-small font-medium text-heading-01">
            Brand projects
          </h2>
          {vercel.projects.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {vercel.projects.map((project) => (
                <li
                  key={project.brand_id}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-xsm bg-foreground-02">
                      <VercelLogo className="w-2.5 text-heading-02" />
                    </span>
                    <p className="truncate text-type-caption-1 font-medium text-heading-01">
                      {project.name}
                      <span className="text-heading-05">
                        {brands[project.brand_id]
                          ? ` · ${brands[project.brand_id]}`
                          : ""}
                      </span>
                    </p>
                  </div>
                  <Button
                    asChild
                    variant="secondary"
                    size="xs"
                    className={MICRO}
                  >
                    <a
                      href={`https://vercel.com/${encodeURIComponent(vercel.account)}/${encodeURIComponent(project.name)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open <ExternalLinkIcon className="size-3" />
                    </a>
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-1 rounded-panel bg-foreground-01 px-5 py-10 text-center">
              <p className="text-type-caption-1 font-medium text-heading-02">
                No projects yet
              </p>
              <p className="text-type-caption-1 text-heading-05">
                Each brand gets its project the first time one of its pages is
                published.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * Connect Vercel (D88; Quality's form modal): the logo, a title and what it does, centred; the
 * access token (with where to make one) and, for team accounts, the team id; then the footer with
 * any error on the left, Cancel and Connect. The token is checked with Vercel before it's kept.
 */
export function VercelConnectDialog({
  open,
  onOpenChange,
  replacing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  replacing: boolean;
}) {
  const save = useSetIntegrations();
  const tokenId = useId();
  const teamId = useId();
  const [token, setToken] = useState("");
  const [team, setTeam] = useState("");
  const [error, setError] = useState<string | null>(null);
  const reset = () => {
    setToken("");
    setTeam("");
    setError(null);
  };
  const connect = useMutation({
    mutationFn: () =>
      apiFetch("/api/integrations/vercel", integrationsStateSchema, {
        method: "POST",
        body: JSON.stringify({
          token: token.trim(),
          team_id: team.trim() || undefined,
        }),
      }),
    onSuccess: (next) => {
      save(next);
      onOpenChange(false);
      reset();
      toast.success(replacing ? "Vercel token replaced" : "Vercel connected");
    },
    onError: (failure) =>
      setError(
        failure instanceof ApiError || failure instanceof Error
          ? failure.message
          : "Couldn’t connect Vercel.",
      ),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !connect.isPending) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <form
          className="flex flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            if (token.trim().length >= 10) connect.mutate();
            else setError("Paste the whole token.");
          }}
        >
          <div className="flex flex-col gap-6 px-6 pt-8 pb-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <LogoTile large>
                <VercelLogo className="w-8 text-heading-01" />
              </LogoTile>
              <div className="flex flex-col gap-1">
                <DialogTitle className="text-type-body-small font-medium text-heading-01">
                  {replacing ? "Replace the Vercel token" : "Connect Vercel"}
                </DialogTitle>
                <DialogDescription className="text-type-caption-1 text-heading-05">
                  Pages are published to this account, one project per brand.
                </DialogDescription>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={tokenId}
                className="text-type-caption-1 font-medium text-heading-02"
              >
                Access token
              </label>
              <Input
                id={tokenId}
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Paste your token"
                aria-invalid={error ? true : undefined}
                className="h-8 px-2.5 font-mono"
              />
              <p className="text-type-caption-2 text-heading-05">
                Make one in{" "}
                <a
                  href={TOKENS_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-text-link hover:underline"
                >
                  Vercel → Account Settings → Tokens
                </a>
                . It’s checked with Vercel, then kept encrypted.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={teamId}
                className="text-type-caption-1 font-medium text-heading-02"
              >
                Team{" "}
                <span className="font-normal text-heading-05">(optional)</span>
              </label>
              <Input
                id={teamId}
                spellCheck={false}
                value={team}
                onChange={(event) => setTeam(event.target.value)}
                placeholder="team_… or your-team-slug"
                className="h-8 px-2.5 font-mono"
              />
              <p className="text-type-caption-2 text-heading-05">
                Found from the token on its own. Fill it in only if the token
                reaches several teams (the team’s id or its slug).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-6 py-4 divider-t-half">
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
              variant="outline"
              size="compact"
              disabled={connect.isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="compact" disabled={connect.isPending}>
              {connect.isPending ? (
                <Spinner className="size-3.5" label="Checking" />
              ) : null}
              {connect.isPending
                ? "Checking…"
                : replacing
                  ? "Replace"
                  : "Connect"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
