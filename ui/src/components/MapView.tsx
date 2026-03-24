import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

interface MapViewProps {}

const MapView: React.FC<MapViewProps> = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [mousePos, setMousePos] = useState({ lat: 0, lon: 0 });

  useEffect(() => {
    if (!containerRef.current || !svgRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Clear previous SVG content
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    // Create projection
    const projection = d3.geoMercator()
      .fitSize([width, height], { type: 'Sphere' });

    const pathGenerator = d3.geoPath(projection);

    // Create background
    svg.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', '#0a1a0f');

    // Create world group
    const world = svg.append('g');

    // Fetch and render world data
    d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json').then((topology: any) => {
      if (!topology) return;

      // Extract features - convert TopoJSON to GeoJSON
      const convertedFeatures = topology.objects.countries.geometries.map((geom: any) => ({
        type: 'Feature',
        geometry: {
          type: geom.type,
          coordinates: geom.arcs ? convertArcs(geom.arcs, topology.arcs, geom.type) : geom.coordinates
        }
      }));

      // Draw graticule
      const graticule = d3.geoGraticule();
      world.append('path')
        .datum(graticule())
        .attr('d', pathGenerator)
        .attr('fill', 'none')
        .attr('stroke', '#00c8ff')
        .attr('stroke-width', 0.15)
        .attr('opacity', 0.12);

      // Draw countries
      world.selectAll('path.country')
        .data(convertedFeatures)
        .enter()
        .append('path')
        .attr('class', 'country')
        .attr('d', pathGenerator)
        .attr('fill', '#0a1a0f')
        .attr('stroke', '#00c8ff')
        .attr('stroke-width', 0.4)
        .attr('opacity', 0.6)
        .on('mouseenter', function () {
          d3.select(this).attr('fill', '#0d2a1a');
        })
        .on('mouseleave', function () {
          d3.select(this).attr('fill', '#0a1a0f');
        });

      // Draw contour/glow effect
      world.selectAll('path.contour')
        .data(convertedFeatures)
        .enter()
        .append('path')
        .attr('class', 'contour')
        .attr('d', pathGenerator)
        .attr('fill', 'none')
        .attr('stroke', '#00c8ff')
        .attr('stroke-width', 2)
        .attr('opacity', 0.04)
        .style('filter', 'blur(2px)');
    });

    // Create hex grid overlay
    createHexGrid(world, width, height);

    // Add scanlines effect
    svg.append('defs')
      .append('pattern')
      .attr('id', 'scanlines')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', 4)
      .attr('height', 4)
      .attr('patternUnits', 'userSpaceOnUse')
      .append('rect')
      .attr('fill', 'rgba(0,200,255,0.02)')
      .attr('x', 0)
      .attr('y', 3)
      .attr('width', 4)
      .attr('height', 1);

    svg.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'url(#scanlines)')
      .attr('pointer-events', 'none');

    // Update mouse coordinates
    const handleMouseMove = (e: MouseEvent) => {
      const [x, y] = d3.pointer(e);
      const inverted = projection.invert([x, y]);
      setMousePos({ lat: inverted[1], lon: inverted[0] });
    };

    svg.on('mousemove', handleMouseMove);

  }, []);

  const createHexGrid = (group: d3.Selection<SVGGElement, unknown, HTMLElement, unknown>, width: number, height: number) => {
    const hexRadius = 30;
    const hexWidth = hexRadius * 2;
    const hexHeight = hexRadius * Math.sqrt(3);

    for (let y = 0; y < height; y += hexHeight) {
      for (let x = 0; x < width; x += hexWidth) {
        const offsetX = (y / hexHeight) % 2 === 1 ? hexWidth / 2 : 0;
        drawHex(group, x + offsetX, y, hexRadius);
      }
    }
  };

  const drawHex = (group: d3.Selection<SVGGElement, unknown, HTMLElement, unknown>, x: number, y: number, radius: number) => {
    const points = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i;
      points.push([x + radius * Math.cos(angle), y + radius * Math.sin(angle)]);
    }

    group.append('polygon')
      .attr('points', (points as any).map((p: number[]) => p.join(',')).join(' '))
      .attr('fill', 'none')
      .attr('stroke', '#00c8ff')
      .attr('stroke-width', 0.5)
      .attr('opacity', 0.04)
      .attr('pointer-events', 'none');
  };

  return (
    <div className="map-container" ref={containerRef}>
      <svg ref={svgRef} className="map-container"></svg>

      <div className="map-overlay">
        <div className="map-title">GROUNDSHIFT</div>
        <div className="map-status-text">
          {new Date().toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
            timeZone: 'UTC'
          })} UTC
        </div>
        <div className="map-coords">
          LAT {mousePos.lat.toFixed(2)} / LON {mousePos.lon.toFixed(2)}
        </div>
        <div className="scanlines"></div>
      </div>
    </div>
  );
};

