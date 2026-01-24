import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { PlateHeatmap } from './components/PlateHeatmap';
import './App.css';

type DataMode = 'linear' | 'linear-subset' | 'random' | 'streaming';

const SUBSET_BLOCKS = [0, 1, 2, 8, 9, 16, 17, 18, 24, 32, 40, 48, 56, 57, 58, 59, 60, 61, 62, 63];
const TOTAL_WELLS = 25600;
const STREAM_RATE = 100; // wells per second
const STREAM_BATCH_SIZE = 5; // Add multiple wells per tick for efficiency

function App() {
  const [dataMode, setDataMode] = useState<DataMode>('linear');
  const [streamingCount, setStreamingCount] = useState(0);
  const intervalRef = useRef<number | null>(null);

  // Pre-allocate streaming data array once
  const streamingDataRef = useRef<number[]>([]);

  const stopStreaming = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startStreaming = useCallback(() => {
    // Pre-allocate the full array
    streamingDataRef.current = new Array(TOTAL_WELLS);
    for (let i = 0; i < TOTAL_WELLS; i++) {
      streamingDataRef.current[i] = i + 1;
    }
    setStreamingCount(0);
    stopStreaming();

    intervalRef.current = window.setInterval(() => {
      setStreamingCount(prev => {
        const next = Math.min(prev + STREAM_BATCH_SIZE, TOTAL_WELLS);
        if (next >= TOTAL_WELLS) {
          stopStreaming();
        }
        return next;
      });
    }, (1000 / STREAM_RATE) * STREAM_BATCH_SIZE);
  }, [stopStreaming]);

  useEffect(() => {
    if (dataMode === 'streaming') {
      startStreaming();
    } else {
      stopStreaming();
      setStreamingCount(0);
    }

    return () => stopStreaming();
  }, [dataMode, startStreaming, stopStreaming]);

  const { data, activeBlocks, dataLength, minValue, maxValue } = useMemo(() => {
    switch (dataMode) {
      case 'linear':
        return {
          data: Array.from({ length: TOTAL_WELLS }, (_, i) => i + 1),
          activeBlocks: undefined,
          dataLength: TOTAL_WELLS,
          minValue: 1,
          maxValue: TOTAL_WELLS,
        };

      case 'linear-subset':
        return {
          data: Array.from({ length: TOTAL_WELLS }, (_, i) => i + 1),
          activeBlocks: SUBSET_BLOCKS,
          dataLength: TOTAL_WELLS,
          minValue: 1,
          maxValue: TOTAL_WELLS,
        };

      case 'random': {
        const randomData = Array.from({ length: TOTAL_WELLS }, () => Math.random() * 1000);
        return {
          data: randomData,
          activeBlocks: undefined,
          dataLength: TOTAL_WELLS,
          minValue: Math.min(...randomData),
          maxValue: Math.max(...randomData),
        };
      }

      case 'streaming':
        return {
          data: streamingDataRef.current,
          activeBlocks: undefined,
          dataLength: streamingCount,
          minValue: 1,
          maxValue: TOTAL_WELLS,
        };

      default:
        return {
          data: Array.from({ length: TOTAL_WELLS }, (_, i) => i + 1),
          activeBlocks: undefined,
          dataLength: TOTAL_WELLS,
          minValue: 1,
          maxValue: TOTAL_WELLS,
        };
    }
  }, [dataMode, streamingCount]);

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
            <span className="stream-count">{streamingCount.toLocaleString()} / {TOTAL_WELLS.toLocaleString()}</span>
            <button onClick={startStreaming}>Restart</button>
          </>
        )}
      </div>

      <PlateHeatmap
        data={data}
        dataLength={dataLength}
        activeBlocks={activeBlocks}
        minValue={minValue}
        maxValue={maxValue}
      />
    </div>
  );
}

export default App;
