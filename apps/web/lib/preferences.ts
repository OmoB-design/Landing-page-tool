// Per-browser UI preferences: colour theme (localStorage) and sidebar collapse (cookie, DESIGN.md).

export const THEME_STORAGE_KEY = "lp-theme";
export const SIDEBAR_COOKIE = "lp_sidebar";

export type ThemePreference = "light" | "dark" | "system";

export function isThemePreference(value: string): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

/**
 * Runs in <head> before first paint (app/layout.tsx) so the saved theme and sidebar state apply
 * without a flash. Plain ES5; any storage error falls back to the defaults.
 */
export const PRE_PAINT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);if(/(?:^|; )${SIDEBAR_COOKIE}=collapsed(?:;|$)/.test(document.cookie)){document.documentElement.setAttribute("data-sidebar","collapsed");}}catch(e){}})();`;
