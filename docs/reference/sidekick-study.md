# Shopify Sidekick (and other composers): what the page editor's composer learns from them

Studied 2026-11-04 in the owner's Shopify admin (store `four`, Online Store → Themes, desktop, 1280 × 720 CSS px at 2×), by measuring the live page (computed styles, a frame-by-frame recording of the layout while opening and closing) and from Shopify's notes ([changelog: the admin's new look](https://changelog.shopify.com/posts/see-the-shopify-admin-s-new-look), [Sidekick help](https://help.shopify.com/en/manual/shopify-admin/productivity-tools/sidekick/features)). Reference only: LP's own tokens, type and components are used when it's built (D20). Screenshots are kept locally in `.e2e-logs/sidekick/shots/` (not in git; they show the owner's store).

## 1. The frame

- A near-black canvas (`#0a0a0a`); the app's sidebar on it (220 px); the page in a **white panel with 16 px corners, 4 px from every window edge** (`#AppFrameMain`: `margin: 4px 4px 4px 220px`, `overflow: hidden`).
- The page panel's margins are animated: `margin-inline-end 0.5s cubic-bezier(0.2, 0.8, 0, 1)` (and padding-inline-end, margin-block-start 0.4s, height 0.4s), which is how it makes room for the chat.
- LP already has the same shape (the page in a floating white panel on the grey canvas, 6 px in): we keep our 6 px and our corner radius.

## 2. The floating composer (closed)

- A pill fixed at the bottom of the page panel, centred: **376 × 50 px**, white, **28 px corners**, 13 px padding, a fine border, no drop shadow; 16 px above the panel's bottom edge. It lives in a fixed strip spanning the page panel (a 3-column grid `334 | 376 | 334 px`, 8 px gaps), so it stays centred on the page, not the window, and follows the panel when it resizes (`inset-inline-start` / `width 0.25s cubic-bezier(0.2, 0.8, 0, 1)`).
- Contents, left to right: the **Sidekick character** (24 px, animated SVG); the field "**Work with Sidekick**" (13 px / 20 px, placeholder `#757575`, text `#101010`); **Add files and more** (+, 24 px round, icon `#606060`); **Dictate** (mic); a short vertical divider; **Open Sidekick** (the panel icon).
- Typing: the mic is replaced by a **black round send button** (↑) beside the +. Enter sends.
- Hidden parts that expand inside the pill with a blur-in (`filter: blur(3px)` on the collapsed content): a banner strip on top (`#f7f7f7`, 28/28/0/0 corners), an attachments row, choice options, a voice waveform (Sidekick purple `#29028d` / `#672ff4`).
- Motion of its own: `transform 0.7s` on a spring curve (`linear()` overshooting to 1.028), `border-radius 0.2s ease` (it morphs from pill to card).
- Focus looks the same as rest (just the caret).

## 3. Opening: the page squeezes and a second panel arrives

Measured per frame after clicking **Open Sidekick** (the same happens when you send from the bar):

| Time | What moves |
|---|---|
| 0–0.4 s | The floating bar **sinks** out of the page, about 74 px down past the bottom edge, accelerating. |
| ~0.55 s | The page panel's right margin starts growing: **4 → 364 px**, page width 1056 → 696 px, fast at first (`0.5s cubic-bezier(0.2, 0.8, 0, 1)`). It ends with a **4 px gap** between page and chat. |
| ~0.64 s | The chat panel appears on the right, **356 px wide**, full height, 4 px from the window's edge: scale 0.975 → 1, opacity 0 → 1, blur 1 px → 0, `1.6s cubic-bezier(0.2, 0.8, 0, 1)` after a 0.1 s delay (most of it lands in the first ~0.3 s). |
| ~0.96 s | The composer reappears inside the panel as a card (radius 28 → 20 px). |

The page's own content reflows to the narrower width (it's responsive, not scaled).

**Closing** (Close Sidekick) is quicker: the chat panel fades out in ~0.15 s (scale → 0.975, blur 1 px); the page widens back over ~0.45 s; the bar rises back into place with a 2 px spring overshoot.

The chat panel has a **resize handle**: an 8 px strip on its left edge, `role="separator"`, "Resize sidebar", `col-resize`, **300–450 px**, default 356.

## 4. The chat panel

