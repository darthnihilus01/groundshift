import React from 'react';
import { LayerState } from '../types';

interface BottomBarProps {
  layers: LayerState[];
  onToggleLayer: (layerId: string) => void;
}

const BottomBar: React.FC<BottomBarProps> = ({ layers, onToggleLayer }) => {
  const now = new Date();
  const utcTime = now.toLocaleTimeString('en-US', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit',
    timeZone: 'UTC'
  });

  return (
    <div className="bottom-bar">
      <div className="bottom-bar-section">
        {layers.map((layer) => (
          <button
            key={layer.id}
            className={`layer-toggle ${layer.active ? 'active' : ''}`}
            onClick={() => onToggleLayer(layer.id)}
            title={`Toggle ${layer.label}`}
          >
            {layer.label}: {layer.count ?? 0}
          </button>
        ))}
      </div>

      <div className="bottom-bar-section system-status">
        GROUNDSHIFT TACMAP v0.1 // SYSTEM NOMINAL
      </div>

      <div className="bottom-bar-section pipeline-status">
        PIPELINE ONLINE ▶
      </div>
    </div>
  );
};

export default BottomBar;
