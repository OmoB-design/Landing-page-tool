import Link from "next/link";

import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { SearchIcon } from "@/components/ui/icons";

/**
 * A page, brand or template that isn't there (B1.6c): it may be in Trash, deleted, or in another
 * workspace (they read the same, so nothing leaks). Inside the workspace shell.
 */
export default function AppNotFound() {
  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState
        icon={SearchIcon}
        title="This page isn’t here"
        action={
          <div className="flex gap-2">
            <Button asChild size="compact">
              <Link href="/home">Go home</Link>
            </Button>
            <Button asChild variant="outline" size="compact">
              <Link href="/settings/trash">Open Trash</Link>
            </Button>
          </div>
        }
      >
        It may have been moved to Trash or deleted, or the link may be wrong.
      </EmptyState>
    </div>
  );
}
