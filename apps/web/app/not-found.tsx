import Link from "next/link";

import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { SearchIcon } from "@/components/ui/icons";

/** An address the app doesn't have (B1.6c), outside the workspace shell. */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface-primary">
      <EmptyState
        icon={SearchIcon}
        title="This page isn’t here"
        action={
          <Button asChild size="compact">
            <Link href="/home">Go home</Link>
          </Button>
        }
      >
        The link may be wrong, or the page may have moved.
      </EmptyState>
    </main>
  );
}
