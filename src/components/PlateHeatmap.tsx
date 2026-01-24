import { useRef, useEffect, useState, useCallback } from 'react';
import './PlateHeatmap.css';

interface PlateHeatmapProps {
  data: number[];
  blockRows?: number;
  blockCols?: number;
  wellsPerBlockRow?: number;
  wellsPerBlockCol?: number;
  width?: number;
  height?: number;
}

function valueToColor(value: number, min: number, max: number): [number, number, number] {
  const normalized = (value - min) / (max - min);
  // Blue to Red gradient through green/yellow (HSL hue 240 -> 0)
  const hue = (1 - normalized) * 240;

  // Convert HSL to RGB
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

// Build the mapping from visual position to data index
function buildWellMap(
  blockRows: number,
  blockCols: number,
  wellsPerBlockRow: number,
  wellsPerBlockCol: number
): number[][] {
  const totalVisualRows = blockRows * wellsPerBlockRow;
  const totalVisualCols = blockCols * wellsPerBlockCol;

  const map: number[][] = [];
  for (let r = 0; r < totalVisualRows; r++) {
    map[r] = new Array(totalVisualCols).fill(0);
  }

  let dataIndex = 0;

  for (let blockCol = 0; blockCol < blockCols; blockCol++) {
    const colGoingDown = blockCol % 2 === 0;

    for (let blockRowStep = 0; blockRowStep < blockRows; blockRowStep++) {
      const blockRow = colGoingDown
        ? blockRowStep
        : blockRows - 1 - blockRowStep;

      for (let wellRow = 0; wellRow < wellsPerBlockRow; wellRow++) {
        const rowGoingRight = wellRow % 2 === 0;

        for (let wellColStep = 0; wellColStep < wellsPerBlockCol; wellColStep++) {
          const wellCol = rowGoingRight
            ? wellColStep
            : wellsPerBlockCol - 1 - wellColStep;

          const visualRow = blockRow * wellsPerBlockRow + wellRow;
          const visualCol = blockCol * wellsPerBlockCol + wellCol;

          map[visualRow][visualCol] = dataIndex;
          dataIndex++;
        }
      }
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
  width = 800,
  height = 800,
}: PlateHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wellMapRef = useRef<number[][] | null>(null);
  const [tooltip, setTooltip] = useState<{
    value: number;
    dataIndex: number;
    x: number;
    y: number;
  } | null>(null);

  const totalRows = blockRows * wellsPerBlockRow;
  const totalCols = blockCols * wellsPerBlockCol;
  const cellWidth = width / totalCols;
  const cellHeight = height / totalRows;

  // Build well map once
  if (!wellMapRef.current) {
    wellMapRef.current = buildWellMap(blockRows, blockCols, wellsPerBlockRow, wellsPerBlockCol);
  }
  const wellMap = wellMapRef.current;

  // Draw the heatmap
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const min = Math.min(...data);
    const max = Math.max(...data);

    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    // Draw wells
    for (let row = 0; row < totalRows; row++) {
      for (let col = 0; col < totalCols; col++) {
        const dataIndex = wellMap[row][col];
        const value = data[dataIndex] ?? 0;
        const [r, g, b] = valueToColor(value, min, max);

        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(
          col * cellWidth,
          row * cellHeight,
          cellWidth,
          cellHeight
        );
      }
    }

    // Draw block borders
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;

    for (let blockRow = 0; blockRow <= blockRows; blockRow++) {
      const y = blockRow * wellsPerBlockRow * cellHeight;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    for (let blockCol = 0; blockCol <= blockCols; blockCol++) {
      const x = blockCol * wellsPerBlockCol * cellWidth;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  }, [data, width, height, totalRows, totalCols, cellWidth, cellHeight, wellMap, blockRows, blockCols, wellsPerBlockRow, wellsPerBlockCol]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const col = Math.floor(x / cellWidth);
    const row = Math.floor(y / cellHeight);

    if (row >= 0 && row < totalRows && col >= 0 && col < totalCols) {
      const dataIndex = wellMap[row][col];
      const value = data[dataIndex] ?? 0;

      setTooltip({
        value,
        dataIndex,
        x: e.clientX,
        y: e.clientY,
      });
    }
  }, [cellWidth, cellHeight, totalRows, totalCols, wellMap, data]);

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  const min = data.length > 0 ? Math.min(...data) : 0;
  const max = data.length > 0 ? Math.max(...data) : 1;

  return (
    <div className="plate-heatmap-container">
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
            left: tooltip.x,
            top: tooltip.y - 40,
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