// Helper function to convert TopoJSON arcs to coordinates
function convertArcs(arcIndexes: number[], arcs: any[], geometryType: string): any[] {
  const convertArc = (arcIndex: number) => {
    const arc = arcIndex < 0 ? arcs[~arcIndex].reverse() : arcs[arcIndex];
    const points: [number, number][] = [];
    let x = 0, y = 0;
    for (const [dx, dy] of arc) {
      x += dx;
      y += dy;
      points.push([x, y]);
    }
    return points;
  };

  if (geometryType === 'LineString' || geometryType === 'MultiLineString') {
    return arcIndexes.map(i => convertArc(i));
  } else if (geometryType === 'Polygon' || geometryType === 'MultiPolygon') {
    return arcIndexes.map(ring => ring.map((i: number) => convertArc(i)));
  }
  return [];
}

export default MapView;

interface CityPoint {
  name: string
  coords: [number, number]
}

interface CountryIntel {
  capital: string
  region: string
}

const COUNTRY_INTEL: Record<string, CountryIntel> = {
  India: { capital: 'New Delhi', region: 'South Asia' },
  China: { capital: 'Beijing', region: 'East Asia' },
  Russia: { capital: 'Moscow', region: 'Eurasia' },
  USA: { capital: 'Washington, DC', region: 'North America' },
  Brazil: { capital: 'Brasilia', region: 'South America' },
  Australia: { capital: 'Canberra', region: 'Oceania' },
  Germany: { capital: 'Berlin', region: 'Europe' },
  France: { capital: 'Paris', region: 'Europe' },
  UK: { capital: 'London', region: 'Europe' },
  Japan: { capital: 'Tokyo', region: 'East Asia' },
  Pakistan: { capital: 'Islamabad', region: 'South Asia' },
  Iran: { capital: 'Tehran', region: 'Middle East' },
  'Saudi Arabia': { capital: 'Riyadh', region: 'Middle East' },
  Nigeria: { capital: 'Abuja', region: 'West Africa' },
  'South Africa': { capital: 'Pretoria', region: 'Southern Africa' },
  Indonesia: { capital: 'Jakarta', region: 'Southeast Asia' },
  Canada: { capital: 'Ottawa', region: 'North America' },
  Mexico: { capital: 'Mexico City', region: 'North America' },
  Argentina: { capital: 'Buenos Aires', region: 'South America' },
  Egypt: { capital: 'Cairo', region: 'North Africa' },
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

function normalizeCountryName(rawName: string): string {
  const aliases: Record<string, string> = {
    'United States of America': 'USA',
    'United States': 'USA',
    'Russian Federation': 'Russia',
    'United Kingdom': 'UK',
    'United Kingdom of Great Britain and Northern Ireland': 'UK',
    Iran: 'Iran',
    "Iran, Islamic Republic of": 'Iran',
  }

  return aliases[rawName] ?? rawName
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
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const infoTimeoutRef = useRef<number | null>(null)
  const autoIndiaZoomDoneRef = useRef(false)

  const [size, setSize] = useState({ width: 0, height: 0 })
  const [countries, setCountries] = useState<CountryFeature[]>([])
  const [zoomTransform, setZoomTransform] = useState(d3.zoomIdentity)
  const [utcTime, setUtcTime] = useState(() => formatUtc(new Date()))
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null)
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null)
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('world')
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null)
  const [cursorLatLon, setCursorLatLon] = useState<string>('LAT --  LON --')
  const [countryInfo, setCountryInfo] = useState<{
    name: string
    centroid: [number, number]
    bounds: [[number, number], [number, number]]
    capital: string
    region: string
  } | null>(null)
  const [countryInfoVisible, setCountryInfoVisible] = useState(false)

  useEffect(() => {
    let mounted = true

    const fetchCountries = async () => {
      try {
        const [topologyResponse, namesResponse] = await Promise.all([
          fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'),
          fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.tsv'),
        ])

        if (!topologyResponse.ok || !namesResponse.ok) {
          throw new Error('Failed to load countries data')
        }

        const topology = await topologyResponse.json()
        const namesTsv = await namesResponse.text()

        const nameRows = d3.tsvParse(namesTsv)
        const idToName = new Map<string, string>()
        for (const row of nameRows) {
          const id = String(row.id ?? '')
          const name = String(row.name ?? '')
          if (id && name) {
            idToName.set(id, name)
          }
        }

        const countryGeoJson = feature(topology, topology.objects.countries) as unknown as FeatureCollection<
          Geometry,
          GeoJsonProperties
        >

        const hydratedCountries = countryGeoJson.features.map((country) => {
          const properties = country.properties ?? {}
          const countryId = country.id === undefined || country.id === null ? '' : String(country.id)
          const mappedName = idToName.get(countryId)

          return {
            ...country,
            properties: {
              ...properties,
              name: mappedName ?? (properties.name as string | undefined) ?? 'Unknown',
            },
          } as CountryFeature
        })

        if (mounted) {
          setCountries(hydratedCountries)
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
    zoomBehaviorRef.current = zoomBehavior

    return () => {
      selection.on('.zoom', null)
      zoomBehaviorRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      if (infoTimeoutRef.current) {
        window.clearTimeout(infoTimeoutRef.current)
      }
    }
  }, [])

  const baseProjection = useMemo(() => {
    if (size.width <= 0 || size.height <= 0) {
      return null
    }

    return d3
      .geoNaturalEarth1()
      .fitExtent(
        [
          [16, 16],
          [size.width - 16, size.height - 16],
        ],
        { type: 'Sphere' },
      )
  }, [size.height, size.width])

  const projection = useMemo(() => {
    if (!baseProjection) {
      return null
    }

    const baseScale = baseProjection.scale()
    const baseTranslate = baseProjection.translate()

    return baseProjection
      .scale(baseScale * zoomTransform.k)
      .translate([baseTranslate[0] + zoomTransform.x, baseTranslate[1] + zoomTransform.y])
  }, [baseProjection, zoomTransform.k, zoomTransform.x, zoomTransform.y])

  const baseGeoPath = useMemo(() => {
    if (!baseProjection) {
      return null
    }

    return d3.geoPath(baseProjection)
  }, [baseProjection])

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

  const handleCountryClick = (country: CountryFeature, countryName: string) => {
    if (!baseGeoPath || !svgRef.current || !zoomBehaviorRef.current || size.width <= 0 || size.height <= 0) {
      return
    }

    const [[x0, y0], [x1, y1]] = baseGeoPath.bounds(country)
    const rawScale = 0.85 / Math.max((x1 - x0) / size.width, (y1 - y0) / size.height)
    const scale = Math.max(1, Math.min(8, rawScale))
    const translate: [number, number] = [
      (size.width - scale * (x1 + x0)) / 2,
      (size.height - scale * (y1 + y0)) / 2,
    ]

    setSelectedCountry(countryName)
    onCountryClick(countryName)

    const geoBounds = d3.geoBounds(country)
    const geoCentroid = d3.geoCentroid(country) as [number, number]

    if (infoTimeoutRef.current) {
      window.clearTimeout(infoTimeoutRef.current)
    }
    setCountryInfoVisible(false)
    setCountryInfo(null)

    d3.select(svgRef.current)
      .transition()
      .duration(750)
      .ease(d3.easeCubicInOut)
      .call(
        zoomBehaviorRef.current.transform,
        d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale),
      )

    setZoomLevel('country')

    infoTimeoutRef.current = window.setTimeout(() => {
      const normalizedName = normalizeCountryName(countryName)
      const intel = COUNTRY_INTEL[normalizedName] ?? {
        capital: 'Unknown',
        region: 'Unknown',
      }

      setCountryInfo({
        name: normalizedName,
        centroid: geoCentroid,
        bounds: geoBounds as [[number, number], [number, number]],
        capital: intel.capital,
        region: intel.region,
      })

      window.requestAnimationFrame(() => {
        setCountryInfoVisible(true)
      })
    }, 750)
  }

  const handleResetWorldView = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) {
      return
    }

    if (infoTimeoutRef.current) {
      window.clearTimeout(infoTimeoutRef.current)
    }

    setCountryInfoVisible(false)
    setCountryInfo(null)
    setSelectedCountry(null)
    setZoomLevel('world')

    d3.select(svgRef.current)
      .transition()
      .duration(750)
      .ease(d3.easeCubicInOut)
      .call(zoomBehaviorRef.current.transform, d3.zoomIdentity)
  }

  useEffect(() => {
    if (autoIndiaZoomDoneRef.current) {
      return
    }

    if (window.location.hash.toLowerCase() !== '#india') {
      return
    }

    if (!countries.length) {
      return
    }

    const india = countries.find((country) => getCountryName(country).toLowerCase() === 'india')
    if (!india) {
      return
    }

    autoIndiaZoomDoneRef.current = true
    handleCountryClick(india, 'India')
  }, [countries])

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
              <g key={countryName} opacity={zoomLevel === 'country' && selectedCountry && !isSelected ? 0.6 : 1}>
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
                  fill={isSelected ? '#1a0000' : isHovered ? '#1a0000' : '#0d0d0d'}
                  stroke={isSelected ? '#ff4400' : '#ff2200'}
                  strokeWidth={isSelected ? 1 : 0.4}
                  strokeOpacity={0.7}
                  style={{ transition: 'opacity 750ms ease, fill 750ms ease, stroke 750ms ease' }}
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
                    handleCountryClick(country, countryName)
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

      {zoomLevel === 'country' && (
        <button
          type="button"
          onClick={handleResetWorldView}
          className="mono"
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            background: 'rgba(10,0,0,0.85)',
            border: '1px solid #ff2200',
            color: '#ff2200',
            fontSize: 11,
            borderRadius: 0,
            padding: '6px 12px',
            cursor: 'pointer',
            zIndex: 11,
          }}
        >
          ← WORLD VIEW
        </button>
      )}

      {countryInfo && (
        <div
          className="mono"
          style={{
            position: 'absolute',
            top: 60,
            left: 16,
            background: 'rgba(10,0,0,0.92)',
            border: '1px solid #ff2200',
            color: '#ff2200',
            fontSize: 11,
            padding: '12px 16px',
            borderRadius: 0,
            zIndex: 10,
            opacity: countryInfoVisible ? 1 : 0,
            transition: 'opacity 300ms ease',
          }}
        >
          <div style={{ marginBottom: 6 }}>◉ {countryInfo.name.toUpperCase()}</div>
          <div style={{ borderTop: '1px solid #662222', margin: '6px 0' }} />
          <div>CAPITAL   {countryInfo.capital}</div>
          <div>REGION    {countryInfo.region}</div>
          <div>STATUS    MONITORING</div>
          <div style={{ borderTop: '1px solid #662222', margin: '8px 0 10px' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => onCountryClick(countryInfo.name)}
              className="mono"
              style={{
                background: 'transparent',
                border: '1px solid #ff2200',
                color: '#ff2200',
                fontSize: 11,
                borderRadius: 0,
                padding: '4px 8px',
                cursor: 'pointer',
              }}
            >
              WATCH THIS AREA
            </button>
            <button
              type="button"
              onClick={() => {
                setCountryInfoVisible(false)
                window.setTimeout(() => setCountryInfo(null), 300)
              }}
              className="mono"
              style={{
                background: 'transparent',
                border: '1px solid #ff2200',
                color: '#ff2200',
                fontSize: 11,
                borderRadius: 0,
                padding: '4px 8px',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {tooltip && (
        <div className="d3-tooltip mono" style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}>
          {tooltip.text}
        </div>
      )}
    </div>
  )
}
