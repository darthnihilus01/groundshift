import React from 'react';
import { useEffect, useState } from 'react';
import type { TabType } from '../types';

interface TopNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const TopNav: React.FC<TopNavProps> = ({ activeTab, onTabChange }) => {
  const [utcTime, setUtcTime] = useState('00:00:00');
  const tabs: { id: TabType; label: string }[] = [
    { id: 'tacmap', label: 'TACMAP' },
    { id: 'watches', label: 'WATCHES' },
    { id: 'alerts', label: 'ALERTS' },
    { id: 'database', label: 'DATABASE' },
  ];

  useEffect(() => {
    const update = () => {
      setUtcTime(
        new Date().toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZone: 'UTC',
        }),
      );
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="top-nav">
      <div className="nav-keycap">[Q]</div>
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
        <span className="top-status-label">SYS</span>
        <div className="status-dot"></div>
      </div>
      <div className="nav-keycap">[E]</div>
    </div>
  );
};

export default TopNav;
