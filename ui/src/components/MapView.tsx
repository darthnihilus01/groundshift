import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import type { LayerState, Watch } from '../types'

interface MapViewProps {
  selectedWatch: Watch | null
}

const DEFAULT_LAYERS: LayerState[] = [
  { id: 'anomalies', label: 'ANOMALIES', active: true, color: '#00ff88' },
  { id: 'flights', label: 'FLIGHTS', active: false, color: '#444444' },
  { id: 'news', label: 'NEWS', active: false, color: '#444444' },
]

export default function MapView({ selectedWatch }: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [layers, setLayers] = useState<LayerState[]>(DEFAULT_LAYERS)

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [0, 20],
      zoom: 2,
      attributionControl: false,
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  const activeLayers = useMemo(
    () => layers.filter((layer) => layer.active).map((layer) => layer.label),
    [layers],
  )

  const toggleLayer = (id: LayerState['id']) => {
    setLayers((previous) =>
      previous.map((layer) =>
        layer.id === id
          ? {
              ...layer,
              active: !layer.active,
              color: !layer.active ? '#00ff88' : '#444444',
            }
          : layer,
      ),
    )
  }

  return (
    <div className="map-wrap">
      <div className="layer-toggle-bar">
        {layers.map((layer) => (
          <button
            key={layer.id}
            type="button"
            className="layer-toggle-btn"
            style={{ color: layer.color, borderColor: layer.color }}
            onClick={() => toggleLayer(layer.id)}
          >
            {layer.label}
          </button>
        ))}
      </div>
      <div ref={mapContainerRef} className="map-canvas" />
      <div className="map-status mono">
        <div>ACTIVE LAYERS: {activeLayers.join(' | ') || 'NONE'}</div>
        {selectedWatch ? (
          <div>
            SELECTED WATCH: {selectedWatch.name} | THRESHOLD {selectedWatch.threshold.toFixed(2)}
          </div>
        ) : (
          <div>SELECTED WATCH: NONE</div>
        )}
      </div>
    </div>
  )
}
