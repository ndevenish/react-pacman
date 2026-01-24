import { useMemo, useState } from 'react';
import { PlateHeatmap } from './components/PlateHeatmap';
import './App.css';

type DataMode = 'linear' | 'linear-subset' | 'random';

// Subset of blocks for the "linear-subset" mode
const SUBSET_BLOCKS = [0, 1, 2, 8, 9, 16, 17, 18, 24, 32, 40, 48, 56, 57, 58, 59, 60, 61, 62, 63];

function App() {
  const [dataMode, setDataMode] = useState<DataMode>('linear');

  const { data, activeBlocks } = useMemo(() => {
    const totalWells = 25600;

    switch (dataMode) {
      case 'linear':
        return {
          data: Array.from({ length: totalWells }, (_, i) => i + 1),
          activeBlocks: undefined,
        };

      case 'linear-subset':
        return {
          data: Array.from({ length: totalWells }, (_, i) => i + 1),
          activeBlocks: SUBSET_BLOCKS,
        };

      case 'random':
        return {
          data: Array.from({ length: totalWells }, () => Math.random() * 1000),
          activeBlocks: undefined,
        };

      default:
        return {
          data: Array.from({ length: totalWells }, (_, i) => i + 1),
          activeBlocks: undefined,
        };
    }
  }, [dataMode]);

  return (
    <div className="app">
      <h1>Perforated Plate Heatmap</h1>
      <p className="description">
        8×8 blocks, each with 20×20 wells (25,600 total)
      </p>

      <div className="controls">
        <label htmlFor="data-mode">Data Mode: </label>
        <select
          id="data-mode"
          value={dataMode}
          onChange={(e) => setDataMode(e.target.value as DataMode)}
        >
          <option value="linear">Linear (1-25600)</option>
          <option value="linear-subset">Linear with Subset of Blocks</option>
          <option value="random">Random</option>
        </select>
      </div>

      <PlateHeatmap data={data} activeBlocks={activeBlocks} />
    </div>
  );
}

export default App;
