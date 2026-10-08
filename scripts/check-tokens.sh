#!/bin/sh
# Fails when app code uses raw colours or arbitrary Tailwind values instead of design tokens
# (docs/DESIGN.md §4). Checks routes (app/), app composites and feature components.
# components/ui is exempt: it is shadcn scaffolding that Figma replaces component by component.
cd "$(dirname "$0")/.." || exit 1

matches=$(grep -rnE --include='*.ts' --include='*.tsx' \
  -e '[a-z]-\[[^]]+\]' \
  -e '#[0-9a-fA-F]{3,8}\b' \
  -e '(rgb|rgba|hsl|hsla|oklch)\(' \
  apps/web/app apps/web/components/app apps/web/components/features)

if [ -n "$matches" ]; then
  echo "Raw colours or arbitrary values found. Use design tokens (docs/DESIGN.md §4):"
  echo "$matches"
  exit 1
fi
echo "Token check passed."
