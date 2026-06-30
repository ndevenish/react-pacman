import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { select } from 'd3-selection';
import { zoom, zoomIdentity } from 'd3-zoom';
import type { ZoomTransform } from 'd3-zoom';
import 'd3-transition';
import './PlateHeatmap.css';

export interface PlateHeatmapProps {
  data: number[] | Float32Array;
  dataLength?: number; // How many items in data to render (for streaming)
  blockRows?: number;
  blockCols?: number;
  wellsPerBlockRow?: number;
  wellsPerBlockCol?: number;
  blockGapWells?: number;
  activeBlocks?: number[];
  blockBackgroundColor?: string;
  gapColor?: string;
  minValue?: number;
  maxValue?: number;
  onSettingsClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  /** Filename for the "save image" button. */
  exportFileName?: string;
  /** Pixels per well in the saved image. Guarantees >= 1 px/well. Default 8. */
  exportWellPx?: number;
  /** Colour for the colour-bar numeric labels in the saved image. */
  exportLabelColor?: string;
}

function valueToColor(value: number, min: number, max: number, logScale: boolean): [number, number, number] {
  let normalized: number;
  if (logScale) {
    const logVal = value >= 1 ? Math.log10(value) : 0;
    const logMin = Math.log10(Math.max(1, min));
    const logMax = Math.log10(Math.max(1, max));
    normalized = logMax > logMin ? (logVal - logMin) / (logMax - logMin) : 0;
  } else {
    normalized = max > min ? (value - min) / (max - min) : 0;
  }
  normalized = Math.max(0, Math.min(1, normalized));
  const hue = (1 - normalized) * 240;

  const s = 0.8;
  const l = 0.5;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0, g = 0, b = 0;
  if (hue < 60) { r = c; g = x; b = 0; }
  else if (hue < 120) { r = x; g = c; b = 0; }
  else if (hue < 180) { r = 0; g = c; b = x; }
  else if (hue < 240) { r = 0; g = x; b = c; }
  else if (hue < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

// Compact numeric label for the exported colour bar.
function formatLegendValue(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  const a = Math.abs(v);
  if (a !== 0 && (a >= 100000 || a < 0.001)) return v.toExponential(2);
  if (Number.isInteger(v)) return v.toLocaleString();
  return (Math.round(v * 100) / 100).toLocaleString();
}

function blockIndexToPosition(index: number, blockRows: number): { row: number; col: number } {
  const col = Math.floor(index / blockRows);
  const rowInCol = index % blockRows;
  const colGoingDown = col % 2 === 0;
  const row = colGoingDown ? rowInCol : blockRows - 1 - rowInCol;
  return { row, col };
}

function positionToBlockIndex(row: number, col: number, blockRows: number): number {
  const colGoingDown = col % 2 === 0;
  const rowInCol = colGoingDown ? row : blockRows - 1 - row;
  return col * blockRows + rowInCol;
}

function buildBlockWellMap(
  blockIndex: number,
  blockRows: number,
  wellsPerBlockRow: number,
  wellsPerBlockCol: number
): Map<string, number> {
  const map = new Map<string, number>();
  const wellsPerBlock = wellsPerBlockRow * wellsPerBlockCol;
  const baseDataIndex = blockIndex * wellsPerBlock;

  // Determine which column this block is in
  const blockCol = Math.floor(blockIndex / blockRows);
  const columnGoingDown = blockCol % 2 === 0;

  let localIndex = 0;
  for (let wellRowStep = 0; wellRowStep < wellsPerBlockRow; wellRowStep++) {
    // In odd columns, we traverse rows bottom-to-top
    const wellRow = columnGoingDown
      ? wellRowStep
      : wellsPerBlockRow - 1 - wellRowStep;

    // Determine horizontal direction based on which row we're on in the traversal
    const rowGoingRight = wellRowStep % 2 === 0;

    for (let wellColStep = 0; wellColStep < wellsPerBlockCol; wellColStep++) {
      const wellCol = rowGoingRight
        ? wellColStep
        : wellsPerBlockCol - 1 - wellColStep;

      map.set(`${wellRow},${wellCol}`, baseDataIndex + localIndex);
      localIndex++;
    }
  }

  return map;
}

interface PlateGeometry {
  activeBlockSet: Set<number>;
  blockWellMaps: Map<number, Map<string, number>>;
  blockRows: number;
  wellsPerBlockRow: number;
  wellsPerBlockCol: number;
  cellWidth: number;
  cellHeight: number;
  blockPixelWidth: number;
  blockPixelHeight: number;
  gapWidth: number;
  gapHeight: number;
}

interface DrawPlateOptions {
  width: number;
  height: number;
  transform: { k: number; x: number; y: number };
  data: number[] | Float32Array;
  dataLength: number;
  min: number;
  max: number;
  logScale: boolean;
  gapColor: string;
  blockBackgroundColor: string;
  geom: PlateGeometry;
}

// Pure draw routine shared by the live canvas and the image-export canvas.
// Defined at module scope so it is never recreated and never lands in a
// dependency array — calling it is free, it does not affect redraw frequency.
function drawPlate(ctx: CanvasRenderingContext2D, opts: DrawPlateOptions): void {
  const {
    width, height, transform, data, dataLength, min, max, logScale,
    gapColor, blockBackgroundColor, geom,
  } = opts;
  const {
    activeBlockSet, blockWellMaps, blockRows, wellsPerBlockRow, wellsPerBlockCol,
    cellWidth, cellHeight, blockPixelWidth, blockPixelHeight, gapWidth, gapHeight,
  } = geom;

  // Clear canvas with gap color
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = gapColor;
  ctx.fillRect(0, 0, width, height);

  // Apply d3 transform
  ctx.setTransform(transform.k, 0, 0, transform.k, transform.x, transform.y);

  // Draw block backgrounds and wells for active blocks
  for (const blockIndex of activeBlockSet) {
    const { row: blockRow, col: blockCol } = blockIndexToPosition(blockIndex, blockRows);
    const wellMap = blockWellMaps.get(blockIndex);
    if (!wellMap) continue;

    const blockOffsetX = blockCol * (blockPixelWidth + gapWidth);
    const blockOffsetY = blockRow * (blockPixelHeight + gapHeight);

    // Draw block background
    ctx.fillStyle = blockBackgroundColor;
    ctx.fillRect(blockOffsetX, blockOffsetY, blockPixelWidth, blockPixelHeight);

    // Draw block border
    ctx.strokeStyle = 'rgba(128, 128, 128, 0.4)';
    ctx.lineWidth = 1 / transform.k;
    ctx.strokeRect(blockOffsetX, blockOffsetY, blockPixelWidth, blockPixelHeight);

    // Draw wells that have data
    for (let wellRow = 0; wellRow < wellsPerBlockRow; wellRow++) {
      for (let wellCol = 0; wellCol < wellsPerBlockCol; wellCol++) {
        const dataIndex = wellMap.get(`${wellRow},${wellCol}`);
        if (dataIndex === undefined || dataIndex >= dataLength) continue;

        const value = data[dataIndex];
        const [r, g, b] = valueToColor(value, min, max, logScale);

        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(
          blockOffsetX + wellCol * cellWidth,
          blockOffsetY + wellRow * cellHeight,
          cellWidth,
          cellHeight
        );
      }
    }
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

export function PlateHeatmap({
  data,
  dataLength,
  blockRows = 8,
  blockCols = 8,
  wellsPerBlockRow = 20,
  wellsPerBlockCol = 20,
  blockGapWells = 6.4,
  activeBlocks,
  blockBackgroundColor = '#2a2a2a',
  gapColor = '#1a1a1a',
  minValue,
  maxValue,
  onSettingsClick,
  exportFileName = 'plate-heatmap.png',
  exportWellPx = 8,
  exportLabelColor = '#888888',
}: PlateHeatmapProps) {
  // Use dataLength if provided, otherwise use data.length
  const effectiveDataLength = dataLength ?? data.length;
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasDims, setCanvasDims] = useState({ width: 0, height: 0 });
  const [logScale, setLogScale] = useState(false);
  const [tooltip, setTooltip] = useState<{
    value: number;
    dataIndex: number;
    x: number;
    y: number;
  } | null>(null);

  // Store transform in state for rendering and coordinate conversion
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const zoomBehaviorRef = useRef<ReturnType<typeof zoom<HTMLCanvasElement, unknown>> | null>(null);
  // Refs so the stable stopScroll closure can read current values without re-registering
  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  const offsetRef = useRef({ x: 0, y: 0 });

  // Track canvas wrapper size to fill it
  useEffect(() => {
    const wrapper = canvasWrapperRef.current;
    if (!wrapper) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setCanvasDims({ width: Math.round(width), height: Math.round(height) });
      }
    });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  const { width, height } = canvasDims;

  // Memoize min/max so we don't spread 25 600 elements on every render
  // (tooltip state updates trigger re-renders; Math.min(...slice) is very expensive)
  const [minVal, maxVal] = useMemo(() => {
    if (effectiveDataLength === 0) return [minValue ?? 0, maxValue ?? 1];
    let mn = minValue !== undefined ? minValue : Infinity;
    let mx = maxValue !== undefined ? maxValue : -Infinity;
    for (let i = 0; i < effectiveDataLength; i++) {
      const v = data[i];
      if (minValue === undefined && v < mn) mn = v;
      if (maxValue === undefined && v > mx) mx = v;
    }
    if (mn === Infinity) mn = 0;
    if (mx === -Infinity) mx = 1;
    return [mn, mx];
  }, [data, effectiveDataLength, minValue, maxValue]);

  // Grid is always square; centre it in the (possibly non-square) canvas
  const gridSize = Math.min(width, height);
  const offsetX = (width - gridSize) / 2;
  const offsetY = (height - gridSize) / 2;

  // When the canvas resizes, reset zoom to the centred default transform
  useEffect(() => {
    // Always keep offsetRef current so the zoom setup effect can read it
    offsetRef.current = { x: offsetX, y: offsetY };
    const canvas = canvasRef.current;
    if (!canvas || !zoomBehaviorRef.current) return;
    const centered = zoomIdentity.translate(offsetX, offsetY);
    select(canvas).call(zoomBehaviorRef.current.transform, centered);
    setTransform(centered);
    transformRef.current = centered;
  }, [offsetX, offsetY]);

  const activeBlockSet = useMemo(() => {
    if (!activeBlocks) {
      return new Set(Array.from({ length: blockRows * blockCols }, (_, i) => i));
    }
    return new Set(activeBlocks);
  }, [activeBlocks, blockRows, blockCols]);

  const blockWellMaps = useMemo(() => {
    const maps = new Map<number, Map<string, number>>();
    for (const blockIndex of activeBlockSet) {
      maps.set(blockIndex, buildBlockWellMap(blockIndex, blockRows, wellsPerBlockRow, wellsPerBlockCol));
    }
    return maps;
  }, [activeBlockSet, blockRows, wellsPerBlockRow, wellsPerBlockCol]);

  const totalWellsX = blockCols * wellsPerBlockCol + (blockCols - 1) * blockGapWells;
  const totalWellsY = blockRows * wellsPerBlockRow + (blockRows - 1) * blockGapWells;
  const cellWidth = gridSize / totalWellsX;
  const cellHeight = gridSize / totalWellsY;
  const gapWidth = blockGapWells * cellWidth;
  const gapHeight = blockGapWells * cellHeight;
  const blockPixelWidth = wellsPerBlockCol * cellWidth;
  const blockPixelHeight = wellsPerBlockRow * cellHeight;

  // Setup d3-zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Register our wheel handler FIRST — d3-zoom calls stopImmediatePropagation()
    // on wheel events, so anything registered after it will never fire.
    // We always preventDefault() to block page scroll.
    // When already at minimum zoom and scrolling out, we also stopImmediatePropagation()
    // to prevent d3-zoom from swallowing the event, and animate back to centre instead.
    const stopScroll = (e: WheelEvent) => {
      e.preventDefault();
      const t = transformRef.current;
      if (t.k <= 1 && e.deltaY > 0 && zoomBehaviorRef.current) {
        e.stopImmediatePropagation();
        const { x: ox, y: oy } = offsetRef.current;
        select(canvas)
          .transition()
          .duration(300)
          .call(zoomBehaviorRef.current.transform, zoomIdentity.translate(ox, oy));
      }
    };
    canvas.addEventListener('wheel', stopScroll, { passive: false });

    const zoomBehavior = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([1, 10])
      .on('zoom', (event) => {
        setTransform(event.transform);
        transformRef.current = event.transform;
      });

    zoomBehaviorRef.current = zoomBehavior;

    select(canvas)
      .call(zoomBehavior)
      .on('dblclick.zoom', null); // Disable double-click zoom

    return () => {
      select(canvas).on('.zoom', null);
      canvas.removeEventListener('wheel', stopScroll);
    };
  }, []);

  // Draw the heatmap
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    drawPlate(ctx, {
      width, height, transform,
      data, dataLength: effectiveDataLength,
      min: minVal, max: maxVal, logScale,
      gapColor, blockBackgroundColor,
      geom: {
        activeBlockSet, blockWellMaps, blockRows, wellsPerBlockRow, wellsPerBlockCol,
        cellWidth, cellHeight, blockPixelWidth, blockPixelHeight, gapWidth, gapHeight,
      },
    });
  }, [data, effectiveDataLength, width, height, activeBlockSet, blockWellMaps, blockRows, wellsPerBlockRow, wellsPerBlockCol, cellWidth, cellHeight, blockPixelWidth, blockPixelHeight, gapWidth, gapHeight, transform, blockBackgroundColor, gapColor, minVal, maxVal, logScale]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    // Convert screen to canvas coordinates using d3 transform
    const x = (screenX - transform.x) / transform.k;
    const y = (screenY - transform.y) / transform.k;

    const blockStepX = blockPixelWidth + gapWidth;
    const blockStepY = blockPixelHeight + gapHeight;

    const blockCol = Math.floor(x / blockStepX);
    const blockRow = Math.floor(y / blockStepY);

    if (blockCol < 0 || blockCol >= blockCols || blockRow < 0 || blockRow >= blockRows) {
      setTooltip(null);
      return;
    }

    const blockIndex = positionToBlockIndex(blockRow, blockCol, blockRows);
    if (!activeBlockSet.has(blockIndex)) {
      setTooltip(null);
      return;
    }

    const xInBlock = x - blockCol * blockStepX;
    const yInBlock = y - blockRow * blockStepY;

    if (xInBlock > blockPixelWidth || yInBlock > blockPixelHeight) {
      setTooltip(null);
      return;
    }

    const wellCol = Math.floor(xInBlock / cellWidth);
    const wellRow = Math.floor(yInBlock / cellHeight);

    if (wellCol < 0 || wellCol >= wellsPerBlockCol || wellRow < 0 || wellRow >= wellsPerBlockRow) {
      setTooltip(null);
      return;
    }

    const wellMap = blockWellMaps.get(blockIndex);
    if (!wellMap) {
      setTooltip(null);
      return;
    }

    const dataIndex = wellMap.get(`${wellRow},${wellCol}`);
    if (dataIndex === undefined || dataIndex >= effectiveDataLength) {
      setTooltip(null);
      return;
    }

    const value = data[dataIndex];

    setTooltip({
      value,
      dataIndex,
      x: e.clientX,
      y: e.clientY,
    });
  }, [cellWidth, cellHeight, blockPixelWidth, blockPixelHeight, gapWidth, gapHeight, blockRows, blockCols, wellsPerBlockRow, wellsPerBlockCol, activeBlockSet, blockWellMaps, data, effectiveDataLength, transform]);

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  const handleReset = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !zoomBehaviorRef.current) return;

    select(canvas)
      .transition()
      .duration(300)
      .call(zoomBehaviorRef.current.transform, zoomIdentity.translate(offsetX, offsetY));
  }, [offsetX, offsetY]);

  const handleZoomIn = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !zoomBehaviorRef.current) return;

    select(canvas)
      .transition()
      .duration(200)
      .call(zoomBehaviorRef.current.scaleBy, 1.3);
  }, []);

  const handleZoomOut = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !zoomBehaviorRef.current) return;

    select(canvas)
      .transition()
      .duration(200)
      .call(zoomBehaviorRef.current.scaleBy, 0.7);
  }, []);

  // Save the full plate as a PNG, rendered to an offscreen canvas at a fixed
  // integer scale so every well is guaranteed at least `exportWellPx` pixels.
  // This is a one-off, off the live render path: identity transform, full plate,
  // independent of the current on-screen zoom/pan. The area outside the plate and
  // the colour-bar margin are left transparent.
  const handleSave = useCallback(() => {
    const wellPx = Math.max(1, Math.round(exportWellPx));
    // Integer block geometry => crisp, pixel-aligned wells.
    const exportBlockPixelWidth = wellsPerBlockCol * wellPx;
    const exportBlockPixelHeight = wellsPerBlockRow * wellPx;
    const exportGapWidth = Math.round(blockGapWells * wellPx);
    const exportGapHeight = Math.round(blockGapWells * wellPx);
    const plateWidth = blockCols * exportBlockPixelWidth + (blockCols - 1) * exportGapWidth;
    const plateHeight = blockRows * exportBlockPixelHeight + (blockRows - 1) * exportGapHeight;

    const off = document.createElement('canvas');
    const ctx = off.getContext('2d');
    if (!ctx) return;

    // Colour-bar legend geometry — measure labels before sizing the canvas.
    const fontSize = Math.max(11, Math.round(plateHeight * 0.022));
    const pad = Math.round(fontSize * 0.9);
    const labelGap = Math.round(fontSize * 0.4);
    const barWidth = Math.max(10, Math.round(plateHeight * 0.02));
    ctx.font = `${fontSize}px sans-serif`;
    const maxLabel = formatLegendValue(maxVal);
    const minLabel = formatLegendValue(minVal);
    const labelWidth = Math.max(ctx.measureText(maxLabel).width, ctx.measureText(minLabel).width);
    const legendContentWidth = Math.max(barWidth, labelWidth);
    const legendWidth = pad + legendContentWidth + pad;

    // Resizing the canvas resets the context (and clears it to transparent).
    off.width = plateWidth + legendWidth;
    off.height = plateHeight;

    // Plate fills only its own rectangle; the legend margin stays transparent.
    drawPlate(ctx, {
      width: plateWidth,
      height: plateHeight,
      transform: { k: 1, x: 0, y: 0 },
      data,
      dataLength: effectiveDataLength,
      min: minVal,
      max: maxVal,
      logScale,
      gapColor,
      blockBackgroundColor,
      geom: {
        activeBlockSet,
        blockWellMaps,
        blockRows,
        wellsPerBlockRow,
        wellsPerBlockCol,
        cellWidth: wellPx,
        cellHeight: wellPx,
        blockPixelWidth: exportBlockPixelWidth,
        blockPixelHeight: exportBlockPixelHeight,
        gapWidth: exportGapWidth,
        gapHeight: exportGapHeight,
      },
    });

    // Colour scale: red (high) at top -> blue (low) at bottom, matching valueToColor.
    const centerX = plateWidth + pad + legendContentWidth / 2;
    const barX = centerX - barWidth / 2;
    const barTop = pad + fontSize + labelGap;
    const barHeight = Math.max(1, plateHeight - barTop - labelGap - fontSize - pad);

    const grad = ctx.createLinearGradient(0, barTop, 0, barTop + barHeight);
    grad.addColorStop(0, 'hsl(0, 80%, 50%)');
    grad.addColorStop(0.25, 'hsl(60, 80%, 50%)');
    grad.addColorStop(0.5, 'hsl(120, 80%, 50%)');
    grad.addColorStop(0.75, 'hsl(180, 80%, 50%)');
    grad.addColorStop(1, 'hsl(240, 80%, 50%)');
    ctx.fillStyle = grad;
    ctx.fillRect(barX, barTop, barWidth, barHeight);
    ctx.strokeStyle = 'rgba(128, 128, 128, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barTop, barWidth, barHeight);

    ctx.fillStyle = exportLabelColor;
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(maxLabel, centerX, barTop - labelGap);
    ctx.textBaseline = 'top';
    ctx.fillText(minLabel, centerX, barTop + barHeight + labelGap);

    off.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportFileName;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }, [exportWellPx, exportFileName, exportLabelColor, blockCols, blockRows, blockGapWells, wellsPerBlockRow, wellsPerBlockCol, data, effectiveDataLength, minVal, maxVal, logScale, gapColor, blockBackgroundColor, activeBlockSet, blockWellMaps]);

  return (
    <div className="plate-heatmap-container">
      <div className="zoom-controls">
        <span className="zoom-level">{Math.round(transform.k * 100)}%</span>
        <button onClick={handleZoomIn}>+</button>
        <button onClick={handleZoomOut}>−</button>
        <button onClick={handleReset}>⟳</button>
        {onSettingsClick && (
          <button className="settings-button" onClick={onSettingsClick}>⚙</button>
        )}
        <button className="save-button" onClick={handleSave} title="Save image">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
            <path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2v9.67z" />
          </svg>
        </button>
      </div>

      <div className="plate-heatmap-canvas-wrapper" ref={canvasWrapperRef}>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="plate-heatmap-canvas"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
      </div>

      <div className="color-scale">
        <span className="scale-label">{maxVal}</span>
        <div className="scale-bar" />
        <span className="scale-label">{minVal}</span>
        <button className="scale-toggle" onClick={() => setLogScale(l => !l)}>
          {logScale ? 'Log' : 'Lin'}
        </button>
      </div>

      {tooltip && (
        <div
          className="tooltip"
          style={{
            left: tooltip.x + 15,
            top: tooltip.y - 50,
          }}
        >
          <div className="tooltip-value">{tooltip.value}</div>
          <div className="tooltip-index">Index: {tooltip.dataIndex}</div>
        </div>
      )}
    </div>
  );
}
