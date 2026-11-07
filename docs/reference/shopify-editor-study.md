# Shopify's theme editor: how it lists, selects and edits the parts of a section

Studied 2026-11-06 from the owner's screen recording of FourU's theme editor (48 s, desktop), open on LP's own editable draft of the BRĒZ page (`lp-bre-6-v1`, published by B4.2), alongside Shopify's documentation on [static blocks](https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks/static-blocks) and [`block.shopify_attributes`](https://shopify.dev/docs/api/liquid/objects/block#block-shopify_attributes). Reference only: when LP builds its own section tree, it uses LP's tokens, type and components (D20). Automated sign-in to Shopify is not used (blocked by safety checks); the recording is the owner's. The recording itself stays out of git (21 MB, it shows the owner's store).

## 1. The sidebar tree

- The panel's head: the template's name (`lp-bre-6-v1`), "Assigned to 1 page", and a **Preview** row (which page fills the template; a hidden page can't be previewed, so Shopify shows another page, here "Contact", with a warning icon).
- **Template**, then one row per section, in page order: a **chevron** (expand), the **section icon** (stacked lines; a picture icon for a section that is mostly a picture, a tag for a product card, a question mark style icon for the FAQ), and the **section's name** from LP's map ("Story bar", "The problem", "Comparison table" …). **Add section** at the end.
- Hovering a row: a light grey fill, an **eye** button at its right (hide or show), and the matching section is outlined on the page with its name in a blue tab (see §3).
- Expanding a section lists its **blocks**, indented under it, each with an icon for its kind and a name:
  - plain text blocks read **"Paragraph — *Most cocktail night…*"**: the block's name, an em dash, then the start of its text in italics, cut with an ellipsis;
  - formatted ones read **"Headline (HTML)"**, **"Paragraph (HTML)"**, **"List item (HTML)"** with a dashed-square icon and no excerpt;
  - pictures read **"Scene picture"** with a picture icon.
- Blocks keep the page's order. Static blocks (LP's) can be selected and hidden, not moved or deleted.

### The rows up close (the owner's second recording, 2026-11-07)

- **The mover:** hovering a section row swaps its icon for the six-dot grip, in the same place; with the pointer on the grip it gets a small grey rounded square. The eye (hide) shows at the row's right.
- **The dropdown:** the chevron is at the far left and gets its own grey rounded square on hover; a click opens the section at once (the chevron turns down) and several can be open together.
- **The parts:** their fill starts under the section's icon and their icon under the section's name; pictures show a tiny thumbnail of the picture; hovering a part swaps its icon for a lock (it can't be moved) and shows the eye.
- Hovering the top edge of a row shows a blue line with a + (add a section there).

## 2. Selecting a block

- Clicking a block (in the tree or on the page) **splits the sidebar**: the tree shrinks to a short scrolling strip at the top, scrolled so the chosen row shows, the chosen row filled **blue** with white text; below it, the **block's panel**.
- The block's panel:
  - a head with the block's icon and name ("Paragraph"), a **⋯ menu** (**Rename**, **Hide**, **Edit code**) and **×** (back to the full tree);
  - **Rename** turns the head into a text field with the name selected;
  - the setting's label ("Paragraph") with a **Connect dynamic source** button (a database icon) at its right;
  - for plain text, a rich text field with a toolbar: **AI** (sparkle), **Bold**, **Italic**, **Link**; edits show on the page as you type;
  - for an "(HTML)" block, the raw HTML in a monospaced box (LP's formatting spans show here, for example `<span data-lp-fmt="" style="font-size: 28px">`).
- Clicking another text on the page moves the selection: the tree strip scrolls to it and the panel swaps.
- **The motion, frame by frame (60 fps):** expanding a section is instant (only the chevron turns). Picking a block: the row fills blue in about 50 ms; from about 70 ms to 230 ms the tree's card shrinks from the bottom to a strip of about four rows while the block's card rises from the sidebar's foot into the room under it, fast then settling (ease-out); then, until about 700 ms, the strip scrolls the picked row into view smoothly. (LP's own, owner 2026-11-07: the panel arrives as Buddy's panel does instead, 0.36 s ease-out with scale, fade and blur, framed as Buddy's change card.)

## 3. On the page

- The hovered or chosen part gets a **blue outline** (about 2 px, square corners) and a **blue tab** at its top-left, outside the box, with the part's icon and name ("The problem", "Paragraph", "Paragraph (HTML)").
- A chosen block also gets a floating **Ask for changes** pill (Sidekick's icon and label, and a hide button) just below its right side, so Sidekick works on that block.
- A section shows its tab at the section's top; for the first section the tab sits at the page's top edge.

## 4. What LP's editor takes from it (the next build)

LP's page editor already has sections, a mover and Buddy with a section chip. From Shopify:

1. **A tree in the sections drawer**: each section expands into its parts (texts, pictures, buttons, videos), in page order, named as Shopify names them (the part's kind, a dash and the start of its words).
2. **Hover is shared**: hovering a row outlines the part on the page with a tab naming it; hovering the page highlights the row.
3. **Choosing a part** (row or page) selects it in both places and opens its panel: the part's name, the words or picture to change, quick actions (Hide, Rename) and close.
4. **Point Buddy at it**: the chosen part becomes Buddy's chip (the same chip as a section, with the part's icon), and a small "Ask Buddy" pill floats by the part on the page, as Shopify's "Ask for changes".
5. LP's own parts map is the editor map (B4.1): the same names Shopify shows, so the two editors agree.

Noted for the Shopify output (not this build): formatted texts arrive as "(HTML)" blocks showing raw spans. Shopify's rich text setting can't carry LP's inline sizes and colours, so these stay HTML; a later pass could turn bold, italic and links into rich text and keep only true styling as HTML.
