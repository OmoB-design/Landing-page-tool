import { getBuildProof, WorkerError } from "@/lib/api/worker";
import { getApiSession } from "@/lib/auth/api-session";
import { getSessionContext } from "@/lib/auth/session";
import { addSectionAnchors } from "@/lib/builds/preview-anchors";
import { getBuild } from "@/lib/builds/queries";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Runs inside the review desk's preview (`?mode=edit`, D84): the worker marks every sentence
 * (`data-lp-frag`) and every paragraph (`data-lp-block`). Hovering a paragraph outlines it
 * (dashed), clicking tells the desk which one it is, and the desk can select one (solid outline)
 * and scroll to it. Links and forms do nothing here. Talks to the desk only through postMessage;
 * the frame has an opaque origin, so it can't reach the app.
 */
const DESK_BRIDGE = `(function () {
  var colour = "Highlight", selected = null, hovered = null;
  var style = document.createElement("style");
  (document.head || document.documentElement).appendChild(style);
  function block(el) {
    for (; el && el !== document.documentElement; el = el.parentElement) {
      if (el.nodeType === 1 && el.hasAttribute("data-lp-block")) return el;
    }
    return null;
  }
  function rule(n) { return '[data-lp-block="' + n + '"]'; }
  function paint() {
    var css = "[data-lp-block]{cursor:text}";
    if (hovered && hovered !== selected)
      css += rule(hovered) + "{outline:1.5px dashed " + colour + " !important;outline-offset:3px !important;border-radius:2px}";
    if (selected)
      css += rule(selected) + "{outline:2px solid " + colour + " !important;outline-offset:3px !important;border-radius:2px}";
    style.textContent = css;
  }
  document.addEventListener("mouseover", function (e) {
    var el = block(e.target), n = el && el.getAttribute("data-lp-block");
    if (n !== hovered) { hovered = n; paint(); }
  });
  document.documentElement.addEventListener("mouseleave", function () { hovered = null; paint(); });
  document.addEventListener("click", function (e) {
    e.preventDefault();
    var el = block(e.target);
    if (el) parent.postMessage({ type: "lp-block", block: Number(el.getAttribute("data-lp-block")) }, "*");
  }, true);
  document.addEventListener("submit", function (e) { e.preventDefault(); }, true);
  window.addEventListener("message", function (e) {
    if (e.source !== parent || !e.data || e.data.type !== "lp-block-select") return;
    if (typeof e.data.colour === "string" && /^[#\\w(),.%\\s-]+$/.test(e.data.colour)) colour = e.data.colour;
    selected = typeof e.data.block === "number" ? String(e.data.block) : null;
    paint();
    var el = selected && document.querySelector(rule(selected));
    if (el && e.data.scroll) {
      var box = el.getBoundingClientRect();
      if (box.top < innerHeight * 0.1 || box.bottom > innerHeight * 0.85)
        window.scrollTo({ top: box.top + scrollY - innerHeight * 0.3, behavior: e.data.instant ? "auto" : "smooth" });
    }
  });
  // The template's reading meter (a bar that fills as you scroll) runs on the page's own script,
  // which is off here, so the bridge fills it (owner, 2026-11-05: "the page loader isn't working").
  var meter = document.querySelector(".scroll-meter-pct");
  if (meter) {
    meter.style.transform = "none";
    var fill = function () {
      var max = (document.documentElement.scrollHeight - innerHeight) || 1;
      meter.style.width = Math.max(0, Math.min(1, scrollY / max)) * 100 + "%";
    };
    addEventListener("scroll", fill, { passive: true });
    addEventListener("resize", fill, { passive: true });
    fill();
  }
  parent.postMessage({ type: "lp-ready" }, "*");
})();`;

