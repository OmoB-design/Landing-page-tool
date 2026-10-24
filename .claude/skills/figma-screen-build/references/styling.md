# Mapping Figma to the app's styles

## Tokens

- Figma variable names are class names: `Surface/Foreground-02` → `bg-foreground-02`,
  `Typography/Heading-05` → `text-heading-05`, `Icon/Icon-System` → `text-icon-system`. Text
  styles map to `text-type-caption-1` (12), `text-type-caption-2` (11), `text-type-body-small` (13)
  and so on, with `font-medium` for the "MD" styles.
- Spacing is Tailwind's 4 px scale (`p-1.5` = 6 px, `gap-2.5` = 10 px, `w-70` = 280 px). Fractions
  work (`w-43.75`).
- Radius: `rounded-xsm` 4, `rounded-sm` 6, `rounded-md` 8, `rounded-lg` 10, `rounded-item` 12,
  `rounded-panel` 16, `rounded-card` 18, `rounded-xl` 24.
- `pnpm lint:tokens` rejects `x-[…]` arbitrary values, hex and `rgb(` in `app/`, `components/app`
  and `components/features`. A value that isn't a token becomes one in `globals.css` (`@theme` for
  Tailwind-visible tokens; plain custom properties for the rest). CSS variables in classes are fine:
  `w-(--panel-width)`, `bg-(--mover-fill)`, `border-(length:--line-hairline)`.
- A dynamic number (a dragged width, a dial value) goes in `style`, with a comment that it is data.
- New shadow or radius tokens are registered in `lib/utils.ts` (the `cn` merge config) or
  `tailwind-merge` drops them; the same for new ring widths.

## Sub-pixel strokes

Browsers round borders to whole pixels; box shadows keep fractions, like Figma. Existing utilities:

| Figma | Utility |
| --- | --- |
| 0.5 px outside line, any colour | `ring-half ring-stroke` (add `ring-inset` for inside) |
| 0.7 px outside | `ring-thin ring-stroke-strong` |
| 0.7 px inside, over the children (a frame's stroke) | `stroke-inside-thin` (needs the radius) |
| 0.5 / 0.7 px line at one edge | `divider-t-half`, `divider-b-half`, `divider-b-thin`, `divider-y-half`, `divider-t-strong`, `divider-b-strong` |
| 0.5 px border on a floating frame | `edge-hairline`; panels `edge` |
| A real border that must stay thin | `border-(length:--line-hairline)` (0.5) or `--wizard-line` (0.8) |
| Dashed line with set dash lengths | an inline SVG `rect` with `strokeDasharray` (a CSS dashed border can't set the dash) — see `DashedFrame` in `build-preview.tsx` |

Inset-shadow utilities share `--tw-inset-shadow`, so two on one element override each other; make
a combined utility (`divider-y-half`) instead.

## Theme differences

- When light and dark differ only in token values, the tokens handle it.
- When the structure differs (light switch Foreground-03, dark switch Dashboard), drive it with
  custom properties set on `:root` and `.dark` in `globals.css` and read them in a utility
  (`--segmented-*`, `--mover-*`), or with `dark:` variants for one or two properties.
- Inside an `@utility`, `@variant dark { … }` works for a per-theme value
  (`hairline-well`'s stroke).

## Type and boxes

- Figma's text boxes round 150 % line heights up (13 px → 20 px): add `leading-5` where heights
  must match.
- To change a label's size without moving its neighbours (12 → 13 px when a step starts), set it at
  the larger size and `scale-92` it at rest, `origin-left`, transitioning `transform`.
- Fixed-height rows keep a card from growing when states change; the owner noticed and asked.

## Components from shadcn

shadcn parts in `components/ui` are scaffolding the owner replaces from Figma. Override their
classes at the call site, or restyle them in `components/ui` when Figma defines the component.
Icons: `lp-icons.tsx` (Figma) or lucide through `components/ui/icons`.
