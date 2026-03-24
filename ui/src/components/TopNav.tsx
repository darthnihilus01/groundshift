import React from 'react';
import { TabType } from '../types';

interface TopNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const TopNav: React.FC<TopNavProps> = ({ activeTab, onTabChange }) => {
  const tabs: { id: TabType; label: string }[] = [
    { id: 'tacmap', label: 'TACMAP' },
    { id: 'watches', label: 'WATCHES' },
    { id: 'alerts', label: 'ALERTS' },
    { id: 'database', label: 'DATABASE' },
  ];

  const now = new Date();
  const utcTime = now.toLocaleTimeString('en-US', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC'
  });

  return (
    <div className="top-nav">
      <div className="logo-box">GS</div>
      
      <div className="nav-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="status-area">
        <div className="utc-clock">{utcTime} UTC</div>
        <div className="status-dot"></div>
      </div>
    </div>
  );
};

export default TopNav;