/**
 * Runs inside the page editor's canvas (`?mode=write`, B3.1a, D104), on the same proof as the
 * desk's. Hovering outlines a line (dashed) and its section; clicking a line selects its section
 * and lets you type in it, unless it's filled from data (the editor says why) or the editor has
 * paused editing (a redraft is running). Text filled from data inside a line can't be typed over.
 * Paste is plain text; Enter or a click away ends the line, Escape puts it back. The text it reports
 * is the line as the worker reads it (every text node of the line, whitespace collapsed), so a
 * save matches the paragraph it's checked against. ⌘Z / ⇧⌘Z outside a line go to the editor.
 * B3.1b: the lines Lander is rewriting breathe (`lp-busy`), and Show on page flashes the lines a
 * change rewrote and scrolls to them (`lp-flash`).
 * B3.2a: a numbered image (`data-lp-img`) outlines on hover and clicking it opens it in the image
 * studio (`lp-image`), even under an overlay; the editor outlines the one it has open
 * (`lp-image-select`). The brand's logo says where to change it instead (`lp-logo`).
 * Both bridges fill the template's reading meter as the page scrolls (its own script is off).
 * Talks to the editor only through postMessage; the frame has an opaque origin.
 */
const WRITE_BRIDGE = `(function () {
  var colour = "Highlight", locked = {}, paused = false, busy = [], flash = [], flashTimer = 0;
  var section = null, hoverSection = null, hoverBlock = null, editing = null, saved = "";
  var image = null, hoverImage = null;
  var style = document.createElement("style");
  (document.head || document.documentElement).appendChild(style);
  function send(data) { parent.postMessage(data, "*"); }
  function closest(el, attr) {
    for (; el && el !== document.documentElement; el = el.parentElement)
      if (el.nodeType === 1 && el.hasAttribute(attr)) return el;
    return null;
  }
  function topSection(el) {
    var found = null;
    for (; el && el !== document.documentElement; el = el.parentElement)
      if (el.nodeType === 1 && el.hasAttribute("data-lp-section")) found = el;
    return found;
  }
  function number(el) { return Number(el.getAttribute("data-lp-block")); }
  function blockSel(n) { return '[data-lp-block="' + Number(n) + '"]'; }
  function numbers(list) { return Array.isArray(list) ? list.filter(function (n) { return typeof n === "number"; }) : []; }
  function textOf(block) {
    var walk = document.createTreeWalker(block, NodeFilter.SHOW_TEXT), out = "", space = false, n;
    while ((n = walk.nextNode())) {
      if (closest(n.parentElement, "data-lp-block") !== block) continue;
      var t = n.nodeValue;
      for (var i = 0; i < t.length; i++) {
        if (/\\s/.test(t[i])) { if (out && !space) out += " "; space = true; }
        else { out += t[i]; space = false; }
      }
    }
    return out.replace(/ +$/, "");
  }
  function key(el) { return el ? el.getAttribute("data-lp-section") : null; }
  function picture(e) {
    if (closest(e.target, "data-lp-block")) return null;
    var under = document.elementsFromPoint ? document.elementsFromPoint(e.clientX, e.clientY) : [e.target];
    for (var i = 0; i < under.length; i++) {
      var el = under[i];
      if (el.tagName === "IMG" && /^\\d+$/.test(el.getAttribute("data-lp-img") || "")) return el;
      if (el.hasAttribute && el.hasAttribute("data-lp-block")) return null;
    }
    return null;
  }
  function imgSel(n) { return 'img[data-lp-img="' + Number(n) + '"]'; }
  function sel(k) { return '[data-lp-section="' + String(k).replace(/"/g, "") + '"]'; }
  function paint() {
    var css = "[data-lp-block]{cursor:text}[data-lp-locked-block]{cursor:default}img[data-lp-img]{cursor:pointer}img[data-lp-logo]{cursor:default}" +
      "[contenteditable]{outline:2px solid " + colour + " !important;outline-offset:3px !important;border-radius:2px;cursor:text}" +
      "[contenteditable] [data-lp-frag-locked]{text-decoration:underline dotted;text-underline-offset:3px}";
    if (hoverSection && hoverSection !== section)
      css += sel(hoverSection) + "{outline:1.5px dashed " + colour + " !important;outline-offset:-2px !important}";
    if (section)
      css += sel(section) + "{outline:2px solid " + colour + " !important;outline-offset:-2px !important}";
    if (hoverBlock && !editing)
      css += '[data-lp-block="' + hoverBlock + '"]:not([data-lp-locked-block]){outline:1.5px dashed ' + colour + " !important;outline-offset:3px !important;border-radius:2px}";
    if (hoverImage && hoverImage !== image)
      css += imgSel(hoverImage) + ":not([data-lp-logo]){outline:1.5px dashed " + colour + " !important;outline-offset:-2px !important}";
    if (image)
      css += imgSel(image) + "{outline:2px solid " + colour + " !important;outline-offset:-2px !important}";
    if (busy.length)
      css += busy.map(blockSel).join(",") + "{animation:lp-busy 1.6s ease-in-out infinite}" +
        "@keyframes lp-busy{0%,100%{opacity:1}50%{opacity:.42}}" +
        "@media (prefers-reduced-motion:reduce){" + busy.map(blockSel).join(",") + "{animation:none;opacity:.6}}";
    if (flash.length)
      css += flash.map(blockSel).join(",") + "{animation:lp-flash 1.9s cubic-bezier(.2,.8,0,1) 1;border-radius:3px}" +
        "@keyframes lp-flash{0%{background-color:color-mix(in srgb," + colour + " 22%,transparent);box-shadow:0 0 0 4px color-mix(in srgb," + colour + " 22%,transparent)}100%{background-color:transparent;box-shadow:0 0 0 4px transparent}}";
    style.textContent = css;
  }
  function finish(cancel) {
    if (!editing) return;
    var block = editing;
    editing = null;
    if (cancel) block.innerHTML = saved;
    block.removeAttribute("contenteditable");
    var inner = block.querySelectorAll("[data-lp-frag-locked]");
    for (var i = 0; i < inner.length; i++) inner[i].removeAttribute("contenteditable");
    send({ type: cancel ? "lp-cancel" : "lp-commit", block: number(block), text: textOf(block) });
    paint();
  }
  function start(block, x, y) {
    finish(false);
    editing = block;
    saved = block.innerHTML;
    var inner = block.querySelectorAll("[data-lp-frag-locked]");
    for (var i = 0; i < inner.length; i++) inner[i].setAttribute("contenteditable", "false");
    try { block.contentEditable = "plaintext-only"; } catch (e) { block.contentEditable = "true"; }
    if (block.contentEditable !== "plaintext-only") block.contentEditable = "true";
    block.focus();
    var range = document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null;
    if (range && block.contains(range.startContainer)) {
      var s = getSelection(); s.removeAllRanges(); s.addRange(range);
    }
    send({ type: "lp-start", block: number(block), text: textOf(block) });
    paint();
  }
  document.addEventListener("mouseover", function (e) {
    var b = closest(e.target, "data-lp-block"), s = key(topSection(e.target));
    var n = b ? b.getAttribute("data-lp-block") : null;
    var p = picture(e), m = p ? p.getAttribute("data-lp-img") : null;
    if (n !== hoverBlock || s !== hoverSection || m !== hoverImage) {
      hoverBlock = n; hoverSection = s; hoverImage = m; paint();
    }
  });
  document.documentElement.addEventListener("mouseleave", function () {
    hoverBlock = null; hoverSection = null; hoverImage = null; paint();
  });
  document.addEventListener("click", function (e) {
    var b = closest(e.target, "data-lp-block");
    if (editing && b === editing) return;
    e.preventDefault();
    var s = key(topSection(e.target));
    if (s && s !== section) { section = s; send({ type: "lp-section", key: s }); }
    var p = picture(e);
    if (p) {
      finish(false);
      if (p.hasAttribute("data-lp-logo")) { send({ type: "lp-logo" }); paint(); return; }
      image = p.getAttribute("data-lp-img");
      send({ type: "lp-image", number: Number(image) });
      paint();
      return;
    }
    if (image) { image = null; send({ type: "lp-image", number: null }); }
    if (!b) { finish(false); paint(); return; }
    if (paused) { finish(false); send({ type: "lp-paused" }); paint(); return; }
    if (locked[number(b)]) { finish(false); send({ type: "lp-locked", block: number(b) }); paint(); return; }
    start(b, e.clientX, e.clientY);
  }, true);
  document.addEventListener("input", function (e) {
    if (editing && editing.contains(e.target))
      send({ type: "lp-input", block: number(editing), text: textOf(editing) });
  });
  document.addEventListener("keydown", function (e) {
    var mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (editing) {
      if (e.key === "Enter") { e.preventDefault(); finish(false); }
      else if (e.key === "Escape") { e.preventDefault(); finish(true); }
      return;
    }
    if (mod && (k === "z" || k === "y")) {
      e.preventDefault();
      send({ type: "lp-key", key: k === "y" || e.shiftKey ? "redo" : "undo" });
    }
  });
  document.addEventListener("paste", function (e) {
    if (!editing) return;
    e.preventDefault();
    var text = (e.clipboardData && e.clipboardData.getData("text/plain")) || "";
    document.execCommand("insertText", false, text.replace(/\\s+/g, " "));
  });
  document.addEventListener("drop", function (e) { e.preventDefault(); });
  document.addEventListener("focusout", function (e) {
    if (editing && e.target === editing) finish(false);
  });
  document.addEventListener("submit", function (e) { e.preventDefault(); }, true);
  var ticking = false;
  addEventListener("scroll", function () {
    if (ticking) return;
    ticking = true;
    setTimeout(function () { ticking = false; send({ type: "lp-scroll", y: scrollY }); }, 150);
  });
  addEventListener("message", function (e) {
    var d = e.data;
    if (e.source !== parent || !d || typeof d.type !== "string") return;
    if (typeof d.colour === "string" && /^[#\\w(),.%\\s-]+$/.test(d.colour)) colour = d.colour;
    if (d.type === "lp-setup") {
      locked = {};
      (d.locked || []).forEach(function (n) { locked[n] = true; });
      var blocks = document.querySelectorAll("[data-lp-block]");
      for (var i = 0; i < blocks.length; i++) {
        if (locked[number(blocks[i])]) blocks[i].setAttribute("data-lp-locked-block", "");
        else blocks[i].removeAttribute("data-lp-locked-block");
      }
      paused = Boolean(d.paused);
      if (paused) finish(false);
      if (typeof d.y === "number") scrollTo(0, d.y);
      send({ type: "lp-placed" });
    }
    if (d.type === "lp-busy") busy = numbers(d.blocks);
    if (d.type === "lp-flash") {
      flash = numbers(d.blocks);
      clearTimeout(flashTimer);
      flashTimer = setTimeout(function () { flash = []; paint(); }, 2000);
      var first = flash.length && document.querySelector(blockSel(flash[0]));
      if (first && d.scroll) {
        var r = first.getBoundingClientRect();
        if (r.top < 40 || r.bottom > innerHeight - 90)
          scrollTo({ top: r.top + scrollY - innerHeight * 0.32, behavior: "smooth" });
      }
    }
    if (d.type === "lp-image-select") {
      image = typeof d.number === "number" ? String(d.number) : null;
      var pic = image && document.querySelector(imgSel(image));
      if (pic && d.scroll) {
        var at = pic.getBoundingClientRect();
        if (at.bottom < 40 || at.top > innerHeight - 90)
          scrollTo({ top: at.top + scrollY - innerHeight * 0.25, behavior: "smooth" });
      }
    }
    if (d.type === "lp-section-select") {
      section = typeof d.key === "string" ? d.key : null;
      var el = section && document.querySelector(sel(section));
      if (el && d.scroll) {
        var box = el.getBoundingClientRect();
        if (box.top < 0 || box.top > innerHeight * 0.6)
          scrollTo({ top: box.top + scrollY - 24, behavior: d.instant ? "auto" : "smooth" });
      }
    }
    paint();
  });
  // The template's reading meter (a bar that fills as you scroll) runs on the page's own script,
  // which is off here, so the bridge fills it (owner, 2026-11-05: "the page loader isn't working").
  var meter = document.querySelector(".scroll-meter-pct");
  if (meter) {
    meter.style.transform = "none";
    var fill = function () {
      var max = (document.documentElement.scrollHeight - innerHeight) || 1;
      meter.style.width = Math.max(0, Math.min(1, scrollY / max)) * 100 + "%";
    };
    addEventListener("scroll", fill, { passive: true });
    addEventListener("resize", fill, { passive: true });
    fill();
  }
  paint();
  send({ type: "lp-ready" });
})();`;

