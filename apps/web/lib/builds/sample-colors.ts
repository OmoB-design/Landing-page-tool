import type { DeskState } from "@/lib/validators/desk";

// SAMPLE COLOURS for /dev/build-states (the desk's Colours card): a page in the template's blue
// and an invented brand's plum. Kept here because they are data, not styling (the token check
// keeps raw colours out of feature components).
export const SAMPLE_DESK_COLORS: DeskState["colors"] = {
  page: {
    primary: "#2f6fde",
    dark: "#1d4ea6",
    tint: "#eaf1fd",
    accent: "#2f6fde",
  },
  brand: {
    primary: "#7a2e8f",
    dark: "#4a1c57",
    tint: "#f4eaf6",
    accent: "#7a2e8f",
  },
};
