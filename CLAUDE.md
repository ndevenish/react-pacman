# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Vite dev server with HMR (runs the App.tsx demo harness)
npm run build     # vite build (JS/CSS bundles) + tsc -p tsconfig.lib.json (declarations)
npm run lint      # eslint
npm run preview   # preview the built demo app
```

## Architecture

This is a **dual-purpose repo**: a publishable React component library (`plate-heatmap` on npm) and a standalone demo app (`App.tsx`) for developing/testing the component.

### Library vs. app split

| Path | Role |
|------|------|
| `src/components/PlateHeatmap.tsx` | The component — only file that ships |
| `src/components/PlateHeatmap.css` | Component styles — extracted to `dist/plate-heatmap.css` |
| `src/index.ts` | Public API barrel (`PlateHeatmap`, `PlateHeatmapProps`) |
| `src/App.tsx` | Demo harness only — not part of the library |
| `src/main.tsx` | Dev app entry — not part of the library |

### Build pipeline

- `vite build` — reads `src/index.ts`, emits `dist/plate-heatmap.js` (ESM) and `dist/plate-heatmap.cjs` (CJS). React, react-dom, d3-selection, d3-transition, and d3-zoom are all external (peer deps).
- `tsc -p tsconfig.lib.json` — emits declarations to `dist/` (`index.d.ts` + `components/PlateHeatmap.d.ts`). Uses `tsconfig.lib.json` which extends `tsconfig.app.json` with `emitDeclarationOnly: true`.
- `tsconfig.app.json` has `noEmit: true` and is used only for type-checking the dev app.

### PlateHeatmap component

Canvas-based heatmap for a multi-block perforated plate (default 8×8 blocks of 20×20 wells = 25,600 wells). Key design points:

- **Snake traversal**: blocks fill columns top-to-bottom on even columns, bottom-to-top on odd; wells within a block also snake. `blockIndexToPosition` / `positionToBlockIndex` / `buildBlockWellMap` encode this logic.
- **Streaming support**: accepts a pre-allocated `data` array and a separate `dataLength` prop to render only the first N elements — avoids re-allocating the array on every tick.
- **Zoom/pan**: d3-zoom attached to the canvas; transform stored in React state so the draw `useEffect` re-runs on zoom. `d3-transition` is imported for its type augmentation (enables `.transition()` on d3 selections used in the zoom reset/in/out handlers).
- **Tooltip**: positioned with `position: fixed` using raw clientX/Y, converting screen→canvas coordinates via the current d3 `ZoomTransform`.

### Consumer usage

```tsx
import { PlateHeatmap } from 'plate-heatmap';
import 'plate-heatmap/dist/plate-heatmap.css';
```

Consumers must install peer deps: `react`, `react-dom`, `d3-selection`, `d3-transition`, `d3-zoom`.
