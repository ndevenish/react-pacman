import { useMemo } from 'react';
import { PlateHeatmap } from './components/PlateHeatmap';
import './App.css';

function App() {
  // Generate example data: 1 to 25600
  const data = useMemo(() => {
    return Array.from({ length: 25600 }, (_, i) => i + 1);
  }, []);

  return (
    <div className="app">
      <h1>Perforated Plate Heatmap</h1>
      <p className="description">
        8×8 blocks, each with 20×20 wells (25,600 total)
      </p>
      <PlateHeatmap data={data} />
    </div>
  );
}

export default App;
