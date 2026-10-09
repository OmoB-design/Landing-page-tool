"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LoadingIcon, PagesIcon } from "@/components/ui/icons";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { startTestBuild } from "@/lib/builds/actions";

export type BuildableProduct = { id: string; name: string; brand: string };

/** "Build a test page" from the editor: pick a product, build it from this template as it is
 * now, and open the build. Temporary until the create wizard (B1.2). */
export function EditorTestBuild({
  templateId,
  products,
}: {
  templateId: string;
  products: BuildableProduct[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const brands = [...new Set(products.map((p) => p.brand))];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="ml-1">
          <PagesIcon aria-hidden />
          <span className="sr-only sm:not-sr-only">Build a test page</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Build a test page</DialogTitle>
          <DialogDescription>
            Builds a page for a product from this template as it is now.
          </DialogDescription>
        </DialogHeader>
        {products.length === 0 ? (
          <p className="text-sm text-fg-muted">
            Add a product to one of your{" "}
            <Link href="/brands" className="underline underline-offset-4">
              brands
            </Link>{" "}
            first.
          </p>
        ) : (
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger aria-label="Product" className="h-9 w-full">
              <SelectValue placeholder="Choose a product" />
            </SelectTrigger>
            <SelectContent>
              {brands.map((brand) => (
                <SelectGroup key={brand}>
                  <SelectLabel>{brand}</SelectLabel>
                  {products
                    .filter((p) => p.brand === brand)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        )}
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            disabled={pending || !productId}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await startTestBuild(productId, templateId);
                if (result.buildId) router.push(`/pages/${result.buildId}`);
                else setError(result.error ?? "Couldn't start the build.");
              })
            }
          >
            {pending ? (
              <LoadingIcon
                aria-hidden
                className="animate-spin motion-reduce:animate-spin-slow"
              />
            ) : null}
            Build
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
