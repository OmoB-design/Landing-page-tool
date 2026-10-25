import { SettingsPage } from "./settings-page";

/** A settings page while the worker can't be reached. */
export function Unreachable() {
  return (
    <SettingsPage
      title="Settings"
      description="These settings can’t be loaded right now: the service behind them isn’t reachable. Try again in a minute."
    >
      {null}
    </SettingsPage>
  );
}
