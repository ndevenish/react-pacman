import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
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

  let localIndex = 0;
  for (let wellRow = 0; wellRow < wellsPerBlockRow; wellRow++) {
    const rowGoingRight = wellRow % 2 === 0;

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

  // Zoom and pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

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

  // Draw the heatmap
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const min = data.length > 0 ? Math.min(...data) : 0;
    const max = data.length > 0 ? Math.max(...data) : 1;

    // Clear and apply transform
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    // Apply zoom and pan
    ctx.setTransform(zoom, 0, 0, zoom, pan.x, pan.y);

    // Draw only active blocks
    for (const blockIndex of activeBlockSet) {
      const { row: blockRow, col: blockCol } = blockIndexToPosition(blockIndex, blockRows);
      const wellMap = blockWellMaps.get(blockIndex);
      if (!wellMap) continue;

      const blockOffsetX = blockCol * (blockPixelWidth + gapWidth);
      const blockOffsetY = blockRow * (blockPixelHeight + gapHeight);

      for (let wellRow = 0; wellRow < wellsPerBlockRow; wellRow++) {
        for (let wellCol = 0; wellCol < wellsPerBlockCol; wellCol++) {
          const dataIndex = wellMap.get(`${wellRow},${wellCol}`);
          if (dataIndex === undefined) continue;

          const value = data[dataIndex] ?? 0;
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

    // Reset transform
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }, [data, width, height, activeBlockSet, blockWellMaps, blockRows, wellsPerBlockRow, wellsPerBlockCol, cellWidth, cellHeight, blockPixelWidth, blockPixelHeight, gapWidth, gapHeight, zoom, pan]);

  // Convert screen coordinates to canvas coordinates
  const screenToCanvas = useCallback((screenX: number, screenY: number) => {
    return {
      x: (screenX - pan.x) / zoom,
      y: (screenY - pan.y) / zoom,
    };
  }, [zoom, pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Handle dragging for pan
    if (isDragging) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPan({
        x: dragStartRef.current.panX + dx,
        y: dragStartRef.current.panY + dy,
      });
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    // Convert to canvas coordinates
    const { x, y } = screenToCanvas(screenX, screenY);

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
  }, [cellWidth, cellHeight, blockPixelWidth, blockPixelHeight, gapWidth, gapHeight, blockRows, blockCols, wellsPerBlockRow, wellsPerBlockCol, activeBlockSet, blockWellMaps, data, isDragging, screenToCanvas]);

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Zoom factor
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.min(Math.max(zoom * zoomFactor, 0.5), 10);

    // Adjust pan to zoom toward mouse position
    const canvasX = (mouseX - pan.x) / zoom;
    const canvasY = (mouseY - pan.y) / zoom;

    const newPanX = mouseX - canvasX * newZoom;
    const newPanY = mouseY - canvasY * newZoom;

    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  }, [zoom, pan]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 0) { // Left click
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };
    }
  }, [pan]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleReset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const min = data.length > 0 ? Math.min(...data) : 0;
  const max = data.length > 0 ? Math.max(...data) : 1;

  return (
    <div className="plate-heatmap-container">
      <div className="zoom-controls">
        <span className="zoom-level">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(z * 1.2, 10))}>+</button>
        <button onClick={() => setZoom(z => Math.max(z / 1.2, 0.5))}>-</button>
        <button onClick={handleReset}>Reset</button>
      </div>

      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className={`plate-heatmap-canvas ${isDragging ? 'dragging' : ''}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      />

      {tooltip && !isDragging && (
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
