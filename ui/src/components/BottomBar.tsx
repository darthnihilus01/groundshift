import React from 'react';
import type { LayerId } from '../types';

interface BottomBarProps {
  activeLayers: LayerId[];
  counts: Record<LayerId, number>;
  onToggleLayer: (layerId: LayerId) => void;
}

const BottomBar: React.FC<BottomBarProps> = ({ activeLayers, counts, onToggleLayer }) => {
  const layerMeta: Array<{ id: LayerId; icon: string; label: string }> = [
    { id: 'flights', icon: '✈', label: 'FLIGHTS' },
    { id: 'anomalies', icon: '📡', label: 'ANOMALIES' },
    { id: 'news', icon: '📰', label: 'NEWS' },
  ];

  return (
    <div className="bottom-bar">
      <div className="bottom-bar-section">
        {layerMeta.map((layer) => (
          <button
            key={layer.id}
            className={`layer-toggle ${activeLayers.includes(layer.id) ? 'active' : ''}`}
            onClick={() => onToggleLayer(layer.id)}
            title={`Toggle ${layer.label}`}
          >
            {layer.icon} {layer.label}: {counts[layer.id] ?? 0}
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
