import { useState, useMemo } from 'react';
import './PlateHeatmap.css';

interface PlateHeatmapProps {
  data: number[];
  blockRows?: number;
  blockCols?: number;
  wellsPerBlockRow?: number;
  wellsPerBlockCol?: number;
}

function valueToColor(value: number, min: number, max: number): string {
  const normalized = (value - min) / (max - min);
  // Blue to Red gradient through green/yellow
  const hue = (1 - normalized) * 240; // 240 (blue) to 0 (red)
  return `hsl(${hue}, 80%, 50%)`;
}

export function PlateHeatmap({
  data,
  blockRows = 8,
  blockCols = 8,
  wellsPerBlockRow = 20,
  wellsPerBlockCol = 20,
}: PlateHeatmapProps) {
  const [hoveredWell, setHoveredWell] = useState<{
    value: number;
    dataIndex: number;
    x: number;
    y: number;
  } | null>(null);

  // Create a mapping from visual position to data index
  const wellMap = useMemo(() => {
    const map: number[][] = [];
    const totalVisualRows = blockRows * wellsPerBlockRow;
    const totalVisualCols = blockCols * wellsPerBlockCol;

    // Initialize the map
    for (let r = 0; r < totalVisualRows; r++) {
      map[r] = new Array(totalVisualCols).fill(0);
    }

    let dataIndex = 0;

    // Iterate through blocks in column-major order with snaking
    for (let blockCol = 0; blockCol < blockCols; blockCol++) {
      const colGoingDown = blockCol % 2 === 0;

      for (let blockRowStep = 0; blockRowStep < blockRows; blockRowStep++) {
        const blockRow = colGoingDown
          ? blockRowStep
          : blockRows - 1 - blockRowStep;

        // Within this block, snake through wells
        for (let wellRow = 0; wellRow < wellsPerBlockRow; wellRow++) {
          const rowGoingRight = wellRow % 2 === 0;

          for (let wellColStep = 0; wellColStep < wellsPerBlockCol; wellColStep++) {
            const wellCol = rowGoingRight
              ? wellColStep
              : wellsPerBlockCol - 1 - wellColStep;

            // Calculate visual position
            const visualRow = blockRow * wellsPerBlockRow + wellRow;
            const visualCol = blockCol * wellsPerBlockCol + wellCol;

            map[visualRow][visualCol] = dataIndex;
            dataIndex++;
          }
        }
      }
    }

    return map;
  }, [blockRows, blockCols, wellsPerBlockRow, wellsPerBlockCol]);

  const { min, max } = useMemo(() => {
    if (data.length === 0) return { min: 0, max: 1 };
    return {
      min: Math.min(...data),
      max: Math.max(...data),
    };
  }, [data]);

  const totalVisualRows = blockRows * wellsPerBlockRow;
  const totalVisualCols = blockCols * wellsPerBlockCol;

  return (
    <div className="plate-heatmap-container">
      <div
        className="plate-heatmap"
        style={{
          gridTemplateColumns: `repeat(${totalVisualCols}, 1fr)`,
          gridTemplateRows: `repeat(${totalVisualRows}, 1fr)`,
        }}
      >
        {Array.from({ length: totalVisualRows }, (_, row) =>
          Array.from({ length: totalVisualCols }, (_, col) => {
            const dataIndex = wellMap[row][col];
            const value = data[dataIndex] ?? 0;
            const color = valueToColor(value, min, max);

            // Add block border styling
            const isBlockTopEdge = row % wellsPerBlockRow === 0;
            const isBlockLeftEdge = col % wellsPerBlockCol === 0;
            const isBlockBottomEdge = row % wellsPerBlockRow === wellsPerBlockRow - 1;
            const isBlockRightEdge = col % wellsPerBlockCol === wellsPerBlockCol - 1;

            return (
              <div
                key={`${row}-${col}`}
                className={`well ${isBlockTopEdge ? 'block-top' : ''} ${isBlockLeftEdge ? 'block-left' : ''} ${isBlockBottomEdge ? 'block-bottom' : ''} ${isBlockRightEdge ? 'block-right' : ''}`}
                style={{ backgroundColor: color }}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setHoveredWell({
                    value,
                    dataIndex,
                    x: rect.left + rect.width / 2,
                    y: rect.top,
                  });
                }}
                onMouseLeave={() => setHoveredWell(null)}
              />
            );
          })
        )}
      </div>

      {hoveredWell && (
        <div
          className="tooltip"
          style={{
            left: hoveredWell.x,
            top: hoveredWell.y - 10,
          }}
        >
          <div className="tooltip-value">{hoveredWell.value}</div>
          <div className="tooltip-index">Index: {hoveredWell.dataIndex}</div>
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
