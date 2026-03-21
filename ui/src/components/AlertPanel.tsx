import { useEffect, useMemo, useState } from 'react'

import type { Alert } from '../types'

interface AlertPanelProps {
  onAlertSelect: (alert: Alert) => void
}

const severityColor: Record<Alert['severity'], string> = {
  critical: '#ff3333',
  moderate: '#ffaa00',
  low: '#ffff00',
}

function formatTimeAgo(isoDate: string): string {
  const now = Date.now()
  const then = new Date(isoDate).getTime()
  const diffMs = Math.max(0, now - then)

  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'JUST NOW'
  if (mins < 60) return `${mins}M AGO`

  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}H AGO`

  const days = Math.floor(hours / 24)
  return `${days}D AGO`
}

export default function AlertPanel({ onAlertSelect }: AlertPanelProps) {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [socketConnected, setSocketConnected] = useState(false)

  useEffect(() => {
    let isMounted = true

    const fetchAlerts = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/alerts')
        if (!response.ok) {
          throw new Error('Failed to load alerts')
        }

        const data: Alert[] = await response.json()
        if (isMounted) {
          const sorted = [...data].sort(
            (a, b) => new Date(b.fired_at).getTime() - new Date(a.fired_at).getTime(),
          )
          setAlerts(sorted)
        }
      } catch {
        if (isMounted) {
          setAlerts([])
        }
      }
    }

    fetchAlerts()
    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8000/ws/alerts')

    ws.onopen = () => {
      setSocketConnected(true)
      ws.send('ping')
    }

    ws.onmessage = (event) => {
      try {
        const incoming = JSON.parse(event.data) as Alert
        setAlerts((previous) => {
          const deduped = previous.filter((item) => item.id !== incoming.id)
          return [incoming, ...deduped].sort(
            (a, b) => new Date(b.fired_at).getTime() - new Date(a.fired_at).getTime(),
          )
        })
      } catch {
        // Ignore non-alert messages.
      }
    }

    ws.onclose = () => {
      setSocketConnected(false)
    }

    ws.onerror = () => {
      setSocketConnected(false)
    }

    const keepAliveId = window.setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send('ping')
      }
    }, 15000)

    return () => {
      window.clearInterval(keepAliveId)
      ws.close()
    }
  }, [])

  const sortedAlerts = useMemo(
    () =>
      [...alerts].sort((a, b) => new Date(b.fired_at).getTime() - new Date(a.fired_at).getTime()),
    [alerts],
  )

  return (
    <aside className="panel alert-panel">
      <header className="panel-header alert-header">
        <span>ALERT FEED</span>
        <span className={`live-dot ${socketConnected ? 'on' : 'off'}`} />
      </header>
      <div className="panel-body">
        {sortedAlerts.length === 0 && <div className="meta">NO ALERTS</div>}
        {sortedAlerts.map((alert) => (
          <button
            key={alert.id}
            type="button"
            className="alert-card"
            onClick={() => onAlertSelect(alert)}
          >
            <div className="alert-card-top">
              <span className="severity-badge mono" style={{ color: severityColor[alert.severity] }}>
                {alert.severity.toUpperCase()}
              </span>
              <span className="mono meta">{formatTimeAgo(alert.fired_at)}</span>
            </div>
            <div className="mono alert-location">{alert.location}</div>
            <div className="mono meta">CHANGE SCORE {alert.change_score.toFixed(2)}</div>
          </button>
        ))}
      </div>
    </aside>
  )
}
