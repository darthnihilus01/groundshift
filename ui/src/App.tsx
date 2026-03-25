import React, { useCallback, useEffect, useMemo, useState } from 'react';
import TopNav from './components/TopNav';
import MapView from './components/MapView';
import LeftPanel from './components/LeftPanel';
import RightPanel from './components/RightPanel';
import BottomBar from './components/BottomBar';
import DetailPanel from './components/DetailPanel';
import type { Alert, LayerId, TabType, Watch } from './types';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('tacmap');
  const [activeLayers, setActiveLayers] = useState<LayerId[]>(['anomalies']);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const watches = useMemo<Watch[]>(() => [
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
  ], []);
  const [alerts, setAlerts] = useState<Alert[]>([
    {
      id: 'seed-1',
      severity: 'critical',
      score: 0.71,
      location: 'RONDONIA',
      country: 'BRAZIL',
      cause: 'NDVI LOSS',
      timestamp: new Date().toISOString(),
    },
  ]);
  const [selectedWatch, setSelectedWatch] = useState<Watch | null>(null);

  // WebSocket connection for alerts
  useEffect(() => {
    const connectWebSocket = () => {
      try {
        const ws = new WebSocket('ws://localhost:8000/ws/alerts');
        
        ws.onmessage = (event) => {
          const payload = JSON.parse(event.data) as Partial<Alert>;
          const alert: Alert = {
            id: payload.id ?? crypto.randomUUID(),
            severity: payload.severity ?? 'low',
            score: payload.score ?? payload.change_score ?? 0,
            change_score: payload.change_score,
            location: payload.location ?? 'UNKNOWN',
            country: payload.country,
            cause: payload.cause ?? payload.probable_cause ?? 'NDVI LOSS',
            timestamp: payload.timestamp ?? payload.fired_at ?? new Date().toISOString(),
            fired_at: payload.fired_at,
            latitude: payload.latitude,
            longitude: payload.longitude,
            before_image: payload.before_image,
            after_image: payload.after_image,
          };
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
    setSelectedCountry(alert.country ?? null);
  }, []);

  const handleSelectWatch = useCallback((watch: Watch) => {
    setSelectedWatch(watch);
  }, []);

  const handleToggleLayer = useCallback((layerId: LayerId) => {
    setActiveLayers((prev) =>
      prev.includes(layerId) ? prev.filter((id) => id !== layerId) : [...prev, layerId],
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
          <MapView
            selectedCountry={selectedCountry}
            onCountrySelect={(country) => {
              setSelectedCountry(country);
              setSelectedAlert(null);
            }}
          />
        </div>
        
        <RightPanel
          alerts={alerts}
          selectedAlert={selectedAlert}
          onSelectAlert={handleSelectAlert}
        />
      </div>

      <BottomBar
        activeLayers={activeLayers}
        counts={{
          flights: 0,
          anomalies: alerts.length,
          news: 0,
        }}
        onToggleLayer={handleToggleLayer}
      />

      {(selectedAlert || selectedCountry) && (
        <DetailPanel
          alert={selectedAlert}
          country={selectedCountry}
          onClose={() => {
            setSelectedAlert(null);
            setSelectedCountry(null);
          }}
        />
      )}
    </div>
  );
};

export default App;
