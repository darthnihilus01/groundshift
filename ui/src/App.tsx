import React, { useState, useEffect, useCallback } from 'react';
import TopNav from './components/TopNav';
import MapView from './components/MapView';
import LeftPanel from './components/LeftPanel';
import RightPanel from './components/RightPanel';
import BottomBar from './components/BottomBar';
import DetailPanel from './components/DetailPanel';
import { TabType, Watch, Alert, LayerState } from './types';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('tacmap');
  const [watches, setWatches] = useState<Watch[]>([
    {
      id: '1',
      name: 'BENGALURU NORTH',
      threshold: 0.30,
      active: true,
    },
    {
      id: '2',
      name: 'RONDÔNIA REGION',
      threshold: 0.45,
      active: true,
    },
  ]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [selectedWatch, setSelectedWatch] = useState<Watch | null>(null);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);
  const [layers, setLayers] = useState<LayerState[]>([
    { id: 'anomalies', label: 'ANOMALIES', active: true, count: 0 },
    { id: 'flights', label: 'FLIGHTS', active: false, count: 0 },
    { id: 'news', label: 'NEWS', active: false, count: 0 },
  ]);

  // WebSocket connection for alerts
  useEffect(() => {
    const connectWebSocket = () => {
      try {
        const ws = new WebSocket('ws://localhost:8000/ws/alerts');
        
        ws.onmessage = (event) => {
          const alert = JSON.parse(event.data) as Alert;
          setAlerts((prev) => [alert, ...prev]);
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
        };

        return () => {
          ws.close();
        };
      } catch (error) {
        console.error('Failed to connect to WebSocket:', error);
      }
    };

    const cleanup = connectWebSocket();
    return cleanup;
  }, []);

  const handleSelectAlert = useCallback((alert: Alert) => {
    setSelectedAlert(alert);
    setDetailPanelOpen(true);
  }, []);

  const handleSelectWatch = useCallback((watch: Watch) => {
    setSelectedWatch(watch);
  }, []);

  const handleToggleLayer = useCallback((layerId: string) => {
    setLayers((prev) =>
      prev.map((layer) =>
        layer.id === layerId ? { ...layer, active: !layer.active } : layer
      )
    );
  }, []);

  const handleAddArea = useCallback(() => {
    // This will be handled later with a modal
    alert('Add Area feature coming soon');
  }, []);

  return (
    <div className="app-container">
      <TopNav activeTab={activeTab} onTabChange={setActiveTab} />
      
      <div className="main-content">
        <LeftPanel
          watches={watches}
          selectedWatch={selectedWatch}
          onSelectWatch={handleSelectWatch}
          onAddArea={handleAddArea}
        />
        
        <div className="center-panel">
          <MapView />
        </div>
        
        <RightPanel
          alerts={alerts}
          selectedAlert={selectedAlert}
          onSelectAlert={handleSelectAlert}
        />
      </div>

      <BottomBar
        layers={layers}
        onToggleLayer={handleToggleLayer}
      />

      {detailPanelOpen && selectedAlert && (
        <DetailPanel
          alert={selectedAlert}
          onClose={() => {
            setDetailPanelOpen(false);
            setSelectedAlert(null);
          }}
        />
      )}
    </div>
  );
};

export default App;
