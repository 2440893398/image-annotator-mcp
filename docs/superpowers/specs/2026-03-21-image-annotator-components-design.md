# Spec: Semantic Combo Components for Image Annotator

## Overview
This document specifies the design for 5 new semantic composite components in the `image-annotator` MCP server. These components provide AI agents with high-level, predictable styling that mimics professional annotation tools (e.g., MarkerApp). This approach replaces the need for AI to manually compose basic shapes, drastically improving visual quality, alignment, and clarity.

## New Components API & Visual Design

### 1. `measure` (Dimension Annotation)
- **Purpose**: Annotate distance or size with a professional measurement line.
- **API**:
  - `from`: `[x, y]` (Start point)
  - `to`: `[x, y]` (End point)
  - `text`: `string` (The measurement text, e.g., "76CM")
- **Visuals**: A straight line connecting `from` and `to`. At both ends, short perpendicular tick marks (e.g., 10px long). The text is drawn in the center, using a solid background to cut through the line, ensuring readability.

### 2. `leadout` (Leader Line Callout)
- **Purpose**: A clear, non-messy callout pointing exactly to an element.
- **API**:
  - `target`: `[x, y]` (The exact point of interest on the image)
  - `anchor`: `[x, y]` (Where the text label is placed)
  - `text`: `string` (The label text)
- **Visuals**: A small circle/dot at the `target`. A solid, straight or orthogonally-bent line connecting `target` to `anchor`. A rounded, filled text box rendered at `anchor`.

### 3. `bracket-label` (Bracket Annotation)
- **Purpose**: Grouping an area along an edge with a curly or straight bracket, then labeling it.
- **API**:
  - `from`: `[x, y]`, `to`: `[x, y]` (The span of the bracket)
  - `direction`: `"left" | "right" | "top" | "bottom"` (Which way the bracket points out, away from the object)
  - `text`: `string` (The label text)
- **Visuals**: A bracket line spanning the distance. A connecting line emerges from the exact middle of the bracket, pointing outward towards a text label.

### 4. `magnifier` (Extracted Zoom Magnifier)
- **Purpose**: Provide a zoomed view of a specific point without obscuring the original context.
- **API**:
  - `target`: `[x, y]` (The center of the area to be magnified)
  - `anchor`: `[x, y]` (Where to place the large magnifier circle)
  - `radius`: `number` (Radius of the magnifier circle, default: 60)
  - `zoom`: `number` (Zoom factor, default: 2)
  - `borderColor`: `string` (Optional, defaults to theme accent color)
- **Visuals**: A small dot or small circle at `target`. A much larger circle at `anchor`. The large circle contains the image content from `target` scaled by `zoom`. An arrow line connecting the `anchor` to the `target`.

### 5. `spotlight` (Highlight Focus Area)
- **Purpose**: Darken the background to focus on one specific UI element.
- **API**:
  - `x`: `number`, `y`: `number` (Center of the spotlight)
  - `radius`: `number` (If circular)
  - `width`: `number`, `height`: `number` (If rectangular. Overrides radius if provided)
- **Visuals**: 50% opacity black overlay across the entire image. The target area is fully transparent (punched out), surrounded by a 2px bright stroke.

## Global Styling Upgrade
- All text labels (including those inside `measure`, `leadout`, and standard components) will default to a solid background color, rounded corners, and a 2px outer stroke matching the theme to guarantee contrast.
- Lines will default to 2px thickness and use solid arrowheads where applicable, discarding thin or easily-lost bezier curves in favor of clean straight lines.
