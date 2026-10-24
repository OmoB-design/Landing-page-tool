# Studying the Figma frames

Load the `figma-use` skill before the first `use_figma` call (the Figma MCP requires it); pass
`skillNames: "resource:figma-use"`. Everything here is read-only.

## 1. Find the section and its frames

```js
// use_figma: the section that holds a node, and its children
const node = await figma.getNodeByIdAsync("397:37692");
let section = node; while (section && section.type !== "SECTION") section = section.parent;
return section.children.map(c => `${c.type} ${c.id} "${c.name}" ${Math.round(c.width)}x${Math.round(c.height)} mode=${JSON.stringify(c.explicitVariableModes || {})}`).join("\n");
```

The mode map tells light from dark (`VariableCollectionId:7:2` → `7:0` Light, `7:1` Dark in this
file). Two frames can share a name and differ only in mode.

Screenshot each frame with `get_screenshot` (`maxDimension: 2048`), download with `curl -sL -o`,
and crop with PIL to compare regions (`scripts/compare_crops.py`).

## 2. Dump the styles of visible nodes

Paste this into `use_figma`, setting the ids and depths at the bottom. It skips hidden nodes, names
bound variables, effect and text styles, per-side stroke weights and dashes.

```js
const vcache = {};
async function vname(id) { if (!id) return null; if (!(id in vcache)) { const v = await figma.variables.getVariableByIdAsync(id); vcache[id] = v ? v.name : id; } return vcache[id]; }
const hex = (c) => "#" + [c.r, c.g, c.b].map(x => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
const r = (v) => Math.round(v * 100) / 100;
async function paints(ps) { if (!ps || ps === figma.mixed) return ""; const out = []; for (const p of ps) { if (p.visible === false) continue;
  if (p.type === "SOLID") out.push(`${hex(p.color)}${p.opacity !== 1 ? "@" + r(p.opacity) : ""}${p.boundVariables && p.boundVariables.color ? "{" + await vname(p.boundVariables.color.id) + "}" : ""}`); else out.push(p.type); } return out.join(","); }
async function dump(n, d, lines, maxD) {
  if (n.visible === false) return;
  let s = `${"  ".repeat(d)}${n.type} ${n.id} "${n.name}" ${r(n.x)},${r(n.y)} ${r(n.width)}x${r(n.height)}`;
  if (n.type === "INSTANCE" && n.mainComponent) s += ` <${n.mainComponent.parent?.type === "COMPONENT_SET" ? n.mainComponent.parent.name + ":" : ""}${n.mainComponent.name}>`;
  if ("layoutMode" in n && n.layoutMode !== "NONE") s += ` [${n.layoutMode} gap${r(n.itemSpacing)} p${r(n.paddingTop)},${r(n.paddingRight)},${r(n.paddingBottom)},${r(n.paddingLeft)} ${n.primaryAxisAlignItems}/${n.counterAxisAlignItems}]`;
  if ("layoutSizingHorizontal" in n) s += ` (${n.layoutSizingHorizontal}/${n.layoutSizingVertical})`;
  const f = "fills" in n ? await paints(n.fills) : ""; if (f) s += ` fill:${f}`;
  const st = "strokes" in n ? await paints(n.strokes) : "";
  if (st) s += ` stroke:${st} w${n.strokeWeight === figma.mixed ? `${r(n.strokeTopWeight)}/${r(n.strokeRightWeight)}/${r(n.strokeBottomWeight)}/${r(n.strokeLeftWeight)}` : r(n.strokeWeight)} ${n.strokeAlign}${n.dashPattern?.length ? " dash" + n.dashPattern.join("/") : ""}`;
  if ("cornerRadius" in n) { if (n.cornerRadius === figma.mixed) s += ` rad${r(n.topLeftRadius)}/${r(n.topRightRadius)}/${r(n.bottomRightRadius)}/${r(n.bottomLeftRadius)}`; else if (n.cornerRadius) s += ` rad${r(n.cornerRadius)}`; }
  if ("effects" in n && n.effects.length) { const es = []; for (const e of n.effects) { if (e.visible === false) continue;
    if (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW") es.push(`${e.type === "INNER_SHADOW" ? "inset " : ""}${r(e.offset.x)} ${r(e.offset.y)} ${r(e.radius)} ${r(e.spread || 0)} ${hex(e.color)}@${r(e.color.a)}${e.boundVariables?.color ? "{" + await vname(e.boundVariables.color.id) + "}" : ""}`); else es.push(e.type); }
    if (es.length) s += ` fx:[${es.join(" | ")}]`; if (n.effectStyleId) { const es2 = await figma.getStyleByIdAsync(n.effectStyleId); s += ` fxStyle:${es2 && es2.name}`; } }
  if ("opacity" in n && n.opacity !== 1) s += ` op${r(n.opacity)}`;
  if ("rotation" in n && Math.abs(n.rotation) > 0.01) s += ` rot${r(n.rotation)}`;
  if (n.type === "TEXT") { const fn = n.fontName === figma.mixed ? "mixed" : `${n.fontName.family} ${n.fontName.style}`;
    const lh = n.lineHeight === figma.mixed ? "mixed" : (n.lineHeight.unit === "AUTO" ? "auto" : r(n.lineHeight.value) + (n.lineHeight.unit === "PERCENT" ? "%" : ""));
    s += ` T"${n.characters.slice(0, 70)}" ${fn} ${n.fontSize === figma.mixed ? "mixed" : r(n.fontSize)}/${lh}`;
    if (n.textStyleId && n.textStyleId !== figma.mixed) { const ts = await figma.getStyleByIdAsync(n.textStyleId); s += ` style:${ts && ts.name}`; } }
  lines.push(s);
  if (d < maxD && "children" in n) for (const c of n.children) { if (c.type === "VECTOR" && d > 2) continue; await dump(c, d + 1, lines, maxD); }
}
const out = [];
for (const [id, depth] of [["417:43437", 3], ["417:44126", 5]]) { out.push(`=== ${id}`); await dump(await figma.getNodeByIdAsync(id), 0, out, depth); }
return out.join("\n");
```

