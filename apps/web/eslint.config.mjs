import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Animation comes from motion/react only (DECISIONS.md D18).
const noFramerMotion = {
  name: "framer-motion",
  message: "Import from motion/react instead (DECISIONS.md D18).",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-restricted-imports": ["error", { paths: [noFramerMotion] }],
    },
  },
  // Only components/ui and components/app may touch Radix directly; everything else imports
  // UI from @/components/ui or @/components/app so a Figma redesign touches one folder (D20).
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["components/ui/**", "components/app/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            noFramerMotion,
            {
              name: "radix-ui",
              message:
                "Import UI from @/components/ui or @/components/app (DECISIONS.md D20).",
            },
            {
              name: "lucide-react",
              message:
                "Import icons from @/components/ui/icons so the icon set can be swapped in one file.",
            },
          ],
          patterns: [
            {
              group: ["@radix-ui/*"],
              message:
                "Import UI from @/components/ui or @/components/app (DECISIONS.md D20).",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Hairline's engine, copied unchanged from its skill, and figures drawn on it (D82).
    "public/hairline/**",
  ]),
]);

export default eslintConfig;
