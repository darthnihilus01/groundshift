import type { Alert, Watch } from '../types'

type DetailSelection =
  | { type: 'alert'; data: Alert }
  | { type: 'watch'; data: Watch }

interface DetailPanelProps {
  selection: DetailSelection | null
  onClose: () => void
}

export default function DetailPanel({ selection, onClose }: DetailPanelProps) {
  if (!selection) {
    return null
  }

  const isAlert = selection.type === 'alert'
  const alert = isAlert ? selection.data : null
  const watch = !isAlert ? selection.data : null

  return (
    <section className="detail-panel panel">
      <header className="detail-header">
        <span className="panel-header">DETAIL PANEL</span>
        <button type="button" className="close-btn" onClick={onClose}>
          CLOSE
        </button>
      </header>
      <div className="detail-grid mono">
        <div>LOCATION</div>
        <div>{alert?.location ?? 'N/A'}</div>
        <div>CHANGE SCORE</div>
        <div>{alert ? alert.change_score.toFixed(2) : watch?.threshold.toFixed(2) ?? 'N/A'}</div>
        <div>PROBABLE CAUSE</div>
        <div>{alert?.probable_cause ?? watch?.description ?? 'N/A'}</div>
        <div>FIRED AT</div>
        <div>{alert?.fired_at ?? watch?.created_at ?? 'N/A'}</div>
        <div>WATCH NAME</div>
        <div>{alert?.watch_name ?? watch?.name ?? 'N/A'}</div>
      </div>
      <button type="button" className="action-btn export-btn">
        EXPORT GEOJSON
      </button>
    </section>
  )
}
