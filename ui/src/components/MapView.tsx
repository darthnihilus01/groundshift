import { useEffect, useMemo, useRef, useState } from 'react'
import type { Feature, FeatureCollection, LineString } from 'geojson'
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

function buildGridGeoJson() {
  const features: Feature<LineString>[] = []

  for (let lat = -90; lat <= 90; lat += 30) {
    features.push({
      type: 'Feature',
      properties: { kind: 'latitude' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [-180, lat],
          [180, lat],
        ],
      },
    })
  }

  for (let lon = -180; lon <= 180; lon += 30) {
    features.push({
      type: 'Feature',
      properties: { kind: 'longitude' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [lon, -90],
          [lon, 90],
        ],
      },
    })
  }

  return {
    type: 'FeatureCollection',
    features,
  } as FeatureCollection<LineString>
}

function formatUtc(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0')
  const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase()
  const year = date.getUTCFullYear()
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  const seconds = String(date.getUTCSeconds()).padStart(2, '0')
  return `${day} ${month} ${year}  ${hours}:${minutes}:${seconds} UTC`
}

export default function MapView({ selectedWatch }: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [layers, setLayers] = useState<LayerState[]>(DEFAULT_LAYERS)
  const [utcTime, setUtcTime] = useState(() => formatUtc(new Date()))

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

    map.addControl(new maplibregl.NavigationControl(), 'bottom-right')

    const addTacticalLayers = () => {
      if (!map.loaded()) {
        return
      }

      if (map.getSource('tactical-countries')) {
        return
      }

      map.addSource('tactical-countries', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson',
      })

      map.addLayer({
        id: 'tactical-country-borders',
        type: 'line',
        source: 'tactical-countries',
        paint: {
          'line-color': '#ff2200',
          'line-width': 0.5,
          'line-opacity': 0.6,
        },
      })

      map.addSource('tactical-cities', {
        type: 'geojson',
        data: 'https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_10m_populated_places_simple.geojson',
      })

      map.addLayer({
        id: 'tactical-populated-cities',
        type: 'circle',
        source: 'tactical-cities',
        filter: ['>', ['coalesce', ['get', 'pop_max'], 0], 1000000],
        paint: {
          'circle-color': '#ff2200',
          'circle-radius': 2,
          'circle-opacity': 0.8,
        },
      })

      map.addLayer({
        id: 'tactical-city-heatmap',
        type: 'heatmap',
        source: 'tactical-cities',
        paint: {
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0,
            'rgba(0,0,0,0)',
            0.3,
            '#330000',
            0.7,
            '#ff2200',
            1,
            '#ff6600',
          ],
          'heatmap-intensity': 1.5,
          'heatmap-radius': 40,
          'heatmap-opacity': 0.8,
        },
      })

      map.addSource('tactical-grid', {
        type: 'geojson',
        data: buildGridGeoJson(),
      })

      map.addLayer({
        id: 'tactical-grid-lines',
        type: 'line',
        source: 'tactical-grid',
        paint: {
          'line-color': '#ff2200',
          'line-opacity': 0.15,
          'line-width': 0.3,
        },
      })

      map.addLayer({
        id: 'tactical-city-labels',
        type: 'symbol',
        source: 'tactical-cities',
        filter: ['>', ['coalesce', ['get', 'pop_max'], 0], 1000000],
        layout: {
          'text-field': ['coalesce', ['get', 'nameascii'], ['get', 'name']],
          'text-size': 10,
          'text-font': ['Noto Sans Mono Regular', 'Noto Sans Regular'],
          'text-offset': [0, 0.9],
          'text-anchor': 'top',
        },
        paint: {
          'text-color': '#ff4400',
        },
      })
    }

    if (map.loaded()) {
      addTacticalLayers()
    } else {
      map.on('load', addTacticalLayers)
    }

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setUtcTime(formatUtc(new Date()))
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
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
      <div className="map-stage">
        <div ref={mapContainerRef} className="map-canvas" style={{ width: '100%', height: '100%' }} />
        <div className="map-atmosphere-overlay" />
        <div className="map-brand mono">GROUNDSHIFT</div>
        <div className="map-utc mono">{utcTime}</div>
      </div>
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