Start shallow (depth 1–2) on the whole frame to learn its structure, then go deep on each region.
Output beyond ~20k characters gets cut; split the regions.

## 3. Variable values per mode

```js
const cols = await figma.variables.getLocalVariableCollectionsAsync();
const hex = (c) => "#" + [c.r, c.g, c.b].map(x => Math.round(x * 255).toString(16).padStart(2, "0")).join("") + (c.a < 1 ? "@" + Math.round(c.a * 100) / 100 : "");
async function resolve(val, modeId) {
  if (val?.type === "VARIABLE_ALIAS") { const v = await figma.variables.getVariableByIdAsync(val.id); const col = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId);
    const m = col.modes.find(mm => mm.modeId === modeId) ? modeId : col.defaultModeId; return v.name + "→" + await resolve(v.valuesByMode[m], m); }
  return val && typeof val === "object" && "r" in val ? hex(val) : JSON.stringify(val);
}
const out = [];
for (const col of cols) { if (col.name !== "Tokens") continue;
  for (const id of col.variableIds) { const v = await figma.variables.getVariableByIdAsync(id);
    if (!/^(Typography|Surface|Icon|Highlights|Spot)\//.test(v.name)) continue;
    const vals = []; for (const m of col.modes) vals.push(m.name + ":" + await resolve(v.valuesByMode[m.modeId], m.modeId));
    out.push(v.name + "  " + vals.join("  |  ")); } }
return out.join("\n");
```

Compare with `globals.css` (`:root` for Light, `.dark` for Dark). The Build work found the owner
had changed dark Heading-02…06; code was updated to match (D82).

## 4. Icons and assets

`download_assets` with `defaultFormat: "svg"` on the icon's frame gives the exact paths. Put icons
in `components/ui/lp-icons.tsx` with `currentColor` strokes, named `…FigmaIcon` or for their role.
When an icon has states (opacity per part), make it one component with a `state` prop.

## 5. Things that fooled us

- A component set's own values came out in the dark theme because of where it sits; the instances
  in the light frame had the right ones.
- A light frame's instance resolved `Foreground-01` as dark (`#212121`) — a mode leak in Figma, not
  a design. Use the token.
- A Default-state row had a drop shadow with no fill: Figma casts it from the text. Ignore it.
- Two frames named "Build/Mobile - light", one in Dark mode.
- A dashed frame was a placeholder for an illustration, not a border (owner).
- Figma rounds 150 % of 13 px to a 20 px line; CSS gives 19.5 px. Over 13 rows that drifts 6 px.
