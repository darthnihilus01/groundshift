import { useEffect, useState } from 'react'

import type { Watch } from '../types'

interface WatchPanelProps {
  selectedWatchId: string | null
  onWatchSelect: (watch: Watch) => void
}

export default function WatchPanel({ selectedWatchId, onWatchSelect }: WatchPanelProps) {
  const [watches, setWatches] = useState<Watch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    const fetchWatches = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/watches')
        if (!response.ok) {
          throw new Error('Failed to load watches')
        }

        const data: Watch[] = await response.json()
        if (isMounted) {
          setWatches(data)
          setError(null)
        }
      } catch {
        if (isMounted) {
          setError('Unable to reach watch service')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    fetchWatches()
    const intervalId = window.setInterval(fetchWatches, 10000)

    return () => {
      isMounted = false
      window.clearInterval(intervalId)
    }
  }, [])

  return (
    <aside className="panel watch-panel">
      <header className="panel-header">WATCHES</header>
      <div className="panel-body">
        {loading && <div className="meta">LOADING WATCHES...</div>}
        {error && <div className="meta error">{error}</div>}
        {!loading && !error && watches.length === 0 && <div className="meta">NO WATCHES YET</div>}
        {watches.map((watch) => (
          <button
            key={watch.id}
            type="button"
            className={`watch-item ${selectedWatchId === watch.id ? 'selected' : ''}`}
            onClick={() => onWatchSelect(watch)}
          >
            <div className="watch-item-top">
              <span className="watch-name mono">{watch.name}</span>
              <span className={`status-dot ${watch.active ? 'active' : 'inactive'}`} />
            </div>
            <div className="watch-item-sub mono">THR {watch.threshold.toFixed(2)}</div>
          </button>
        ))}
      </div>
      <button type="button" className="action-btn">
        + ADD WATCH
      </button>
    </aside>
  )
}
