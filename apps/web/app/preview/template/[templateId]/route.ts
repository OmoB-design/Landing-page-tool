import { getSessionContext } from "@/lib/auth/session";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getTemplateFiles } from "@/lib/templates/queries";

/**
 * Runs inside the section editor's preview (B1.1b): outlines the hovered section (dashed) and
 * the selected one (solid), tells the editor which section was clicked, and scrolls to the
 * section the editor selects. Links and forms do nothing here. Talks to the editor only through
 * postMessage; the frame has an opaque origin, so it can't reach the app.
 */
const EDITOR_BRIDGE = `(function () {
  var colour = "Highlight", selected = null, hovered = null;
  var style = document.createElement("style");
  (document.head || document.documentElement).appendChild(style);
  function outer(el) {
    var found = null;
    for (; el && el !== document.documentElement; el = el.parentElement) {
      if (el.nodeType === 1 && el.hasAttribute("data-lp-section")) found = el;
    }
    return found;
  }
  function rule(key) { return '[data-lp-section="' + CSS.escape(key) + '"]'; }
  function paint() {
    var css = "[data-lp-section]{cursor:pointer}";
    if (hovered && hovered !== selected)
      css += rule(hovered) + "{outline:2px dashed " + colour + " !important;outline-offset:-2px !important}";
    if (selected)
      css += rule(selected) + "{outline:2px solid " + colour + " !important;outline-offset:-2px !important}";
    style.textContent = css;
  }
  document.addEventListener("mouseover", function (e) {
    var section = outer(e.target), key = section && section.getAttribute("data-lp-section");
    if (key !== hovered) { hovered = key; paint(); }
  });
  document.documentElement.addEventListener("mouseleave", function () { hovered = null; paint(); });
  document.addEventListener("click", function (e) {
    e.preventDefault();
    var section = outer(e.target);
    if (section) parent.postMessage({ type: "lp-select", key: section.getAttribute("data-lp-section") }, "*");
  }, true);
  document.addEventListener("submit", function (e) { e.preventDefault(); }, true);
  window.addEventListener("message", function (e) {
    if (e.source !== parent || !e.data || e.data.type !== "lp-select") return;
    if (typeof e.data.colour === "string" && /^[#\\w(),.%\\s-]+$/.test(e.data.colour)) colour = e.data.colour;
    selected = typeof e.data.key === "string" ? e.data.key : null;
    paint();
    var el = selected && document.querySelector(rule(selected));
    if (el && e.data.scroll) {
      // A fifth of the way down, clear of fixed bars at the top of the page.
      var box = el.getBoundingClientRect();
      if (box.top < innerHeight * 0.1 || box.top > innerHeight * 0.75)
        window.scrollTo({ top: box.top + scrollY - innerHeight * 0.2, behavior: e.data.instant ? "auto" : "smooth" });
    }
  });
  parent.postMessage({ type: "lp-ready" }, "*");
})();`;

/** GET /preview/template/[templateId]: a library or org template's page, sandboxed like build
 * previews (scripts off, opaque origin). `?editor=1` adds the section editor's bridge script,
 * allowed by a nonce; the template's own scripts stay blocked. */
export async function GET(
  request: Request,
  { params }: RouteContext<"/preview/template/[templateId]">,
) {
  const { templateId } = await params;
  const { currentOrg } = await getSessionContext();
  const files = await getTemplateFiles(currentOrg.id, templateId);
  if (!files) return new Response("Not found", { status: 404 });
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(files.html.bucket)
    .download(files.html.path);
  if (error || !data) return new Response("Not found", { status: 404 });
  const storage = new URL(publicEnv.supabaseUrl).origin;
  const editor = new URL(request.url).searchParams.get("editor") === "1";
  const nonce = editor ? crypto.randomUUID().replaceAll("-", "") : null;
  let html = await data.text();
  if (nonce) {
    const script = `<script nonce="${nonce}">${EDITOR_BRIDGE}</script>`;
    const end = html.lastIndexOf("</body>");
    html =
      end === -1
        ? html + script
        : html.slice(0, end) + script + html.slice(end);
  }
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
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
