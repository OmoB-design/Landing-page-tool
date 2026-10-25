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
  parent.postMessage({ type: "lp-ready" }, "*");
})();`;

function page(html: string, nonce: string | null) {
  const storage = new URL(publicEnv.supabaseUrl).origin;
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

/**
 * GET /preview/[buildId]: the build's working page, for the sandboxed iframe on the build page.
 * Members of the build's org only (RLS on the build row and on the `builds` bucket). The page
 * runs with scripts off and can't reach this app: the CSP sandbox gives it an opaque origin.
 * `?mode=edit` serves the review desk's proof instead: the page with its sentences marked (from
 * the worker) and the desk's bridge script, allowed by a nonce; the page's own scripts stay off.
 */
export async function GET(
  request: Request,
  { params }: RouteContext<"/preview/[buildId]">,
) {
  const { buildId } = await params;
  if (new URL(request.url).searchParams.get("mode") === "edit") {
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
    const script = `<script nonce="${nonce}">${DESK_BRIDGE}</script>`;
    const marked = addSectionAnchors(html);
    const end = marked.lastIndexOf("</body>");
    return page(
      end === -1
        ? marked + script
        : marked.slice(0, end) + script + marked.slice(end),
      nonce,
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
  return page(addSectionAnchors(await data.text()), null);
}
