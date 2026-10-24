# Documenting and shipping

## Docs (every pass)

- `docs/DECISIONS.md`: a new **Dxx — <screen> from Figma** (Locked, owner, date) for a new screen,
  or a *Follow-up n (owner, date)* sentence on the screen's existing decision. Say what the frames
  decided, what you chose where they disagreed or were silent, tokens changed, and new utilities.
- `docs/DESIGN.md`: the screen's row in §6 (route, what it shows, key components), and §5 for new
  shared components (`Mover`, `HairlineFigure`).
- `docs/BUILD_LOG.md`: an entry (Status, Date, Owner's ask, Summary, Verification with what was
  actually run and seen, Owner confirmed: no), or a follow-up bullet under the current one.
- `docs/DEPENDENCIES.md` for packages; `THIRD_PARTY_NOTICES.md` (with the licence text) for copied
  code or skills.

## The report

Short, for the owner:

- what changed, in their words, and the cause when they described a symptom;
- full URLs to see it (`http://localhost:3000/...`, `?demo`, `/dev/<screen>-states`);
- what was verified (checks, the states looked at, measurements);
- choices where frames disagreed, were placeholders, or were silent;
- anything that costs money, needs the worker deployed, or changes other screens;
- "Not committed" (and that an experiment waits for their approval).

## Commit, push, deploy

- Commit only when asked. Stage your files by name; leave changes you didn't make (another session's)
  out, or ask. End the message with the attribution line the session gives.
- A push to `main` deploys production on Vercel and rebuilds the Railway worker. Only on the owner's
  "push". After pushing, check the production deployment reaches READY (Vercel MCP
  `list_deployments`, then `vercel inspect <url> --wait`); if the webhook didn't fire, create the
  deployment from the commit.
- A link for someone without pushing: `vercel deploy --target preview --yes` from the repo root
  (always `--target preview`), then `get_access_to_vercel_url` for a 23-hour share link.
  Development-only pages and `?demo` don't exist there.
- Worker changes (new endpoints) only reach production when Railway rebuilds from `main`; say so.
