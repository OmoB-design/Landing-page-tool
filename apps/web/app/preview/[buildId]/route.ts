import { getBuildProof, WorkerError } from "@/lib/api/worker";
import { getApiSession } from "@/lib/auth/api-session";
import { getSessionContext } from "@/lib/auth/session";
import { addSectionAnchors } from "@/lib/builds/preview-anchors";
import { getBuild } from "@/lib/builds/queries";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * A white highlight where the page is dark (owner, 2026-11-09: on a black page "the highlight
 * colour blends with the dark page"): text selected over a dark background shows white with dark
 * letters, also while the formatting bar has the focus. Elsewhere the browser's own highlight
 * stays. Dark: the selected text is lighter than the first solid background behind it, or near
 * white (over a photo). Part of both bridges below.
 */
const SELECTION_SHADE = `
  var shade = document.createElement("style"), shadeFor = null, shadeDark = false;
  (document.head || document.documentElement).appendChild(shade);
  function lum(c) {
    var m = /rgba?\\(([^)]*)\\)/.exec(c || "");
    if (!m) return null;
    var p = m[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number);
    if (p.length < 3 || (p.length > 3 && p[3] < 0.5)) return null;
    var l = p.slice(0, 3).map(function (v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
  }
  function shadeSelection() {
    var s = getSelection(), n = s && s.rangeCount && !s.isCollapsed ? s.anchorNode : null;
    var el = n && n.nodeType === 3 ? n.parentElement : n;
    if (!el || el.nodeType !== 1 || el === shadeFor) return;
    shadeFor = el;
    var text = lum(getComputedStyle(el).color), back = 1;
    for (var at = el; at && at.nodeType === 1; at = at.parentElement) {
      var b = lum(getComputedStyle(at).backgroundColor);
      if (b !== null) { back = b; break; }
    }
    var dark = text !== null && (text > back || text > 0.7);
    if (dark === shadeDark) return;
    shadeDark = dark;
    shade.textContent = dark ? "::selection{background-color:white !important;color:black !important}" : "";
  }
  document.addEventListener("selectionchange", shadeSelection);
`;

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
  (document.head || document.documentElement).appendChild(style);${SELECTION_SHADE}
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
 * (`lp-image-select`). The brand's logo says where to change it instead (`lp-logo`). An image whose
 * AI picture is being made breathes (`lp-image-busy`, B3.2b).
 * B4.4 (D123, Shopify's theme editor): the first click on a line picks it (`lp-part`: its outline
 * and a tab with its name at the outline's top left, with the Ask Buddy pill under it, `lp-ask`);
 * a second click, or a double click, types in it. What the pointer is over goes up (`lp-hover`) so
 * the section tree lights its row, and the tree's pointer comes down (`lp-hover-part`) to outline
 * the part with its name (`lp-names`). Words typed in a part's panel show at once (`lp-text`).
 * Both bridges fill the template's reading meter as the page scrolls (its own script is off).
 * Talks to the editor only through postMessage; the frame has an opaque origin.
 */
const WRITE_BRIDGE = `(function () {
  var colour = "Highlight", locked = {}, paused = false, busy = [], flash = [], flashTimer = 0;
  var section = null, hoverSection = null, hoverBlock = null, editing = null, saved = "";
  var image = null, hoverImage = null, imageBusy = null;
  // The section tree (B4.4): the picked line, the names the outline tabs show, what the tree's
  // pointer is over, and the tabs and the Ask Buddy pill drawn over the page.
  var pick = null, names = { blocks: {}, images: {}, sections: {} };
  var outer = { key: null, block: null, image: null }, lastHover = "";
  var tabPick = null, tabHover = null, pill = null;
  var style = document.createElement("style");
  (document.head || document.documentElement).appendChild(style);${SELECTION_SHADE}
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
  // Text formatting (B3.1g, D118): a selection, in one line or across several, goes up as the
  // lines it touches and where it starts and ends in each line's text as read (whitespace
  // collapsed, as textOf), with where it is on the page and the formatting it has now.
  var dragging = false, selTimer = 0, lastSel = "";
  function own(n, block) { return closest(n.parentElement, "data-lp-block") === block; }
  function upTo(block, node, offset) {
    var r = document.createRange();
    try { r.setStart(block, 0); r.setEnd(node, offset); } catch (err) { return 0; }
    var walk = document.createTreeWalker(block, NodeFilter.SHOW_TEXT), count = 0, started = false, space = false, n;
    while ((n = walk.nextNode())) {
      if (!own(n, block) || !r.intersectsNode(n)) continue;
      var s = n.nodeValue, end = n === node ? offset : s.length;
      for (var i = 0; i < end; i++) {
        if (/\\s/.test(s[i])) { if (started && !space) count++; space = true; }
        else { count++; started = true; space = false; }
      }
      if (n === node) break;
    }
    return count;
  }
  // The DOM point before character "index" of the block's text as read, or ("after") the point
  // just after character index - 1, so a selection's end stays inside the last character it covers.
  function pointAt(block, index, after) {
    var walk = document.createTreeWalker(block, NodeFilter.SHOW_TEXT), count = 0, started = false, space = false, n, last = null;
    if (after && index > 0) index -= 1;
    while ((n = walk.nextNode())) {
      if (!own(n, block)) continue;
      last = n;
      var s = n.nodeValue;
      for (var i = 0; i < s.length; i++) {
        var white = /\\s/.test(s[i]);
        if (count >= index && !(white && (!started || space))) return { node: n, offset: after ? i + 1 : i };
        if (white) { if (started && !space) count++; space = true; }
        else { count++; started = true; space = false; }
      }
    }
    return last ? { node: last, offset: last.nodeValue.length } : { node: block, offset: 0 };
  }
  function hex(value) {
    var c = rgbOf(value);
    if (!c || c.a === 0) return null;
    return "#" + [c.r, c.g, c.b].map(function (v) { return ("0" + Math.round(v).toString(16)).slice(-2); }).join("");
  }
  function decorated(el, block, line) {
    for (var a = el; a; a = a.parentElement) {
      if ((getComputedStyle(a).textDecorationLine || "").indexOf(line) >= 0) return true;
      if (a === block) break;
    }
    return false;
  }
  function formatsOf(range, blocks) {
    var on = { bold: true, italic: true, underline: true, strike: true }, first = null, seen = 0;
    for (var b = 0; b < blocks.length && seen < 200; b++) {
      var walk = document.createTreeWalker(blocks[b], NodeFilter.SHOW_TEXT), n;
      while ((n = walk.nextNode()) && seen < 200) {
        if (!own(n, blocks[b]) || !range.intersectsNode(n) || !/\\S/.test(n.nodeValue)) continue;
        // A node the selection only touches (it ends at the node's start, or starts at its end).
        if ((n === range.endContainer && range.endOffset === 0) ||
            (n === range.startContainer && range.startOffset >= n.nodeValue.length)) continue;
        var el = n.parentElement, cs = getComputedStyle(el);
        seen++;
        if (!first) first = { el: el, block: blocks[b] };
        if ((parseInt(cs.fontWeight, 10) || 400) < 600) on.bold = false;
        if (cs.fontStyle !== "italic") on.italic = false;
        if (!decorated(el, blocks[b], "underline")) on.underline = false;
        if (!decorated(el, blocks[b], "line-through")) on.strike = false;
      }
    }
    if (!first) return { bold: false, italic: false, underline: false, strike: false, link: null, color: null, highlight: null, size: null };
    var link = closest(first.el, "href"), mark = closest(first.el, "data-lp-fmt"), highlight = null;
    for (var m = first.el; m && m !== first.block; m = m.parentElement)
      if (m.hasAttribute("data-lp-fmt") && m.style.backgroundColor) { highlight = hex(m.style.backgroundColor); break; }
    var style = getComputedStyle(first.el);
    return {
      bold: on.bold, italic: on.italic, underline: on.underline, strike: on.strike,
      link: link && link.tagName === "A" ? link.getAttribute("href") : null,
      color: hex(style.color), highlight: mark ? highlight : null,
      size: Math.round(parseFloat(style.fontSize) || 0) || null
    };
  }
  function rangesOf(range) {
    var all = document.querySelectorAll("[data-lp-block]"), blocks = [], ranges = [];
    for (var i = 0; i < all.length; i++) if (range.intersectsNode(all[i])) blocks.push(all[i]);
    for (var j = 0; j < blocks.length; j++) {
      var b = blocks[j], length = textOf(b).length;
      var start = b.contains(range.startContainer) ? upTo(b, range.startContainer, range.startOffset) : 0;
      var end = b.contains(range.endContainer) ? upTo(b, range.endContainer, range.endOffset) : length;
      start = Math.min(start, length); end = Math.min(end, length);
      if (end > start) ranges.push({ block: number(b), start: start, end: end });
    }
    return { blocks: blocks, ranges: ranges };
  }
  function chosen() {
    var s = getSelection();
    return s && s.rangeCount && !s.isCollapsed ? rangesOf(s.getRangeAt(0)).ranges : [];
  }
  function report() {
    var s = getSelection();
    var none = function () { if (lastSel) { lastSel = ""; send({ type: "lp-selection", ranges: [] }); } };
    if (!s || !s.rangeCount || s.isCollapsed) return none();
    var range = s.getRangeAt(0), found = rangesOf(range), blocks = found.blocks, ranges = found.ranges;
    if (!ranges.length) return none();
    var box = range.getBoundingClientRect();
    var id = JSON.stringify(ranges) + "@" + Math.round(box.top) + "," + Math.round(box.left);
    if (id === lastSel) return;
    lastSel = id;
    send({ type: "lp-selection", ranges: ranges, rect: { x: box.left, y: box.top, w: box.width, h: box.height }, formats: formatsOf(range, blocks) });
  }
  function selectRanges(list) {
    if (!Array.isArray(list) || !list.length) return;
    var first = list[0], last = list[list.length - 1];
    var a = document.querySelector(blockSel(first.block)), z = document.querySelector(blockSel(last.block));
    if (!a || !z) return;
    var from = pointAt(a, first.start, false), to = pointAt(z, last.end, true), r = document.createRange();
    try { r.setStart(from.node, from.offset); r.setEnd(to.node, to.offset); } catch (err) { return; }
    var s = getSelection(); s.removeAllRanges(); s.addRange(r);
    lastSel = ""; report();
  }
  // Formatting shows at once (owner, 2026-11-06: "like Figma"): the editor sends the change
  // ("lp-paint") and the selected characters take its look straight away while it's saved; the
  // lines as saved follow ("lp-lines") and take their place, the selection kept. A refused change
  // puts the lines back as they were.
  var before = {};
  function look(f) {
    var css = "", lines = [];
    if (f.bold === true) css += "font-weight:700;"; else if (f.bold === false) css += "font-weight:400;";
    if (f.italic === true) css += "font-style:italic;"; else if (f.italic === false) css += "font-style:normal;";
    if (f.underline === true) lines.push("underline");
    if (f.strike === true) lines.push("line-through");
    if (lines.length) css += "text-decoration-line:" + lines.join(" ") + ";";
    if (typeof f.color === "string" && f.color) css += "color:" + f.color + ";";
    if (typeof f.highlight === "string" && f.highlight) css += "background-color:" + f.highlight + ";";
    if (typeof f.size === "number" && f.size > 0) css += "font-size:" + f.size + "px;";
    return css.indexOf(";") >= 0 && css.indexOf("<") < 0 ? css : "";
  }
  function paintRange(r, css) {
    var block = document.querySelector(blockSel(r.block));
    if (!block || typeof r.start !== "number" || typeof r.end !== "number" || r.end <= r.start) return;
    if (!(r.block in before)) before[r.block] = block.innerHTML;
    var a = pointAt(block, r.start, false), z = pointAt(block, r.end, true);
    var first = a.node, last = z.node;
    if (first.nodeType !== 3 || last.nodeType !== 3) return;
    if (z.offset < last.nodeValue.length) last.splitText(z.offset);
    if (a.offset > 0) {
      var rest = first.splitText(a.offset);
      if (last === first) last = rest;
      first = rest;
    }
    var walk = document.createTreeWalker(block, NodeFilter.SHOW_TEXT), n, on = false, list = [];
    while ((n = walk.nextNode())) {
      if (n === first) on = true;
      if (on && own(n, block) && n.nodeValue.length) list.push(n);
      if (n === last) break;
    }
    list.forEach(function (node) {
      var span = document.createElement("span");
      span.setAttribute("data-lp-paint", "");
      span.setAttribute("style", css);
      node.parentNode.insertBefore(span, node);
      span.appendChild(node);
    });
  }
  function swapLines(lines, revert) {
    var keep = chosen();
    lines.forEach(function (l) {
      var el = l && typeof l.block === "number" && typeof l.html === "string" && document.querySelector(blockSel(l.block));
      if (!el || el === editing) return;
      el.innerHTML = l.html;
      delete before[l.block];
    });
    if (revert) Object.keys(before).forEach(function (n) {
      var el = document.querySelector(blockSel(n));
      if (el && el !== editing) el.innerHTML = before[n];
    });
    before = {};
    if (keep.length) selectRanges(keep);
  }
  document.addEventListener("mousedown", function () { dragging = true; }, true);
  document.addEventListener("mouseup", function () { dragging = false; setTimeout(report, 0); }, true);
  document.addEventListener("selectionchange", function () {
    if (dragging) return;
    clearTimeout(selTimer);
    selTimer = setTimeout(report, 120);
  });
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
    if (section && !pick && !image)
      css += sel(section) + "{outline:2px solid " + colour + " !important;outline-offset:-2px !important}";
    if (pick && !editing)
      css += '[data-lp-block="' + pick + '"]{outline:2px solid ' + colour + " !important;outline-offset:3px !important;border-radius:2px}";
    if (outer.block && outer.block !== pick)
      css += '[data-lp-block="' + outer.block + '"]{outline:1.5px dashed ' + colour + " !important;outline-offset:3px !important;border-radius:2px}";
    if (outer.image && outer.image !== image)
      css += imgSel(outer.image) + "{outline:1.5px dashed " + colour + " !important;outline-offset:-2px !important}";
    if (outer.key && !outer.block && !outer.image && outer.key !== section)
      css += sel(outer.key) + "{outline:1.5px dashed " + colour + " !important;outline-offset:-2px !important}";
    if (hoverBlock && !editing)
      css += '[data-lp-block="' + hoverBlock + '"]:not([data-lp-locked-block]){outline:1.5px dashed ' + colour + " !important;outline-offset:3px !important;border-radius:2px}";
    if (hoverImage && hoverImage !== image)
      css += imgSel(hoverImage) + ":not([data-lp-logo]){outline:1.5px dashed " + colour + " !important;outline-offset:-2px !important}";
    if (image)
      css += imgSel(image) + "{outline:2px solid " + colour + " !important;outline-offset:-2px !important}";
    if (imageBusy)
      css += imgSel(imageBusy) + "{animation:lp-img-busy 1.6s ease-in-out infinite}" +
        "@keyframes lp-img-busy{0%,100%{opacity:1}50%{opacity:.45}}" +
        "@media (prefers-reduced-motion:reduce){" + imgSel(imageBusy) + "{animation:none;opacity:.6}}";
    if (busy.length)
      css += busy.map(blockSel).join(",") + "{animation:lp-busy 1.6s ease-in-out infinite}" +
        "@keyframes lp-busy{0%,100%{opacity:1}50%{opacity:.42}}" +
        "@media (prefers-reduced-motion:reduce){" + busy.map(blockSel).join(",") + "{animation:none;opacity:.6}}";
    if (flash.length)
      css += flash.map(blockSel).join(",") + "{animation:lp-flash 1.9s cubic-bezier(.2,.8,0,1) 1;border-radius:3px}" +
        "@keyframes lp-flash{0%{background-color:color-mix(in srgb," + colour + " 22%,transparent);box-shadow:0 0 0 4px color-mix(in srgb," + colour + " 22%,transparent)}100%{background-color:transparent;box-shadow:0 0 0 4px transparent}}";
    style.textContent = css;
    placeUi();
  }
  // Outline tabs (Shopify's): the picked part's name (or its section's) at the outline's top left,
  // and the hovered one's, on the page or from the tree; the Ask Buddy pill under the picked part.
  var UI_FONT = "500 11px/16px -apple-system,BlinkMacSystemFont,'Inter','Segoe UI',system-ui,sans-serif";
  function chip() {
    var el = document.createElement("div");
    el.setAttribute("data-lp-ui", "tab");
    el.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;display:none;color:white;" +
      "padding:2px 6px;white-space:nowrap;max-width:260px;overflow:hidden;text-overflow:ellipsis;" +
      "letter-spacing:0;text-transform:none;font:" + UI_FONT;
    document.documentElement.appendChild(el);
    return el;
  }
  function makePill() {
    var b = document.createElement("button");
    b.type = "button";
    b.setAttribute("data-lp-ui", "ask");
    b.textContent = "Ask Buddy";
    b.style.cssText = "position:fixed;z-index:2147483647;display:none;align-items:center;height:28px;" +
      "padding:0 12px;border-radius:999px;border:0;background:white;color:black;cursor:pointer;" +
      "letter-spacing:0;text-transform:none;font:500 12px/16px -apple-system,BlinkMacSystemFont,'Inter','Segoe UI',system-ui,sans-serif;" +
      "box-shadow:0 0 0 0.5px color-mix(in srgb,black 14%,transparent),0 2px 6px color-mix(in srgb,black 12%,transparent)," +
      "0 10px 24px -8px color-mix(in srgb,black 22%,transparent)";
    b.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation(); send({ type: "lp-ask" });
    });
    document.documentElement.appendChild(b);
    return b;
  }
  function labelOf(t) {
    if (t.block) return names.blocks[t.block] || "Text";
    if (t.image) return names.images[t.image] || "Picture";
    return names.sections[t.key] || "Section";
  }
  function elOf(t) {
    if (t.block) return document.querySelector(blockSel(t.block));
    if (t.image) return document.querySelector(imgSel(t.image));
    return t.key ? document.querySelector(sel(t.key)) : null;
  }
  function putTab(tab, t) {
    var el = t && elOf(t);
    var r = el && el.getBoundingClientRect();
    if (!r || r.width === 0 || r.bottom < 0 || r.top > innerHeight) { tab.style.display = "none"; return null; }
    var off = t.block ? 5 : 0;
    tab.textContent = labelOf(t);
    tab.style.background = colour;
    tab.style.display = "block";
    var top = r.top - off - 20;
    if (top < 0) { top = Math.max(0, r.top - off + 2); tab.style.borderRadius = "0 0 4px 0"; }
    else tab.style.borderRadius = "4px 4px 0 0";
    tab.style.top = top + "px";
    tab.style.left = Math.max(0, r.left - off) + "px";
    return r;
  }
  function same(a, b) { return a && b && a.block === b.block && a.image === b.image && (a.block || a.image || a.key === b.key); }
  function placeUi() {
    if (!tabPick) { tabPick = chip(); tabHover = chip(); pill = makePill(); }
    var picked = editing ? null : pick ? { block: pick } : image ? { image: image } : section ? { key: section } : null;
    var over = editing ? null : hoverBlock ? { block: hoverBlock } : hoverImage ? { image: hoverImage }
      : outer.block ? { block: outer.block } : outer.image ? { image: outer.image }
      : outer.key ? { key: outer.key } : hoverSection ? { key: hoverSection } : null;
    if (same(over, picked)) over = null;
    var r = putTab(tabPick, picked);
    putTab(tabHover, over);
    if (r && picked && (picked.block || picked.image)) {
      pill.style.display = "flex";
      var pw = pill.offsetWidth || 92, ph = pill.offsetHeight || 28;
      var top = r.bottom + 10;
      if (top + ph > innerHeight - 6) top = Math.max(6, r.top - ph - 28);
      pill.style.top = top + "px";
      pill.style.left = Math.min(innerWidth - pw - 10, Math.max(10, r.right - pw)) + "px";
    } else pill.style.display = "none";
  }
  var uiFrame = 0;
  function placeSoon() { if (uiFrame) return; uiFrame = requestAnimationFrame(function () { uiFrame = 0; if (tabPick) placeUi(); }); }
  addEventListener("scroll", placeSoon, { passive: true });
  addEventListener("resize", placeSoon, { passive: true });
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
    var hv = (n || "") + "|" + (m || "") + "|" + (s || "");
    if (hv !== lastHover) {
      lastHover = hv;
      send({ type: "lp-hover", block: n ? Number(n) : null, image: m ? Number(m) : null, key: s });
    }
  });
  document.documentElement.addEventListener("mouseleave", function () {
    hoverBlock = null; hoverSection = null; hoverImage = null; paint();
    if (lastHover) { lastHover = ""; send({ type: "lp-hover", block: null, image: null, key: null }); }
  });
  document.addEventListener("click", function (e) {
    if (e.target && e.target.closest && e.target.closest("[data-lp-ui]")) return;
    var b = closest(e.target, "data-lp-block");
    if (editing && b === editing) return;
    e.preventDefault();
    var picked = getSelection();
    if (picked && !picked.isCollapsed && picked.toString().trim()) { report(); return; }
    var s = key(topSection(e.target));
    if (s && s !== section) { section = s; send({ type: "lp-section", key: s }); }
    var p = picture(e);
    if (p) {
      finish(false);
      pick = null;
      if (p.hasAttribute("data-lp-logo")) { send({ type: "lp-logo" }); paint(); return; }
      image = p.getAttribute("data-lp-img");
      send({ type: "lp-image", number: Number(image) });
      paint();
      return;
    }
    if (image) { image = null; send({ type: "lp-image", number: null }); }
    if (!b) {
      // A click on empty space clears the pick here and in the editor's tree (B5.1).
      if (pick) send({ type: "lp-part", block: null });
      pick = null; finish(false); paint(); return;
    }
    // The first click picks the line (Shopify's: its outline, its name and its panel); a second
    // click, or a double click, types in it on the page.
    var n = String(number(b));
    if (pick !== n && !(e.detail > 1)) {
      finish(false);
      pick = n;
      send({ type: "lp-part", block: number(b) });
      paint();
      return;
    }
    pick = n;
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
    var chosen = getSelection();
    if (mod && chosen && !chosen.isCollapsed) {
      var f = k === "b" ? "bold" : k === "i" ? "italic" : k === "u" ? "underline"
        : e.shiftKey && (k === ">" || k === ".") ? "grow"
        : e.shiftKey && (k === "<" || k === ",") ? "shrink" : null;
      if (f) { e.preventDefault(); report(); send({ type: "lp-format-key", key: f }); return; }
    }
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
  // The colour behind "Work with Buddy" (owner, 2026-11-06): the editor says where the bar sits
  // ("lp-probe", in this page's px); this reads the first solid background under that spot
  // (photos and drawings skipped, then the page's own) and says whether it's dark ("lp-tone"),
  // again whenever the page scrolls, so the bar can take the other look.
  var probe = null, tone = null;
  function rgbOf(value) {
    if (!value || value.indexOf("(") < 0) return null;
    var parts = value.slice(value.indexOf("(") + 1, value.indexOf(")")).split(",");
    if (parts.length < 3) return null;
    var c = parts.map(function (v) { return parseFloat(v); });
    var a = parts.length > 3 ? c[3] : 1;
    return isNaN(c[0]) || isNaN(c[1]) || isNaN(c[2]) ? null : { r: c[0], g: c[1], b: c[2], a: a };
  }
  function lin(v) { v = v / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function readTone(force) {
    if (!probe) return;
    var x = Math.max(0, Math.min(innerWidth - 1, probe.x));
    var y = Math.max(0, Math.min(innerHeight - 1, probe.y));
    var under = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [];
    var found = null;
    for (var i = 0; i < under.length && !found; i++) {
      var el = under[i];
      if (/^(IMG|VIDEO|SVG|CANVAS|PICTURE)$/i.test(el.tagName)) continue;
      var c = rgbOf(getComputedStyle(el).backgroundColor);
      if (c && c.a > 0.5) found = c;
    }
    found = found || rgbOf(getComputedStyle(document.body).backgroundColor);
    if (!found || found.a <= 0.5) found = rgbOf(getComputedStyle(document.documentElement).backgroundColor);
    if (!found || found.a <= 0.5) found = { r: 255, g: 255, b: 255, a: 1 };
    var dark = 0.2126 * lin(found.r) + 0.7152 * lin(found.g) + 0.0722 * lin(found.b) < 0.2;
    if (force || dark !== tone) { tone = dark; send({ type: "lp-tone", dark: dark }); }
  }
  addEventListener("resize", function () { readTone(false); });
  // Buddy watches the pointer even over the page (owner, 2026-11-06): its moves go up, once a frame.
  var pointerAt = null;
  addEventListener("pointermove", function (e) {
    var waiting = pointerAt !== null;
    pointerAt = { x: e.clientX, y: e.clientY };
    if (waiting) return;
    requestAnimationFrame(function () {
      if (pointerAt) send({ type: "lp-pointer", x: pointerAt.x, y: pointerAt.y });
      pointerAt = null;
    });
  }, { passive: true });
  addEventListener("load", function () { readTone(false); });
  // Your place (owner, 2026-11-06: the page moved after a change): the first line showing at the
  // top of the window and how far it is from the top. A page loaded again scrolls that line back
  // to the same spot, and keeps it there as its pictures load and push things down, until you
  // scroll yourself or a few seconds pass.
  function pinned(el) {
    for (var a = el; a && a !== document.body; a = a.parentElement) {
      var pos = getComputedStyle(a).position;
      if (pos === "fixed" || pos === "sticky") return true;
    }
    return false;
  }
  function spot() {
    var all = document.querySelectorAll("[data-lp-block]");
    for (var i = 0; i < all.length; i++) {
      var r = all[i].getBoundingClientRect();
      if (r.bottom <= 0 || r.height <= 0 || r.top > innerHeight) continue;
      if (pinned(all[i])) continue;
      return { block: number(all[i]), top: r.top, text: textOf(all[i]).slice(0, 60) };
    }
    return null;
  }
  var place = null, placeTimer = 0;
  function placeAt() {
    if (!place) return;
    var at = place.spot, el = null;
    if (at && typeof at.block === "number") {
      el = document.querySelector(blockSel(at.block));
      if (el && typeof at.text === "string" && textOf(el).slice(0, 60) !== at.text) {
        el = null;
        var all = document.querySelectorAll("[data-lp-block]");
        for (var i = 0; i < all.length && !el; i++) if (textOf(all[i]).slice(0, 60) === at.text) el = all[i];
      }
    }
    if (el && typeof at.top === "number") scrollTo(0, scrollY + el.getBoundingClientRect().top - at.top);
    else if (typeof place.y === "number") scrollTo(0, place.y);
  }
  function stopPlacing() { place = null; clearTimeout(placeTimer); }
  ["wheel", "touchmove", "keydown", "mousedown"].forEach(function (name) {
    addEventListener(name, stopPlacing, { passive: true, capture: true });
  });
  if (window.ResizeObserver) {
    var settling = new ResizeObserver(placeAt);
    settling.observe(document.documentElement);
    if (document.body) settling.observe(document.body);
  }
  addEventListener("load", placeAt);
  var ticking = false;
  addEventListener("scroll", function () {
    if (ticking) return;
    ticking = true;
    setTimeout(function () { ticking = false; send({ type: "lp-scroll", y: scrollY, spot: spot() }); readTone(false); lastSel = ""; report(); }, 150);
  });
  addEventListener("message", function (e) {
    var d = e.data;
    if (e.source !== parent || !d || typeof d.type !== "string") return;
    if (typeof d.colour === "string" && /^[#\\w(),.%\\s-]+$/.test(d.colour)) colour = d.colour;
    if (d.type === "lp-probe" && typeof d.x === "number" && typeof d.y === "number") {
      probe = { x: d.x, y: d.y };
      readTone(true);
      return;
    }
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
      if (typeof d.y === "number" || d.spot) {
        place = { y: d.y, spot: d.spot };
        placeAt();
        clearTimeout(placeTimer);
        placeTimer = setTimeout(stopPlacing, 4000);
      }
      send({ type: "lp-placed" });
    }
    if (d.type === "lp-paint" && Array.isArray(d.ranges) && d.format) {
      var css = look(d.format);
      if (css) d.ranges.forEach(function (r) { if (r && typeof r.block === "number") paintRange(r, css); });
      selectRanges(d.ranges);
      return;
    }
    if (d.type === "lp-lines" && Array.isArray(d.lines)) { swapLines(d.lines, Boolean(d.revert)); return; }
    if (d.type === "lp-busy") busy = numbers(d.blocks);
    if (d.type === "lp-flash") {
      flash = numbers(d.blocks);
      clearTimeout(flashTimer);
      flashTimer = setTimeout(function () { flash = []; paint(); }, 2000);
      var first = flash.length && document.querySelector(blockSel(flash[0]));
      if (first && d.scroll) {
        stopPlacing();
        var r = first.getBoundingClientRect();
        if (r.top < 40 || r.bottom > innerHeight - 90)
          scrollTo({ top: r.top + scrollY - innerHeight * 0.32, behavior: "smooth" });
      }
    }
    if (d.type === "lp-image-busy") imageBusy = typeof d.number === "number" ? String(d.number) : null;
    if (d.type === "lp-names") names = { blocks: d.blocks || {}, images: d.images || {}, sections: d.sections || {} };
    if (d.type === "lp-hover-part") outer = {
      key: typeof d.key === "string" ? d.key : null,
      block: typeof d.block === "number" ? String(d.block) : null,
      image: typeof d.image === "number" ? String(d.image) : null,
    };
    if (d.type === "lp-part-select") {
      pick = typeof d.block === "number" ? String(d.block) : null;
      var line = pick && document.querySelector(blockSel(pick));
      if (line && d.scroll) {
        stopPlacing();
        var lr = line.getBoundingClientRect();
        if (lr.top < 40 || lr.bottom > innerHeight - 90)
          scrollTo({ top: lr.top + scrollY - innerHeight * 0.3, behavior: "smooth" });
      }
    }
    if (d.type === "lp-text" && typeof d.block === "number" && typeof d.text === "string") {
      var typed = document.querySelector(blockSel(d.block));
      if (typed && typed !== editing) typed.textContent = d.text;
    }
    if (d.type === "lp-image-select") {
      image = typeof d.number === "number" ? String(d.number) : null;
      var pic = image && document.querySelector(imgSel(image));
      if (pic && d.scroll) {
        stopPlacing();
        var at = pic.getBoundingClientRect();
        if (at.bottom < 40 || at.top > innerHeight - 90)
          scrollTo({ top: at.top + scrollY - innerHeight * 0.25, behavior: "smooth" });
      }
    }
    if (d.type === "lp-section-select") {
      section = typeof d.key === "string" ? d.key : null;
      var el = section && document.querySelector(sel(section));
      if (el && d.scroll) {
        stopPlacing();
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
