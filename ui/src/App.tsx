import { useEffect, useState } from 'react'

import AlertPanel from './components/AlertPanel'
import DetailPanel from './components/DetailPanel'
import MapView from './components/MapView'
import WatchPanel from './components/WatchPanel'
import type { Alert, LayerId, Watch } from './types'

type DetailSelection =
  | { type: 'alert'; data: Alert }
  | { type: 'watch'; data: Watch }
  | null

function App() {
  const [selectedWatch, setSelectedWatch] = useState<Watch | null>(null)
  const [selection, setSelection] = useState<DetailSelection>(null)
  const [activeLayers, setActiveLayers] = useState<LayerId[]>(['anomalies'])
  const [alerts, setAlerts] = useState<Alert[]>([])

  useEffect(() => {
    let mounted = true

    const fetchAlerts = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/alerts')
        if (!response.ok) {
          throw new Error('Failed to load alerts')
        }

        const data = (await response.json()) as Alert[]
        if (mounted) {
          setAlerts(data)
        }
      } catch {
        if (mounted) {
          setAlerts([])
        }
      }
    }

    fetchAlerts()
    const pollId = window.setInterval(fetchAlerts, 15000)

    return () => {
      mounted = false
      window.clearInterval(pollId)
    }
  }, [])

  const handleWatchSelect = (watch: Watch) => {
    setSelectedWatch(watch)
    setSelection({ type: 'watch', data: watch })
  }

  const handleAlertSelect = (alert: Alert) => {
    setSelection({ type: 'alert', data: alert })
  }

  const toggleLayer = (layer: LayerId) => {
    setActiveLayers((previous) =>
      previous.includes(layer) ? previous.filter((item) => item !== layer) : [...previous, layer],
    )
  }

  return (
    <main className="dashboard-shell">
      <section className="dashboard-main-row">
        <WatchPanel selectedWatchId={selectedWatch?.id ?? null} onWatchSelect={handleWatchSelect} />
        <section className="center-panel panel">
          <div className="layer-toggle-bar">
            {(['anomalies', 'flights', 'news'] as LayerId[]).map((layer) => {
              const enabled = activeLayers.includes(layer)
              return (
                <button
                  key={layer}
                  type="button"
                  className="layer-toggle-btn"
                  style={{ color: enabled ? '#00ff88' : '#444444', borderColor: enabled ? '#00ff88' : '#444444' }}
                  onClick={() => toggleLayer(layer)}
                >
                  {layer.toUpperCase()}
                </button>
              )
            })}
          </div>
          <MapView
            activeLayers={activeLayers}
            alerts={alerts}
            onCountryClick={(country) => {
              console.info('Selected country', country)
            }}
          />
        </section>
        <AlertPanel onAlertSelect={handleAlertSelect} />
      </section>
      <DetailPanel selection={selection} onClose={() => setSelection(null)} />
    </main>
  )
}

export default App
