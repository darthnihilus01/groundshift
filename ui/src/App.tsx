import { useState } from 'react'

import AlertPanel from './components/AlertPanel'
import DetailPanel from './components/DetailPanel'
import MapView from './components/MapView'
import WatchPanel from './components/WatchPanel'
import type { Alert, Watch } from './types'

type DetailSelection =
  | { type: 'alert'; data: Alert }
  | { type: 'watch'; data: Watch }
  | null

function App() {
  const [selectedWatch, setSelectedWatch] = useState<Watch | null>(null)
  const [selection, setSelection] = useState<DetailSelection>(null)

  const handleWatchSelect = (watch: Watch) => {
    setSelectedWatch(watch)
    setSelection({ type: 'watch', data: watch })
  }

  const handleAlertSelect = (alert: Alert) => {
    setSelection({ type: 'alert', data: alert })
  }

  return (
    <main className="dashboard-shell">
      <section className="dashboard-main-row">
        <WatchPanel selectedWatchId={selectedWatch?.id ?? null} onWatchSelect={handleWatchSelect} />
        <section className="center-panel panel">
          <MapView selectedWatch={selectedWatch} />
        </section>
        <AlertPanel onAlertSelect={handleAlertSelect} />
      </section>
      <DetailPanel selection={selection} onClose={() => setSelection(null)} />
    </main>
  )
}

export default App