/**
 * `versioned`: the address names this exact version of the page (it changes with every edit and
 * every rebuild), so the browser may keep it for an hour: going back to a page, or opening it
 * again, shows the preview without asking the worker. Only this browser keeps it (`private`), and
 * only for the same sign-in (`Vary: Cookie`).
 */
/**
 * Thin, quiet scrollbars in the preview only (owner, 2026-11-04; as the app's, after Shopify's):
 * the page's own scrollbar inside the frame, not the published page. A neutral grey that shows on
 * light and dark pages alike.
 */
const PREVIEW_SCROLLBARS =
  "<style>html::-webkit-scrollbar{width:10px;height:10px}" +
  "html::-webkit-scrollbar-track{background:transparent}" +
  "html::-webkit-scrollbar-thumb{background-color:color-mix(in srgb, gray 40%, transparent);border-radius:9999px;" +
  "border:2px solid transparent;background-clip:content-box}" +
  "html::-webkit-scrollbar-thumb:hover{background-color:color-mix(in srgb, gray 60%, transparent)}" +
  "@supports not selector(::-webkit-scrollbar){html{scrollbar-width:thin;" +
  "scrollbar-color:color-mix(in srgb, gray 40%, transparent) transparent}}</style>";

function withScrollbars(html: string): string {
  const head = html.search(/<\/head>/i);
  return head === -1
    ? PREVIEW_SCROLLBARS + html
    : html.slice(0, head) + PREVIEW_SCROLLBARS + html.slice(head);
}

