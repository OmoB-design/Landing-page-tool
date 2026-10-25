import { redirect } from "next/navigation";

/** /settings opens General (D88). */
export default function SettingsPage() {
  redirect("/settings/general");
}
