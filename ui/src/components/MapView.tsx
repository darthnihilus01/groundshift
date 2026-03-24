import { useEffect, useMemo, useRef, useState } from 'react'

import * as d3 from 'd3'
import type { Feature, FeatureCollection, Geometry, GeoJsonProperties } from 'geojson'
import { feature } from 'topojson-client'

import type { Alert, LayerId } from '../types'

interface MapViewProps {
  activeLayers: LayerId[]
  onCountryClick: (country: string) => void
  alerts: Alert[]
}

type CountryFeature = Feature<Geometry, GeoJsonProperties> & { id?: string | number }

interface CityPoint {
  name: string
  coords: [number, number]
}

const CITIES: CityPoint[] = [
  { name: 'New York', coords: [-74.006, 40.7128] },
  { name: 'London', coords: [-0.1276, 51.5074] },
  { name: 'Moscow', coords: [37.6173, 55.7558] },
  { name: 'Beijing', coords: [116.4074, 39.9042] },
  { name: 'Mumbai', coords: [72.8777, 19.076] },
  { name: 'Delhi', coords: [77.209, 28.6139] },
  { name: 'Tokyo', coords: [139.6917, 35.6895] },
  { name: 'Dubai', coords: [55.2708, 25.2048] },
  { name: 'Singapore', coords: [103.8198, 1.3521] },
  { name: 'Sydney', coords: [151.2093, -33.8688] },
  { name: 'Sao Paulo', coords: [-46.6333, -23.5505] },
  { name: 'Cairo', coords: [31.2357, 30.0444] },
  { name: 'Lagos', coords: [3.3792, 6.5244] },
  { name: 'Karachi', coords: [67.0099, 24.8607] },
  { name: 'Bengaluru', coords: [77.5946, 12.9716] },
  { name: 'Seoul', coords: [126.978, 37.5665] },
  { name: 'Paris', coords: [2.3522, 48.8566] },
  { name: 'Berlin', coords: [13.405, 52.52] },
  { name: 'Istanbul', coords: [28.9784, 41.0082] },
  { name: 'Tehran', coords: [51.389, 35.6892] },
]

function getCountryName(country: CountryFeature): string {
  const properties = country.properties ?? {}
  const named = (properties.name as string | undefined) ?? (properties.NAME as string | undefined)
  if (named) {
    return named
  }

  if (country.id !== undefined && country.id !== null) {
    return String(country.id)
  }

  return 'Unknown'
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

function parseWktCentroid(wkt: string): [number, number] | null {
  if (!wkt) {
    return null
  }

  const numbers = wkt.match(/-?\d+(?:\.\d+)?/g)
  if (!numbers || numbers.length < 2) {
    return null
  }

  const coords: [number, number][] = []
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    const lon = Number(numbers[index])
    const lat = Number(numbers[index + 1])
    if (Number.isFinite(lon) && Number.isFinite(lat)) {
      coords.push([lon, lat])
    }
  }

  if (coords.length === 0) {
    return null
  }

  const trimmed =
    coords.length > 2 && coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1]
      ? coords.slice(0, -1)
      : coords

  const sum = trimmed.reduce(
    (acc, point) => [acc[0] + point[0], acc[1] + point[1]] as [number, number],
    [0, 0] as [number, number],
  )

  return [sum[0] / trimmed.length, sum[1] / trimmed.length]
}