function page(html: string, nonce: string | null, versioned: boolean) {
  const storage = new URL(publicEnv.supabaseUrl).origin;
  return new Response(withScrollbars(html), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": versioned
        ? "private, max-age=3600"
        : "private, no-store",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": [
        nonce ? "sandbox allow-scripts" : "sandbox",
        "default-src 'none'",
        ...(nonce ? [`script-src 'nonce-${nonce}'`] : []),
        `img-src ${storage} https: data:`,
        "style-src 'unsafe-inline' https:",
        `font-src ${storage} https: data:`,
        "frame-ancestors 'self'",
      ].join("; "),
    },
  });
}

/**
 * GET /preview/[buildId]: the build's working page, for the sandboxed iframe on the build page.
 * Members of the build's org only (RLS on the build row and on the `builds` bucket). The page
 * runs with scripts off and can't reach this app: the CSP sandbox gives it an opaque origin.
 * `?mode=edit` serves the review desk's proof instead: the page with its sentences marked (from
 * the worker) and the desk's bridge script, allowed by a nonce; the page's own scripts stay off.
 * `?mode=write` serves the same proof with the page editor's bridge (typing on the page, B3.1a).
 */
export async function GET(
  request: Request,
  { params }: RouteContext<"/preview/[buildId]">,
) {
  const { buildId } = await params;
  const query = new URL(request.url).searchParams;
  const mode = query.get("mode");
  if (mode === "edit" || mode === "write") {
    const session = await getApiSession();
    if (!session) return new Response("Not found", { status: 404 });
    let html: string;
    try {
      html = await getBuildProof(session.accessToken, session.orgId, buildId);
    } catch (error) {
      if (error instanceof WorkerError) {
        return new Response(error.message, {
          status: error.status === 404 || error.status === 403 ? 404 : 502,
        });
      }
      throw error;
    }
    const nonce = crypto.randomUUID().replaceAll("-", "");
    const bridge = mode === "write" ? WRITE_BRIDGE : DESK_BRIDGE;
    const script = `<script nonce="${nonce}">${bridge}</script>`;
    const marked = addSectionAnchors(html);
    const end = marked.lastIndexOf("</body>");
    return page(
      end === -1
        ? marked + script
        : marked.slice(0, end) + script + marked.slice(end),
      nonce,
      // The page's version (edits) and the build's last update (rebuilds) together.
      query.has("v") && query.has("u"),
    );
  }

  const { currentOrg } = await getSessionContext();
  const build = await getBuild(currentOrg.id, buildId);
  if (!build?.working_html_path) {
    return new Response("Not found", { status: 404 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("builds")
    .download(build.working_html_path);
  if (error || !data) {
    return new Response("Not found", { status: 404 });
  }
  // Section ids for the claims check's section buttons to jump to (preview only).
  return page(addSectionAnchors(await data.text()), null, query.has("v"));
}
