import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, ZoomTransform } from 'd3-zoom';
import './PlateHeatmap.css';

interface PlateHeatmapProps {
  data: number[];
  blockRows?: number;
  blockCols?: number;
  wellsPerBlockRow?: number;
  wellsPerBlockCol?: number;
  blockGapWells?: number;
  activeBlocks?: number[];
  width?: number;
  height?: number;
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
  blockRows = 8,
  blockCols = 8,
  wellsPerBlockRow = 20,
  wellsPerBlockCol = 20,
  blockGapWells = 6.4,
  activeBlocks,
  width = 800,
  height = 800,
}: PlateHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tooltip, setTooltip] = useState<{
    value: number;
    dataIndex: number;
    x: number;
    y: number;
  } | null>(null);

  // Store transform in state for rendering and coordinate conversion
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const zoomBehaviorRef = useRef<ReturnType<typeof zoom<HTMLCanvasElement, unknown>> | null>(null);

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
  const cellWidth = width / totalWellsX;
  const cellHeight = height / totalWellsY;
  const gapWidth = blockGapWells * cellWidth;
  const gapHeight = blockGapWells * cellHeight;
  const blockPixelWidth = wellsPerBlockCol * cellWidth;
  const blockPixelHeight = wellsPerBlockRow * cellHeight;

  // Setup d3-zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const zoomBehavior = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.5, 10])
      .on('zoom', (event) => {
        setTransform(event.transform);
      });

    zoomBehaviorRef.current = zoomBehavior;

    select(canvas)
      .call(zoomBehavior)
      .on('dblclick.zoom', null); // Disable double-click zoom

    return () => {
      select(canvas).on('.zoom', null);
    };
  }, []);

  // Draw the heatmap
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const min = data.length > 0 ? Math.min(...data) : 0;
    const max = data.length > 0 ? Math.max(...data) : 1;

    // Clear canvas
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    // Apply d3 transform
    ctx.setTransform(transform.k, 0, 0, transform.k, transform.x, transform.y);

    // Draw block borders and wells for active blocks
    for (const blockIndex of activeBlockSet) {
      const { row: blockRow, col: blockCol } = blockIndexToPosition(blockIndex, blockRows);
      const wellMap = blockWellMaps.get(blockIndex);
      if (!wellMap) continue;

      const blockOffsetX = blockCol * (blockPixelWidth + gapWidth);
      const blockOffsetY = blockRow * (blockPixelHeight + gapHeight);

      // Draw block border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1 / transform.k; // Keep border width consistent at all zoom levels
      ctx.strokeRect(blockOffsetX, blockOffsetY, blockPixelWidth, blockPixelHeight);

      // Draw wells that have data
      for (let wellRow = 0; wellRow < wellsPerBlockRow; wellRow++) {
        for (let wellCol = 0; wellCol < wellsPerBlockCol; wellCol++) {
          const dataIndex = wellMap.get(`${wellRow},${wellCol}`);
          if (dataIndex === undefined || dataIndex >= data.length) continue;

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
  }, [data, width, height, activeBlockSet, blockWellMaps, blockRows, wellsPerBlockRow, wellsPerBlockCol, cellWidth, cellHeight, blockPixelWidth, blockPixelHeight, gapWidth, gapHeight, transform]);

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
    if (dataIndex === undefined) {
      setTooltip(null);
      return;
    }

    const value = data[dataIndex] ?? 0;

    setTooltip({
      value,
      dataIndex,
      x: e.clientX,
      y: e.clientY,
    });
  }, [cellWidth, cellHeight, blockPixelWidth, blockPixelHeight, gapWidth, gapHeight, blockRows, blockCols, wellsPerBlockRow, wellsPerBlockCol, activeBlockSet, blockWellMaps, data, transform]);

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  const handleReset = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !zoomBehaviorRef.current) return;

    select(canvas)
      .transition()
      .duration(300)
      .call(zoomBehaviorRef.current.transform, zoomIdentity);
  }, []);

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

  const min = data.length > 0 ? Math.min(...data) : 0;
  const max = data.length > 0 ? Math.max(...data) : 1;

  return (
    <div className="plate-heatmap-container">
      <div className="zoom-controls">
        <span className="zoom-level">{Math.round(transform.k * 100)}%</span>
        <button onClick={handleZoomIn}>+</button>
        <button onClick={handleZoomOut}>-</button>
        <button onClick={handleReset}>Reset</button>
      </div>

      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="plate-heatmap-canvas"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />

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

      <div className="color-scale">
        <div className="scale-bar" />
        <div className="scale-labels">
          <span>{min}</span>
          <span>{max}</span>
        </div>
      </div>
    </div>
  );
}
