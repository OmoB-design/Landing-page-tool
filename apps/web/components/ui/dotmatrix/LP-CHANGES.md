# Dotmatrix loaders (vendored)

From the `@dotmatrix` shadcn registry: `pnpm dlx shadcn@latest add @dotmatrix/dotm-3x3-11`
(added at the owner's request, 2026-11-04, for Lander's "Working on it" status).

LP changes:
- The four files the CLI wrote (`components/ui/dotm-3x3-11.tsx`, `lib/dotmatrix-core.tsx`,
  `lib/dotmatrix-hooks.ts`, `components/dotmatrix-loader.css`) live together here, with relative
  imports, kept out of ESLint and Prettier like `components/ui/stageshow`.
- Used through `components/app/working-dots.tsx`, which sizes it for a status line (14 px) and
  colours it from the text colour (`currentColor`).

No license file came with the registry item; check its terms before shipping it beyond the team.
- 2026-11-06 (owner, Emil's speed tips): the collapse eases out (`var(--ease-out)`), not in.
