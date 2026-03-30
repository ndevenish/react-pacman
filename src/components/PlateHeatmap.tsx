import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { select } from 'd3-selection';
import { zoom, zoomIdentity } from 'd3-zoom';
import type { ZoomTransform } from 'd3-zoom';
import 'd3-transition';
import './PlateHeatmap.css';

export interface PlateHeatmapProps {
  data: number[];
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
}

function valueToColor(value: number, min: number, max: number): [number, number, number] {
  const normalized = (value - min) / (max - min);
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
}: PlateHeatmapProps) {
  // Use dataLength if provided, otherwise use data.length
  const effectiveDataLength = dataLength ?? data.length;
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasDims, setCanvasDims] = useState({ width: 400, height: 400 });
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

  // Grid is always square; centre it in the (possibly non-square) canvas
  const gridSize = Math.min(width, height);
  const offsetX = (width - gridSize) / 2;
  const offsetY = (height - gridSize) / 2;

  // When the canvas resizes, reset zoom to the centred default transform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !zoomBehaviorRef.current) return;
    const centered = zoomIdentity.translate(offsetX, offsetY);
    offsetRef.current = { x: offsetX, y: offsetY };
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

    // Prevent page scroll. When already at minimum zoom and scrolling out,
    // animate back to the centred default instead.
    const stopScroll = (e: WheelEvent) => {
      e.preventDefault();
      const t = transformRef.current;
      if (t.k <= 1 && e.deltaY > 0 && zoomBehaviorRef.current) {
        const { x: ox, y: oy } = offsetRef.current;
        select(canvas)
          .transition()
          .duration(300)
          .call(zoomBehaviorRef.current.transform, zoomIdentity.translate(ox, oy));
      }
    };
    canvas.addEventListener('wheel', stopScroll, { passive: false });

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

    // Use provided min/max or calculate from data
    const min = minValue ?? (effectiveDataLength > 0 ? Math.min(...data.slice(0, effectiveDataLength)) : 0);
    const max = maxValue ?? (effectiveDataLength > 0 ? Math.max(...data.slice(0, effectiveDataLength)) : 1);

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
          if (dataIndex === undefined || dataIndex >= effectiveDataLength) continue;

          const value = data[dataIndex];
          const [r, g, b] = valueToColor(value, min, max);

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
  }, [data, effectiveDataLength, width, height, activeBlockSet, blockWellMaps, blockRows, wellsPerBlockRow, wellsPerBlockCol, cellWidth, cellHeight, blockPixelWidth, blockPixelHeight, gapWidth, gapHeight, transform, blockBackgroundColor, gapColor, minValue, maxValue]);

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

  const minVal = minValue ?? (effectiveDataLength > 0 ? Math.min(...data.slice(0, effectiveDataLength)) : 0);
  const maxVal = maxValue ?? (effectiveDataLength > 0 ? Math.max(...data.slice(0, effectiveDataLength)) : 1);

  return (
    <div className="plate-heatmap-container">
      <div className="zoom-controls">
        <span className="zoom-level">{Math.round(transform.k * 100)}%</span>
        <button onClick={handleZoomIn}>+</button>
        <button onClick={handleZoomOut}>−</button>
        <button onClick={handleReset}>⟳</button>
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
