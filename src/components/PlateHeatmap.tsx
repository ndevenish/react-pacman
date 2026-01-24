import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import './PlateHeatmap.css';

interface PlateHeatmapProps {
  data: number[];
  blockRows?: number;
  blockCols?: number;
  wellsPerBlockRow?: number;
  wellsPerBlockCol?: number;
  blockGapWells?: number; // Gap between blocks in well-units
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

function buildWellMap(
  blockRows: number,
  blockCols: number,
  wellsPerBlockRow: number,
  wellsPerBlockCol: number
): number[][] {
  const map: number[][] = [];
  for (let r = 0; r < blockRows * wellsPerBlockRow; r++) {
    map[r] = new Array(blockCols * wellsPerBlockCol).fill(-1);
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

          const mapRow = blockRow * wellsPerBlockRow + wellRow;
          const mapCol = blockCol * wellsPerBlockCol + wellCol;

          map[mapRow][mapCol] = dataIndex;
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
  blockGapWells = 6.4,
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

  const wellMap = useMemo(
    () => buildWellMap(blockRows, blockCols, wellsPerBlockRow, wellsPerBlockCol),
    [blockRows, blockCols, wellsPerBlockRow, wellsPerBlockCol]
  );

  // Calculate dimensions accounting for gaps
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

    const min = Math.min(...data);
    const max = Math.max(...data);

    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    // Draw wells block by block
    for (let blockRow = 0; blockRow < blockRows; blockRow++) {
      for (let blockCol = 0; blockCol < blockCols; blockCol++) {
        const blockOffsetX = blockCol * (blockPixelWidth + gapWidth);
        const blockOffsetY = blockRow * (blockPixelHeight + gapHeight);

        for (let wellRow = 0; wellRow < wellsPerBlockRow; wellRow++) {
          for (let wellCol = 0; wellCol < wellsPerBlockCol; wellCol++) {
            const mapRow = blockRow * wellsPerBlockRow + wellRow;
            const mapCol = blockCol * wellsPerBlockCol + wellCol;
            const dataIndex = wellMap[mapRow][mapCol];
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
    }
  }, [data, width, height, wellMap, blockRows, blockCols, wellsPerBlockRow, wellsPerBlockCol, cellWidth, cellHeight, blockPixelWidth, blockPixelHeight, gapWidth, gapHeight]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Determine which block we're in
    const blockStepX = blockPixelWidth + gapWidth;
    const blockStepY = blockPixelHeight + gapHeight;

    const blockCol = Math.floor(x / blockStepX);
    const blockRow = Math.floor(y / blockStepY);

    // Check if we're in a valid block
    if (blockCol < 0 || blockCol >= blockCols || blockRow < 0 || blockRow >= blockRows) {
      setTooltip(null);
      return;
    }

    // Check if we're in the gap
    const xInBlock = x - blockCol * blockStepX;
    const yInBlock = y - blockRow * blockStepY;

    if (xInBlock > blockPixelWidth || yInBlock > blockPixelHeight) {
      setTooltip(null);
      return;
    }

    // Determine which well within the block
    const wellCol = Math.floor(xInBlock / cellWidth);
    const wellRow = Math.floor(yInBlock / cellHeight);

    if (wellCol < 0 || wellCol >= wellsPerBlockCol || wellRow < 0 || wellRow >= wellsPerBlockRow) {
      setTooltip(null);
      return;
    }

    const mapRow = blockRow * wellsPerBlockRow + wellRow;
    const mapCol = blockCol * wellsPerBlockCol + wellCol;
    const dataIndex = wellMap[mapRow][mapCol];
    const value = data[dataIndex] ?? 0;

    setTooltip({
      value,
      dataIndex,
      x: e.clientX,
      y: e.clientY,
    });
  }, [cellWidth, cellHeight, blockPixelWidth, blockPixelHeight, gapWidth, gapHeight, blockRows, blockCols, wellsPerBlockRow, wellsPerBlockCol, wellMap, data]);

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
