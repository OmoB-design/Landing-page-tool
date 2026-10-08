import { createCn } from "cn/config";

/**
 * Class-name merging (shadcn's `cn`: clsx + tailwind-merge in one package), taught our custom
 * design tokens from app/globals.css so a later class wins over an earlier one of the same kind,
 * e.g. `cn("w-4", "w-rail")` → `w-rail`, and `text-md` is a font size, not a colour.
 *
 * Components must import `cn` from here. `shadcn add` writes `import { cn } from "cn"`; switch
 * new components to `@/lib/utils` after adding them.
 */
export const cn = createCn({
  extend: {
    theme: {
      spacing: ["rail", "sidebar", "topbar", "row", "nav-item"],
    },
    classGroups: {
      "font-size": [{ text: ["md"] }],
    },
  },
});
