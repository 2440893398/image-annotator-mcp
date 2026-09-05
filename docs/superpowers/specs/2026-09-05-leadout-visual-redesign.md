# Leadout Visual Redesign

## Problem

The original `leadout` rendered a 5px flat dot, a thin (2px) straight line from
target to anchor, and a white box with a 2px colored border. On real
screenshots this read as amateurish:

- Straight lines crossed live UI at arbitrary angles and were illegible over
  busy content (no contrast layer between ink and pixels).
- The naked dot disappeared into text and icons.
- The white box + thin border label looked flat and disconnected, and the
  leader entered it at a random angle, clipping corners.
- Three leadouts side by side produced three different line angles and long
  leaders sweeping across the whole image.

## Research basis

Synthesized from screenshot tools (CleanShot X, Snagit, Shottr, Markup.io),
annotation libraries (d3-annotation, anseki/leader-line, matplotlib), and
boundary-labeling / cartography literature:

1. **Single-bend "L" leaders beat straight ones.** Empirical readability
   studies of boundary labeling find one-bend octilinear leaders (45° + 90°)
   are the best compromise between task performance and preference; crossings
   are disqualifying (Barth et al., *On the readability of leaders in boundary
   labeling*, Information Visualization 2019; d3-annotation `type-elbow`).
2. **Halo/casing under ink.** A light outline under lines and dots guarantees
   legibility on any background (leader-line `outline` option; EU data-vis
   guide on text halos). Maps have done this forever.
3. **No hairlines.** leader-line defaults to 4px; annotation guides recommend
   ≥2–3px with round caps. 1–2px black lines read as patent drawings.
4. **Leader meets the label edge head-on.** The connector should terminate at
   the side-center of the note, perpendicular to the edge (d3-annotation note
   alignment; matplotlib clips the connector at the text bbox).
5. **Anchor as ring, not speck.** Product-tour hotspots and CleanShot-style
   markers use a colored core with a contrasting ring (~4–6px core + ~2px
   ring).
6. **Label chip like a design-system tooltip.** Solid accent fill with
   auto-contrast text (or surface fill + accent border), 4–8px radius,
   8–12px/6–8px padding, soft low-opacity shadow — not a flat white box with a
   thin gray border.
7. **One accent color per callout family** so dot, line, and chip read as a
   single object.

## Design

```
target ●───╲                 ┌──────────┐
            ╲ 45°            │  label   │  ← filled accent chip, auto-contrast
             ╲______________ ├──────────┘     text, soft shadow, rx 8
              axis-aligned  edge mid-point
```

- **Routing (`lineStyle: "elbow"`, default):** leave the target at 45°, then
  run axis-aligned into the mid-point of whichever chip edge faces the target.
  The bend is computed so the axis-aligned run absorbs the longer distance;
  when the elbow cannot fit, the leader degrades to a single straight segment.
  `lineStyle: "straight"` restores the old routing.
- **Halo (`halo: true`, default):** `rgba(255,255,255,0.9)` casing at
  `strokeWidth + 3` under the leader, plus a white under-circle (`r + 2`)
  beneath the dot, forming the ring.
- **Stroke:** unless `strokeWidth` is given, the leader weight follows the
  label size (`max(2, 0.15em)` — 2.4px at the 16px default, ~4px at the xl
  preset), round caps/joins. Dot radius is `2 + strokeWidth`. `leadout` also
  joins the image-size presets: on large screenshots `fontSize` (and with it
  the whole assembly) scales up like `label`/`callout` already did.
- **Chip:** centred on `anchor` (unchanged semantics). Width from CJK-aware
  text metrics + `0.75em` horizontal padding; height `1.3em` per line +
  `0.4em` vertical padding; corner radius `min(8, h/2)`.
  - `variant: "soft"` (default): fill = light tint of the accent
    (`tintColor`, 85% towards white), 1.5px accent border, `#1F2328` text.
    A solid saturated chip proved visually loud when several labels stack and
    white-on-color CJK text reads worse than dark-on-tint, so the calm
    Excalidraw-palette pairing (colored stroke + light background) is the
    default.
  - `variant: "filled"`: fill = accent color, text color picked by luminance
    (white on dark fills, `#1F2328` on light ones — reuses
    `getRedactLabelColor`). For maximum emphasis.
  - `variant: "outline"`: white fill, 1.5px accent border, `#1F2328` text.
  - Shadow: `dy 2, blur 3, opacity 0.3` (soft elevation, no offset smear).
- **Text:** weight 600, `font`/`handwriting` respected like other components,
  multi-line via `\n`.
- **Themes:** all four built-in themes now carry `leadout` defaults
  (accent color + theme font).

## Compatibility

- `target`/`anchor`/`text`/`color`/`fontSize`/`strokeWidth`/`shadow` keep
  their meaning; `anchor` is still the label centre, so existing coordinates
  do not shift.
- New optional params: `variant`, `lineStyle`, `halo`, `font`, `handwriting`.
- The leader is now a `<path>` (was `<line>`).
- `estimateAnnotationBounds` mirrors the real chip metrics via
  `getLeadoutChipSize` instead of assuming a 100px-wide label.

## Usage guidance (for callers and skills)

- Keep leaders short; place anchors in whitespace bands (image margins, gaps
  between UI rows) so the axis-aligned run crosses nothing.
- Use one accent color for all leadouts on an image; `primary` reads well on
  light UIs.
- When stacking several labels in a column, order them to match the vertical
  order of their targets to avoid crossings.
