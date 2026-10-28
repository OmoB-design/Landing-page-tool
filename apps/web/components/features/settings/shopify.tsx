"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { type ReactNode, useId, useState } from "react";

import { toast } from "@/components/app/toaster";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { BackIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { ShopifyLogo } from "@/components/ui/lp-icons";
import {
  ModalCard,
  ModalFrame,
  ModalStackDescription,
  ModalStackTitle,
} from "@/components/ui/modal-stack";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch } from "@/lib/api/client";
import { useSetIntegrations } from "@/lib/queries/integrations";
import { cn } from "@/lib/utils";
import {
  type IntegrationsState,
  integrationsStateSchema,
  shopifyTemplateSchema,
} from "@/lib/validators/publishing";

import { SettingsDivider } from "./settings-page";

export const SHOPIFY_DESCRIPTION =
  "Send pages to a brand’s Shopify store as draft pages, ready to check and switch on.";
const DEV_DASHBOARD_URL = "https://dev.shopify.com/dashboard";

/** A field of the connect modal: its label, the input, and a hint under it. */
function Field({
  id,
  label,
  hint,
  children,
}: {
  id?: string;
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-type-caption-1 font-medium text-heading-02"
      >
        {label}
      </label>
      {children}
      {hint ? (
        <p className="text-type-caption-2 text-heading-05">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Connect a Shopify store (D90; the Vercel modal's layout): the brand it's for (fixed when opened
 * from a page), the store's myshopify address, and the client id and secret of the store owner's
 * app in Shopify's Dev Dashboard. How to make the app comes first, under the header (the order of
 * the work, as in Emil's stacked modal), then the fields. The owner's frame 683:15139: the header,
 * the steps on a washed band between hairlines, and the fields, all in the white card; the footer
 * on the grey frame (the stack's rim around it). The worker asks Shopify for access straight away and names
 * any scope the app lacks. Its own dialog in Settings; a card stacked on the published modal
 * (`stacked`: ← Back, and no toast, since the modal's Shopify row changing says it).
 */
export function ShopifyConnectForm({
  brands,
  brandId,
  onConnected,
  onCancel,
  stacked = false,
}: {
  /** The brands to choose from (id, name). */
  brands: { id: string; name: string }[];
  /** The brand, when it's already decided (the published modal). */
  brandId?: string;
  onConnected?: (next: IntegrationsState) => void;
  onCancel: () => void;
  stacked?: boolean;
}) {
  const save = useSetIntegrations();
  const ids = {
    shop: useId(),
    client: useId(),
    secret: useId(),
    brand: useId(),
    steps: useId(),
  };
  const [brand, setBrand] = useState(brandId ?? "");
  const [shop, setShop] = useState("");
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const chosen = brandId ?? brand;
  const connect = useMutation({
    mutationFn: () =>
      apiFetch("/api/integrations/shopify", integrationsStateSchema, {
        method: "POST",
        body: JSON.stringify({
          brand_id: chosen,
          shop_domain: shop.trim(),
          client_id: clientId.trim(),
          client_secret: secret.trim(),
        }),
      }),
    onSuccess: (next) => {
      save(next);
      onConnected?.(next);
      if (!stacked) toast.success("Shopify store connected");
    },
    onError: (failure) =>
      setError(
        failure instanceof Error
          ? failure.message
          : "Couldn’t connect the store.",
      ),
  });
  const brandName = brands.find((b) => b.id === chosen)?.name;
  return (
    <form
      className="flex flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        if (!chosen) setError("Choose the brand this store belongs to.");
        else if (!shop.trim()) setError("Enter the store’s address.");
        else if (clientId.trim().length < 10 || secret.trim().length < 10)
          setError("Paste the app’s whole client id and secret.");
        else connect.mutate();
      }}
    >
      <ModalCard className="rounded-lg pt-2 pb-2.5">
        <ShopifyCardHeader
          onBack={stacked ? onCancel : undefined}
          title={
            brandId && brandName
              ? `Connect ${brandName}’s Shopify store`
              : "Connect a Shopify store"
          }
        >
          Pages go to the store as drafts. One store per brand.
        </ShopifyCardHeader>
        <section
          aria-labelledby={ids.steps}
          className="flex flex-col gap-2 bg-dashboard px-6 py-4 text-type-caption-1 divider-y-half dark:bg-surface-primary"
        >
          <h3 id={ids.steps} className="font-medium text-heading-02">
            First, make the app in Shopify
          </h3>
          <ol className="flex list-decimal flex-col gap-1 pl-4 text-heading-05">
            <li>
              In{" "}
              <a
                href={DEV_DASHBOARD_URL}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-text-link hover:underline"
              >
                Shopify’s Dev Dashboard
              </a>
              , create an app (Start from Dev Dashboard).
            </li>
            <li>
              In Versions, add the scopes write_content, write_files and
              write_themes, then Release.
            </li>
            <li>In Installs, install it on the store.</li>
            <li>
              From the app’s Settings, copy the Client ID and secret below.
            </li>
          </ol>
        </section>
        <div className="flex flex-col gap-6 p-6">
          {brandId ? null : (
            <Field id={ids.brand} label="Brand">
              <Select value={brand} onValueChange={setBrand}>
                <SelectTrigger id={ids.brand} className="h-8 w-full">
                  <SelectValue placeholder="Choose a brand" />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field
            id={ids.shop}
            label="Store address"
            hint="Its myshopify address, from Shopify admin → Settings → Domains."
          >
            <Input
              id={ids.shop}
              data-autofocus
              spellCheck={false}
              value={shop}
              onChange={(event) => setShop(event.target.value)}
              placeholder="your-store.myshopify.com"
              className="h-8 px-2.5 font-mono placeholder:text-caption-2"
            />
          </Field>
          <Field id={ids.client} label="Client ID">
            <Input
              id={ids.client}
              spellCheck={false}
              autoComplete="off"
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              placeholder="From the app’s Settings"
              className="h-8 px-2.5 font-mono placeholder:text-caption-2"
            />
          </Field>
          <Field
            id={ids.secret}
            label="Client secret"
            hint="Checked with Shopify, then kept encrypted."
          >
            <Input
              id={ids.secret}
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              placeholder="Paste the secret"
              className="h-8 px-2.5 font-mono placeholder:text-caption-2"
            />
          </Field>
        </div>
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
        {/* Figma 686:15456: Cancel is plain text on the frame, as the published modal's Done. */}
        <Button
          type="button"
          variant="ghost"
          size="compact"
          className="text-body"
          disabled={connect.isPending}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button type="submit" size="compact" disabled={connect.isPending}>
          {connect.isPending ? (
            <Spinner className="size-3.5" label="Checking" />
          ) : null}
          {connect.isPending ? "Checking…" : "Connect"}
        </Button>
      </div>
    </form>
  );
}

/** The connect form in its own dialog (Settings → Connections). */
export function ShopifyConnectDialog({
  open,
  onOpenChange,
  brands,
  brandId,
  onConnected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brands: { id: string; name: string }[];
  brandId?: string;
  onConnected?: (next: IntegrationsState) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="block bg-transparent p-0 ring-0 sm:max-w-md">
        <ModalFrame>
          <ShopifyConnectForm
            brands={brands}
            brandId={brandId}
            onCancel={() => onOpenChange(false)}
            onConnected={(next) => {
              onConnected?.(next);
              onOpenChange(false);
            }}
          />
        </ModalFrame>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Shopify's page in Connections (D90; as Vercel's): each brand's store with when it was connected
 * and any scope its app lacks, Disconnect per store, and Connect a store for another brand.
 */
export function ShopifyDetail({
  state,
  canManage,
  onBack,
  onConnect,
}: {
  state: IntegrationsState;
  canManage: boolean;
  onBack: () => void;
  onConnect: () => void;
}) {
  const save = useSetIntegrations();
  const [fullWidthOpen, setFullWidthOpen] = useState(false);
  const disconnect = useMutation({
    mutationFn: (brandId: string) =>
      apiFetch(
        `/api/integrations/shopify?brand_id=${encodeURIComponent(brandId)}`,
        integrationsStateSchema,
        { method: "DELETE" },
      ),
    onSuccess: (next) => {
      save(next);
      toast.success("Store disconnected");
      if (next.shopify.length === 0) onBack();
    },
    onError: (error) => toast.error(error.message),
  });
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
          <div className="flex size-13.5 shrink-0 items-center justify-center rounded-md bg-foreground-01 dark:bg-foreground-02">
            <ShopifyLogo className="h-7" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h1 className="font-serif text-type-h4 font-medium text-heading-01">
              Shopify
            </h1>
            <p className="text-type-body-small text-heading-05">
              {SHOPIFY_DESCRIPTION}
            </p>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-6">
        <SettingsDivider />
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-type-body-small font-medium text-heading-01">
              Stores
            </h2>
            {canManage ? (
              <Button
                type="button"
                variant="outline"
                size="xs"
                className="rounded-sm text-type-caption-1"
                onClick={onConnect}
              >
                Connect a store
              </Button>
            ) : null}
          </div>
          <p className="text-type-caption-1 text-heading-05">
            Pages fit into each theme’s page with its header and footer hidden.
            For an exact fit on any theme, add the full-width template.{" "}
            <button
              type="button"
              onClick={() => setFullWidthOpen(true)}
              className="font-medium text-text-link outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              How to add it
            </button>
          </p>
          <ul className="flex flex-col gap-2">
            {state.shopify.map((store) => (
              <li
                key={store.brand_id}
                className="flex items-center justify-between gap-3 rounded-md bg-foreground-01 p-2.5 dark:bg-foreground-02"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-type-caption-1">
                  <span className="truncate font-medium text-heading-01">
                    {store.brand_name}{" "}
                    <span className="font-mono font-normal text-heading-05">
                      {store.shop_domain}
                    </span>
                  </span>
                  <span className="text-heading-05">
                    {store.connected_at
                      ? `Connected ${format(new Date(store.connected_at), "d MMM yyyy")}`
                      : "Connected"}
                    {store.missing_scopes.length > 0
                      ? ` · without ${store.missing_scopes.join(", ")} (the page uses the theme’s template)`
                      : ""}
                  </span>
                </div>
                {canManage ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    className="rounded-sm text-type-caption-1"
                    disabled={disconnect.isPending}
                    onClick={() => disconnect.mutate(store.brand_id)}
                  >
                    Disconnect
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </div>
      <ShopifyFullWidthDialog
        open={fullWidthOpen}
        onOpenChange={setFullWidthOpen}
      />
    </div>
  );
}

/** One of the template's files: where it goes, Copy, and its code. */
function TemplateFile({ path, body }: { path: string; body: string }) {
  const copy = () =>
    void navigator.clipboard
      .writeText(body)
      .then(() => toast.success("Copied"))
      .catch(() => toast.error("Couldn’t copy it."));
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-md ring-half ring-stroke">
      <div className="flex items-center gap-2 bg-foreground-01 py-1.5 pr-1.5 pl-2.5 divider-b-half dark:bg-foreground-02">
        <span className="min-w-0 flex-1 truncate font-address text-type-caption-1 text-heading-02">
          {path}
        </span>
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="rounded-sm text-type-caption-1"
          onClick={copy}
        >
          Copy
        </Button>
      </div>
      <pre className="p-2.5 font-address text-type-caption-2 break-words whitespace-pre-wrap text-heading-04">
        {body}
      </pre>
    </div>
  );
}

/**
 * Show pages full width (D90): Shopify lets apps write theme files only with an exemption, so the
 * store owner adds the full-width template's two files to the theme once; publishing then finds
 * and uses them. The header, then the steps with each file and Copy, in the white card; Done on the
 * grey frame (laid out like the connect card, Figma 683:15139).
 */
export function ShopifyFullWidthSteps({
  shop,
  onDone,
  stacked = false,
}: {
  /** The store's myshopify address, to link to its themes. */
  shop?: string | null;
  onDone: () => void;
  /** A card stacked on the published modal: ← Back. */
  stacked?: boolean;
}) {
  const template = useQuery({
    queryKey: ["shopify-template"],
    queryFn: () =>
      apiFetch("/api/integrations/shopify/template", shopifyTemplateSchema),
    staleTime: "static",
    retry: false,
  });
  const [layout, page] = template.data?.files ?? [];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ModalCard className="flex min-h-0 flex-col rounded-lg pt-2">
        <ShopifyCardHeader
          onBack={stacked ? onDone : undefined}
          title="Show pages full width"
        >
          Pages already fit into most themes. These two files make the fit exact
          on any theme: add them once. Shopify doesn’t let apps write theme
          files, so it’s a copy and paste.
        </ShopifyCardHeader>
        <div className="flex min-h-0 min-w-0 flex-col gap-6 overflow-y-auto p-6 divider-t-half">
          <ol className="flex min-w-0 list-decimal flex-col gap-3 pl-4 text-type-caption-1 text-heading-04">
            <li>
              In Shopify admin, open{" "}
              {shop ? (
                <a
                  href={`https://${shop}/admin/themes`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-text-link hover:underline"
                >
                  Online Store → Themes
                </a>
              ) : (
                "Online Store → Themes"
              )}
              . On the current theme, click ⋯ → Edit code.
            </li>
            <li className="min-w-0">
              <div className="flex min-w-0 flex-col gap-2">
                <span>
                  In the layout folder, create a new file named lp-full.liquid.
                  Paste this into it, then Save.
                </span>
                {layout ? <TemplateFile {...layout} /> : null}
              </div>
            </li>
            <li className="min-w-0">
              <div className="flex min-w-0 flex-col gap-2">
                <span>
                  In the templates folder, create a new file named
                  page.lp-full.liquid. Paste this into it, then Save. Leave
                  theme.liquid as it is.
                </span>
                {page ? <TemplateFile {...page} /> : null}
              </div>
            </li>
            <li>
              Back here, click Update draft. The page switches to the full-width
              template. A new theme needs the two files again.
            </li>
          </ol>
          {template.isPending ? (
            <Spinner className="size-4 self-center" label="Loading the files" />
          ) : template.isError ? (
            <p
              role="alert"
              className="text-type-caption-1 font-medium text-text-danger"
            >
              {template.error.message}
            </p>
          ) : null}
        </div>
      </ModalCard>
      <div className="flex shrink-0 justify-end px-6 py-4">
        <Button type="button" size="compact" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

/** The full-width steps in their own dialog (the Shopify connection page). */
export function ShopifyFullWidthDialog({
  open,
  onOpenChange,
  shop,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shop?: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-11/12 flex-col gap-0 bg-transparent p-0 ring-0 sm:max-w-lg">
        <ModalFrame>
          <ShopifyFullWidthSteps
            shop={shop}
            onDone={() => onOpenChange(false)}
          />
        </ModalFrame>
      </DialogContent>
    </Dialog>
  );
}

/** ← Back at the top of a stacked card. */
/**
 * A Shopify card's header, inside its white card (Figma 683:15111): ← Back when it's stacked, the
 * bag on a white tile inside a washed one, the title and the line under it, centred.
 */
function ShopifyCardHeader({
  onBack,
  title,
  children,
}: {
  /** Stacked on the published modal: ← Back goes back to it. */
  onBack?: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col gap-6 px-6 pb-6",
        onBack ? "pt-4" : "pt-6",
      )}
    >
      {onBack ? <BackLink onClick={onBack} /> : null}
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="rounded-md bg-dashboard p-0.5 ring-half ring-stroke dark:bg-surface-primary">
          <div className="flex size-10 items-center justify-center rounded-sm bg-surface-primary ring-half ring-stroke dark:bg-foreground-02">
            <ShopifyLogo className="h-5.25" />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <ModalStackTitle className="text-type-body-small font-medium text-heading-01">
            {title}
          </ModalStackTitle>
          <ModalStackDescription className="text-type-caption-1 text-heading-05">
            {children}
          </ModalStackDescription>
        </div>
      </div>
    </div>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-mx-1.5 -my-0.5 -mb-2.5 flex w-fit items-center gap-1 rounded-sm px-1.5 py-0.5 text-type-caption-1 font-medium text-heading-05 transition-colors duration-150 ease-out outline-none hover:bg-foreground-02 hover:text-heading-01 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <BackIcon className="size-3" />
      Back
    </button>
  );
}
