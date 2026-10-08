import { Button } from "@/components/ui/button";
import type { Icon } from "@/components/ui/icons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type ToolbarButtonProps = {
  icon: Icon;
  label: string;
  /** Shows the control but marks it unavailable, with a "Not built yet" tooltip. */
  notBuilt?: boolean;
  onClick?: () => void;
};

/**
 * A quiet icon-and-label button for list toolbars (filters, display options). Not a Client
 * Component itself, so Server Components can pass it an icon; pass `onClick` from client code.
 */
export function ToolbarButton({
  icon: ButtonIcon,
  label,
  notBuilt = false,
  onClick,
}: ToolbarButtonProps) {
  const button = (
    <Button
      variant="ghost"
      size="sm"
      aria-disabled={notBuilt || undefined}
      onClick={notBuilt ? undefined : onClick}
      className="text-fg-muted hover:bg-surface-hover aria-disabled:cursor-not-allowed"
    >
      <ButtonIcon aria-hidden />
      {/* Icon-only on phones so the toolbar fits; the label stays for screen readers. */}
      <span className="sr-only sm:not-sr-only">{label}</span>
    </Button>
  );
  if (!notBuilt) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>Not built yet</TooltipContent>
    </Tooltip>
  );
}
