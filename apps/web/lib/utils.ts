import { createCn } from "cn/config";

/**
 * Class-name merging (shadcn's `cn`: clsx + tailwind-merge in one package), taught our custom
 * design tokens from app/globals.css so a later class wins over an earlier one of the same kind,
 * e.g. `cn("w-4", "w-sidebar")` → `w-sidebar`, and `text-type-body-small` is a font size, not a colour.
 *
 * Components must import `cn` from here. `shadcn add` writes `import { cn } from "cn"`; switch
 * new components to `@/lib/utils` after adding them.
 */
export const cn = createCn({
  extend: {
    theme: {
      spacing: ["sidebar", "topbar", "header", "row", "nav-item"],
      radius: ["xsm", "xxl", "max"],
    },
    classGroups: {
      // The Figma type scale (D68); without this, text-type-* would read as a text colour.
      "font-size": [
        {
          text: [
            "type-caption-3",
            "type-caption-2",
            "type-caption-1",
            "type-body-small",
            "type-body-large",
            "type-h6",
            "type-h5",
            "type-h4",
            "type-h3",
            "type-h2",
            "type-h1",
          ],
        },
      ],
    },
  },
});