export default function MapView({ activeLayers, onCountryClick, alerts }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)

  const [size, setSize] = useState({ width: 0, height: 0 })
  const [countries, setCountries] = useState<CountryFeature[]>([])
  const [zoomTransform, setZoomTransform] = useState(d3.zoomIdentity)
  const [utcTime, setUtcTime] = useState(() => formatUtc(new Date()))
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null)
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null)
  const [cursorLatLon, setCursorLatLon] = useState<string>('LAT --  LON --')

  useEffect(() => {
    let mounted = true

    const fetchCountries = async () => {
      try {
        const response = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
        if (!response.ok) {
          throw new Error('Failed to load countries data')
        }

        const topology = await response.json()
        const countryGeoJson = feature(topology, topology.objects.countries) as unknown as FeatureCollection<
          Geometry,
          GeoJsonProperties
        >

        if (mounted) {
          setCountries(countryGeoJson.features as CountryFeature[])
        }
      } catch {
        if (mounted) {
          setCountries([])
        }
      }
    }

    fetchCountries()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
    })

    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setUtcTime(formatUtc(new Date()))
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    if (!svgRef.current) {
      return
    }

    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 8])
      .on('zoom', (event) => {
        setZoomTransform(event.transform)
      })

    const selection = d3.select(svgRef.current)
    selection.call(zoomBehavior)

    return () => {
      selection.on('.zoom', null)
    }
  }, [])

  const projection = useMemo(() => {
    if (size.width <= 0 || size.height <= 0) {
      return null
    }

    const baseProjection = d3
      .geoNaturalEarth1()
      .fitExtent(
        [
          [16, 16],
          [size.width - 16, size.height - 16],
        ],
        { type: 'Sphere' },
      )

    const baseScale = baseProjection.scale()
    const baseTranslate = baseProjection.translate()

    return baseProjection
      .scale(baseScale * zoomTransform.k)
      .translate([baseTranslate[0] + zoomTransform.x, baseTranslate[1] + zoomTransform.y])
  }, [size.height, size.width, zoomTransform.k, zoomTransform.x, zoomTransform.y])

  const geoPath = useMemo(() => {
    if (!projection) {
      return null
    }

    return d3.geoPath(projection)
  }, [projection])

  const graticulePath = useMemo(() => {
    if (!geoPath) {
      return null
    }

    const graticule = d3.geoGraticule().step([30, 30])()
    return geoPath(graticule)
  }, [geoPath])

  const anomalyPoints = useMemo(() => {
    if (!projection || !activeLayers.includes('anomalies')) {
      return []
    }

    return alerts
      .map((alert) => {
        const centroid = parseWktCentroid(alert.aoi_wkt)
        if (!centroid) {
          return null
        }

        const projected = projection(centroid)
        if (!projected) {
          return null
        }

        return {
          id: alert.id,
          x: projected[0],
          y: projected[1],
          severity: alert.severity,
        }
      })
      .filter((item): item is { id: string; x: number; y: number; severity: Alert['severity'] } => item !== null)
  }, [activeLayers, alerts, projection])

  const handleMouseMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!projection || !svgRef.current) {
      return
    }

    const [x, y] = d3.pointer(event, svgRef.current)
    if (!projection.invert) {
      return
    }

    const inverted = projection.invert([x, y])
    if (!inverted) {
      return
    }

    setCursorLatLon(`LAT ${inverted[1].toFixed(2)}  LON ${inverted[0].toFixed(2)}`)
  }

  const severityColor: Record<Alert['severity'], string> = {
    critical: '#ff3333',
    moderate: '#ffaa00',
    low: '#ffff00',
  }

  return (
    <div className="d3-map-root" ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <svg
        ref={svgRef}
        width={size.width}
        height={size.height}
        viewBox={`0 0 ${Math.max(size.width, 1)} ${Math.max(size.height, 1)}`}
        className="d3-map-svg"
        onMouseMove={handleMouseMove}
      >
        <defs>
          <filter id="borderGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        <rect x="0" y="0" width={size.width} height={size.height} fill="#080808" />

        {graticulePath && (
          <path
            d={graticulePath}
            fill="none"
            stroke="#ff2200"
            strokeWidth={0.2}
            strokeOpacity={0.15}
          />
        )}

        {geoPath &&
          countries.map((country) => {
            const pathD = geoPath(country)
            if (!pathD) {
              return null
            }

            const countryName = getCountryName(country)
            const isSelected = selectedCountry === countryName
            const isHovered = hoveredCountry === countryName

            return (
              <g key={countryName}>
                <path
                  d={pathD}
                  fill="none"
                  stroke="#ff2200"
                  strokeWidth={2}
                  strokeOpacity={0.05}
                  filter="url(#borderGlow)"
                />
                <path
                  d={pathD}
                  fill={isSelected ? '#200000' : isHovered ? '#1a0000' : '#0d0d0d'}
                  stroke={isSelected ? '#ff4400' : '#ff2200'}
                  strokeWidth={isSelected ? 1 : 0.4}
                  strokeOpacity={0.7}
                  onMouseEnter={(event) => {
                    setHoveredCountry(countryName)
                    setTooltip({ text: countryName, x: event.clientX, y: event.clientY })
                  }}
                  onMouseMove={(event) => {
                    setTooltip({ text: countryName, x: event.clientX, y: event.clientY })
                  }}
                  onMouseLeave={() => {
                    setHoveredCountry(null)
                    setTooltip(null)
                  }}
                  onClick={() => {
                    setSelectedCountry(countryName)
                    onCountryClick(countryName)
                  }}
                />
              </g>
            )
          })}

        {projection &&
          CITIES.map((city) => {
            const point = projection(city.coords)
            if (!point) {
              return null
            }

            return (
              <g key={city.name}>
                <circle cx={point[0]} cy={point[1]} r={2} fill="#ff2200" opacity={0.8} />
                {zoomTransform.k > 1 && (
                  <text
                    x={point[0]}
                    y={point[1] - 6}
                    fill="#ff4400"
                    fontSize={10}
                    opacity={0.7}
                    textAnchor="middle"
                    style={{ fontFamily: 'JetBrains Mono, monospace' }}
                  >
                    {city.name}
                  </text>
                )}
              </g>
            )
          })}

        {anomalyPoints.map((point) => (
          <g key={point.id}>
            <circle cx={point.x} cy={point.y} r={6} fill={severityColor[point.severity]} opacity={0.9} />
            <circle
              className="anomaly-pulse"
              cx={point.x}
              cy={point.y}
              r={6}
              fill="none"
              stroke={severityColor[point.severity]}
              strokeWidth={1.4}
            />
          </g>
        ))}
      </svg>

      <div className="d3-scanlines" />
      <div className="d3-vignette" />
      <div className="d3-brand mono">GROUNDSHIFT</div>
      <div className="d3-utc mono">{utcTime}</div>
      <div className="d3-cursor mono">{cursorLatLon}</div>

      {tooltip && (
        <div className="d3-tooltip mono" style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}>
          {tooltip.text}
        </div>
      )}
    </div>
  )
}
