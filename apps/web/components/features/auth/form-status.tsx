import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertIcon, LoadingIcon, MailIcon } from "@/components/ui/icons";

/** The form-level result of an auth action: an error, or a confirmation message. */
export function FormStatus({
  error,
  message,
}: {
  error?: string;
  message?: string;
}) {
  if (error) {
    return (
      <Alert variant="destructive" className="border-danger/30 bg-danger-soft">
        <AlertIcon aria-hidden />
        <AlertDescription className="text-danger">{error}</AlertDescription>
      </Alert>
    );
  }
  if (message) {
    return (
      <Alert role="status" className="border-success/30 bg-success-soft">
        <MailIcon aria-hidden className="text-success" />
        <AlertDescription className="text-fg">{message}</AlertDescription>
      </Alert>
    );
  }
  return null;
}

/** Full-width submit button with a spinner and alternative label while the action runs. */
export function SubmitButton({
  pending,
  label,
  pendingLabel,
  variant = "default",
}: {
  pending: boolean;
  label: string;
  pendingLabel: string;
  variant?: "default" | "outline";
}) {
  return (
    <Button
      type="submit"
      variant={variant}
      disabled={pending}
      className="h-9 w-full"
    >
      {pending ? (
        <LoadingIcon
          aria-hidden
          className="animate-spin motion-reduce:animate-spin-slow"
        />
      ) : null}
      {pending ? pendingLabel : label}
    </Button>
  );
}