- White, same corners as the page panel, fixed beside it.
- **Header** (42 px; 12 px padding, 28 px row): left, **Recents** (a 28 px pill with a history icon, 12 px medium label) when there's no conversation, or the **conversation's title** (grey, truncated; it's a button: "view conversations"); right, two 28 px round buttons: **Memory settings** (or **New chat**, a compose icon, once a conversation exists) and **Close Sidekick**.
- **Empty state**: the 44 px character over "**Where should we begin?**" (22 px / 28 px, medium, letter-spacing −2 %), centred in the scroll area; the composer at the foot. (Help docs: suggestions show here too.)
- **Composer card**: 332 × 100 px, 12 px in from the panel's sides and bottom, white, **20 px corners**, 12 px padding, a 1 px ring (`rgba(0,0,0,.06)`) and a soft layered shadow; the textarea on top (multi-line), the character bottom-left, **+** and mic (or send ↑, or **stop ■** while it works) bottom-right. Drop files anywhere on the panel: "Drop your files here". Help docs: up to 10 files, 15 MB each (images, PDF, CSV, text, JSON); messages queue while it replies.
- Type throughout: **13 px / 20 px**, letter-spacing −1 %, `#101010`.

## 5. A conversation

1. **Your message**: a bubble on the right, `#ebebeb`, **12 px corners**, 8 × 12 px padding; Copy on hover.
2. **"Working on it"** with a small animated dot spinner (braille-style).
3. The reply, as plain text on the panel (no bubble), in order:
   - a **plan sentence** ("I'll check how themes shape your online store and what you can customize.");
   - **step rows**, each a tick and a grey label (`#4a4a4a`), e.g. "✓ Checked help docs";
   - the **answer**, streamed in word by word (the newest words fade from grey to black);
   - **follow-up chips** (grey pills, e.g. "Getting started");
   - **Copy, thumbs up, thumbs down** (20 px icons).
4. The header's title renames itself to a summary of the conversation.

Shopify notes: answers can carry **Apply** (applies generated content), a right-arrow link to the resource, and a "Store changes" card with **Start review** for drafted changes.

## 6. The other composers (2026-11-04)

**AffectUI** (the kit LP already uses, D48). Free and read in full: *Thinking Loader* (a working pill: an eight-ray spinner and a label that rolls through phases, "Thinking → Searching the web → …", each old label rolling up and blurring out while the pill glides to the new width; it settles on a tick and "Thought for 6s"; ease `cubic-bezier(0.22, 1, 0.36, 1)`, 460 ms in, 320 ms out, a light sweeping over the label), *Tool Call Card* (one line per action: icon, name, summary, a live timer, a tick with the duration or "Failed"; it unfolds to the details with copy; errors show Retry; a group folds several into "Used 3 tools · 2.4s"; the body grows from `0fr` to `1fr`), *Message Actions* (quiet until the message is hovered; copy turns into a tick; regenerate spins and unfolds a "‹ 2 / 3 ›" version switcher; thumbs fill with a pop and thumbs-down unfolds reasons; ease `cubic-bezier(0.32, 0.72, 0.24, 1)`). Pro (paid, not downloaded; read from the public pages): *Chat Composer* (a white card up to 680 px; the field, a model picker, +, voice with the transcript appearing word by word in grey, connect apps, request approval), *Thinking State* (a live timer, searched sources as chips with "+N more", steps revealed one by one, "Finished thinking."), *Agent Plan* (the plan's goal and an estimate, steps you can rename, drag, remove and add before "Run plan"; then each step runs with a timer; "Retry from here" on a failed step), *Dropzone*.

**Antigravity** (Google; from public write-ups, not used live: it's a desktop app). Before a task you choose **Planning** (the agent writes a task list and an implementation plan as documents to review first, for bigger work) or **Fast** (it acts straight away). Its "artifacts" (task list, implementation plan, walkthrough with screenshots) sit in a sidebar, and you comment on them inline like a Google Doc; the agent reads the comments and adjusts. Its side panel takes context from what you've selected.

**Claude chat** (claude.ai; not studied live yet, it needs the owner's sign-in). Known patterns: a rounded composer card (field, + for files and tools, a model picker, send); the reply streams, with its thinking folded into a "Thought process" row with a timer and tool use as folded rows ("Searched the web" with sources); a long piece of work opens beside the chat as an artifact, the chat squeezing to the left (the same squeeze as Sidekick, mirrored); your own message can be edited and re-sent; Retry keeps versions you can step through.

## 7. What LP takes from them (B3.1b plan)


The editor's default is the page alone (Desktop / Phone) in the full panel, with the floating composer at its foot; opening the composer squeezes the page and brings the chat in as a second panel, with the motion above, in LP's tokens and 6 px gaps. The agent behind the chat (plan → steps → answer, Undo on every change, attachments) follows as B3.1c.

From the others: the working status rolls through what it's doing (AffectUI's Thinking Loader) and settles on "Done in 6s"; each change is a compact row with its time that unfolds to the lines before and after, with Undo (Tool Call Card); message actions stay quiet until hover (Message Actions); bigger requests can show the plan first to approve (Antigravity's Planning, B3.1c). LP's own twist: the chat and the page are linked, so the lines being rewritten shimmer on the page while it works and each change row shows its lines on the page.
