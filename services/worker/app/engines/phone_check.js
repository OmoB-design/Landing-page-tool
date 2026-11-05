// The phone check (engines/mobile.py, B3.3b): runs in the page at 390 px. What's wider than the
// screen (outside anything that scrolls or clips sideways), paragraph text under 14 px, buttons
// under 40 px, and text blocks overlapping; each with its words, section and a CSS path.
// One expression (Playwright's page.evaluate).
() => {
  const W = window.innerWidth, doc = document.documentElement;
  const sectionOf = el => { const s = el.closest('[data-lp-section]'); return s ? s.getAttribute('data-lp-section') : null; };
  const words = el => ((el.innerText || el.getAttribute('alt') || el.getAttribute('aria-label') || '') + '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const shown = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'; };
  const name = el => { const cls = [...el.classList].filter(c => /^[a-zA-Z_][\w-]*$/.test(c)).slice(0, 2).map(c => '.' + c).join(''); return el.tagName.toLowerCase() + cls; };
  const path = el => { const parts = []; for (let n = el; n && n !== document.body && parts.length < 4; n = n.parentElement) { if (n.hasAttribute('data-lp-section')) { parts.unshift('[data-lp-section="' + n.getAttribute('data-lp-section') + '"]'); break; } parts.unshift(name(n)); } return parts.join(' > '); };
  const clipped = el => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true; } return false; };
  const all = [...document.body.querySelectorAll('*')].filter(shown);
  const wide = [];
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.right > W + 2 && getComputedStyle(el).position !== 'fixed' && !clipped(el)) {
      const parent = el.parentElement;
      if (parent && parent.getBoundingClientRect().right > W + 2 && !clipped(parent)) continue;  // its box is listed
      wide.push({ tag: el.tagName.toLowerCase(), text: words(el), section: sectionOf(el), path: path(el), over: Math.round(r.right - W) });
    }
  }
  const small = [];
  for (const el of all) {
    let own = ''; for (const n of el.childNodes) if (n.nodeType === 3) own += n.nodeValue;
    own = own.replace(/\s+/g, ' ').trim();
    if (own.length < 30) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < 14) small.push({ tag: el.tagName.toLowerCase(), text: own.slice(0, 60), section: sectionOf(el), path: path(el), size: Math.round(size * 10) / 10 });
  }
  const taps = [];
  for (const el of document.body.querySelectorAll('button, [data-lp-cta], a[class*="btn"], a[class*="button"], input[type="submit"], [role="button"]')) {
    if (!shown(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 40 || r.width < 40) taps.push({ tag: el.tagName.toLowerCase(), text: words(el), section: sectionOf(el), path: path(el), height: Math.round(r.height), width: Math.round(r.width) });
  }
  const blocks = [...document.body.querySelectorAll('h1, h2, h3, h4, p, li, blockquote')].filter(shown).slice(0, 400);
  const rects = blocks.map(b => b.getBoundingClientRect());
  const overlaps = [];
  outer: for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
    if (blocks[i].contains(blocks[j]) || blocks[j].contains(blocks[i])) continue;
    const a = rects[i], b = rects[j];
    const x = Math.min(a.right, b.right) - Math.max(a.left, b.left), y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (x > 4 && y > 4 && x * y > 0.2 * Math.min(a.width * a.height, b.width * b.height)) {
      overlaps.push({ text: words(blocks[i]), section: sectionOf(blocks[i]), path: path(blocks[i]), other: words(blocks[j]) });
      if (overlaps.length >= 20) break outer;
    }
  }
  return { width: W, scroll_width: doc.scrollWidth, wide: wide.slice(0, 40), small: small.slice(0, 40), taps: taps.slice(0, 40), overlaps };
}
