import React from 'react';
import { Watch } from '../types';

interface LeftPanelProps {
  watches: Watch[];
  selectedWatch: Watch | null;
  onSelectWatch: (watch: Watch) => void;
  onAddArea: () => void;
}

const LeftPanel: React.FC<LeftPanelProps> = ({
  watches,
  selectedWatch,
  onSelectWatch,
  onAddArea,
}) => {
  return (
    <div className="left-panel with-brackets">
      <div className="panel-header">
        ◈ MONITORED AREAS
      </div>

      <div className="panel-body">
        {watches.map((watch) => (
          <div
            key={watch.id}
            className={`watch-item ${selectedWatch?.id === watch.id ? 'selected' : ''}`}
            onClick={() => onSelectWatch(watch)}
          >
            <div className="watch-item-header">
              <span className="watch-item-icon">◆</span>
              <span className="watch-item-name">{watch.name}</span>
            </div>
            <div className="watch-item-meta">
              <div className="watch-item-row">
                <span>THRESHOLD</span>
                <span>{(watch.threshold * 100).toFixed(0)}%</span>
              </div>
              <div className="watch-item-row">
                <span>STATUS</span>
                <span className="watch-item-status">
                  <span className={`status-indicator ${watch.active ? 'active' : ''}`}></span>
                  {watch.active ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>
            </div>
          </div>
        ))}

        <button className="add-area-btn" onClick={onAddArea}>
          ＋ ADD AREA
        </button>
      </div>
    </div>
  );
};

export default LeftPanel;
