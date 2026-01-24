import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { PlateHeatmap } from './components/PlateHeatmap';
import './App.css';

type DataMode = 'linear' | 'linear-subset' | 'random' | 'streaming';

const SUBSET_BLOCKS = [0, 1, 2, 8, 9, 16, 17, 18, 24, 32, 40, 48, 56, 57, 58, 59, 60, 61, 62, 63];
const TOTAL_WELLS = 25600;
const STREAM_RATE = 100; // wells per second

function App() {
  const [dataMode, setDataMode] = useState<DataMode>('linear');
  const [streamingData, setStreamingData] = useState<number[]>([]);
  const intervalRef = useRef<number | null>(null);

  const stopStreaming = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startStreaming = useCallback(() => {
    setStreamingData([]);
    stopStreaming();

    intervalRef.current = window.setInterval(() => {
      setStreamingData(prev => {
        if (prev.length >= TOTAL_WELLS) {
          stopStreaming();
          return prev;
        }
        // Add next value (1-indexed, like linear mode)
        return [...prev, prev.length + 1];
      });
    }, 1000 / STREAM_RATE);
  }, [stopStreaming]);

  // Handle mode changes
  useEffect(() => {
    if (dataMode === 'streaming') {
      startStreaming();
    } else {
      stopStreaming();
      setStreamingData([]);
    }

    return () => stopStreaming();
  }, [dataMode, startStreaming, stopStreaming]);

  const { data, activeBlocks } = useMemo(() => {
    switch (dataMode) {
      case 'linear':
        return {
          data: Array.from({ length: TOTAL_WELLS }, (_, i) => i + 1),
          activeBlocks: undefined,
        };

      case 'linear-subset':
        return {
          data: Array.from({ length: TOTAL_WELLS }, (_, i) => i + 1),
          activeBlocks: SUBSET_BLOCKS,
        };

      case 'random':
        return {
          data: Array.from({ length: TOTAL_WELLS }, () => Math.random() * 1000),
          activeBlocks: undefined,
        };

      case 'streaming':
        return {
          data: streamingData,
          activeBlocks: undefined,
        };

      default:
        return {
          data: Array.from({ length: TOTAL_WELLS }, (_, i) => i + 1),
          activeBlocks: undefined,
        };
    }
  }, [dataMode, streamingData]);

  const handleModeChange = (newMode: DataMode) => {
    setDataMode(newMode);
  };

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
          onChange={(e) => handleModeChange(e.target.value as DataMode)}
        >
          <option value="linear">Linear (1-25600)</option>
          <option value="linear-subset">Linear with Subset of Blocks</option>
          <option value="random">Random</option>
          <option value="streaming">Streaming (100/sec)</option>
        </select>

        {dataMode === 'streaming' && (
          <>
            <span className="stream-count">{streamingData.length.toLocaleString()} / {TOTAL_WELLS.toLocaleString()}</span>
            <button onClick={startStreaming}>Restart</button>
          </>
        )}
      </div>

      <PlateHeatmap data={data} activeBlocks={activeBlocks} />
    </div>
  );
}

export default App;
