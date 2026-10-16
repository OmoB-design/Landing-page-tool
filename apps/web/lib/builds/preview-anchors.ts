/** Sent with a section key when a claim's section button is pressed; the preview jumps there. */
export const LOCATE_SECTION_EVENT = "lp:locate-section";

/** The id the build page jumps to for a section: `lp-section-<key>`, the key kept to safe characters. */
export function sectionAnchor(key: string): string {
  return `lp-section-${key.replace(/[^\w-]/g, "-")}`;
}

/** The jumped-to section's outline in the preview: the app's Spot-500-Blue, 2 px, inside the edge. */
const TARGET_STYLE =
  '<style>[id^="lp-section-"]:target{outline:2px solid #2c66ff;outline-offset:-2px;scroll-margin-top:16px}</style>';

/**
 * Gives each marked section (`data-lp-section`) of a built page an id the build page can jump to
 * from the claims check, and outlines the section jumped to. A section that already has an id, or
 * repeats a key, keeps its markup as it is. For the preview only; exports are untouched.
 */
export function addSectionAnchors(html: string): string {
  const seen = new Set<string>();
  const marked = html.replace(
    /<([a-zA-Z][\w-]*)(\s[^>]*?\bdata-lp-section="([^"]+)"[^>]*)>/g,
    (tag: string, name: string, attrs: string, key: string) => {
      if (seen.has(key) || /\sid\s*=/.test(attrs)) return tag;
      seen.add(key);
      return `<${name} id="${sectionAnchor(key)}"${attrs}>`;
    },
  );
  return marked.includes("</head>")
    ? marked.replace("</head>", `${TARGET_STYLE}</head>`)
    : `${TARGET_STYLE}${marked}`;
}
