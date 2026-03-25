import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { feature } from 'topojson-client';
import type { FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';
import countriesTopologyUrl from 'world-atlas/countries-110m.json?url';
import { loadTerrainForCountry } from '../utils/terrainTiles';
import { createTerrainScene } from '../utils/terrainScene';
import type { TerrainSceneController } from '../utils/terrainScene';

type CountryFeature = GeoJSON.Feature<Geometry, GeoJsonProperties> & {
  id?: string | number;
};

interface MapViewProps {
  selectedCountry: string | null;
  onCountrySelect: (country: string) => void;
}

interface CityPoint {
  name: string;
  coords: [number, number];
}

const CITIES: CityPoint[] = [
  { name: 'NEW YORK', coords: [-74.006, 40.7128] },
  { name: 'LONDON', coords: [-0.1276, 51.5074] },
  { name: 'TOKYO', coords: [139.6917, 35.6895] },
  { name: 'DUBAI', coords: [55.2708, 25.2048] },
  { name: 'SINGAPORE', coords: [103.8198, 1.3521] },
  { name: 'BENGALURU', coords: [77.5946, 12.9716] },
  { name: 'SAO PAULO', coords: [-46.6333, -23.5505] },
  { name: 'CAIRO', coords: [31.2357, 30.0444] },
];

const MapView: React.FC<MapViewProps> = ({ onCountrySelect }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const terrainCanvasRef = useRef<HTMLCanvasElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const terrainSceneRef = useRef<TerrainSceneController | null>(null);
  const terrainRequestIdRef = useRef(0);
  const projectionRef = useRef<d3.GeoProjection | null>(null);
  const pathRef = useRef<d3.GeoPath | null>(null);
  const widthRef = useRef<number>(0);
  const heightRef = useRef<number>(0);
  const panelTimerRef = useRef<number | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [countries, setCountries] = useState<CountryFeature[]>([]);
  const [mousePos, setMousePos] = useState({ lat: 0, lon: 0 });
  const [utcTime, setUtcTime] = useState('00:00:00 UTC');
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<'world' | 'country'>('world');
  const [showCountryPanel, setShowCountryPanel] = useState(false);
  const [terrainVisible, setTerrainVisible] = useState(false);
  const [terrainLoading, setTerrainLoading] = useState(false);
  const [terrainStatus, setTerrainStatus] = useState('2D VIEW');

  useEffect(() => {
    const updateClock = () => {
      setUtcTime(
        `${new Date().toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZone: 'UTC',
        })} UTC`,
      );
    };

    updateClock();
    const timer = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      widthRef.current = entry.contentRect.width;
      heightRef.current = entry.contentRect.height;
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const topologyResponse = await fetch(countriesTopologyUrl);

        if (!topologyResponse.ok) {
          throw new Error('Bundled map data unavailable');
        }

        const topology = await topologyResponse.json();

        const geoJson = feature(topology, topology.objects.countries) as unknown as FeatureCollection<
          Geometry,
          GeoJsonProperties
        >;

        const hydrated: CountryFeature[] = geoJson.features.map((item) => {
          const id = item.id === undefined || item.id === null ? '' : String(item.id);
          return {
            ...item,
            properties: {
              ...(item.properties ?? {}),
                name: ((item.properties?.name as string | undefined) ?? id) || 'UNKNOWN',
            },
          };
        });

        if (mounted) {
          setCountries(hydrated);
        }
      } catch {
        if (mounted) {
          setCountries([]);
        }
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  const projection = useMemo(() => {
    if (size.width <= 0 || size.height <= 0) {
      return null;
    }

    return d3
      .geoNaturalEarth1()
      .fitExtent(
        [
          [12, 12],
          [size.width - 12, size.height - 12],
        ],
        { type: 'Sphere' },
      );
  }, [size.height, size.width]);

  useEffect(() => {
    if (!terrainCanvasRef.current) {
      return;
    }

    const terrainScene = createTerrainScene(terrainCanvasRef.current);
    terrainSceneRef.current = terrainScene;

    return () => {
      terrainScene.dispose();
      terrainSceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!terrainSceneRef.current) {
      return;
    }

    terrainSceneRef.current.resize(size.width, size.height);
  }, [size.height, size.width]);

  useEffect(() => {
    if (!svgRef.current) {
      return;
    }

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 8])
      .on('zoom', (event) => {
        if (!gRef.current) {
          return;
        }

        d3.select(gRef.current).attr('transform', event.transform);
      });

    d3.select(svgRef.current).call(zoom);
    zoomRef.current = zoom;

    return () => {
      if (svgRef.current) {
        d3.select(svgRef.current).on('.zoom', null);
      }
    };
  }, []);

  const loadTerrainForFeature = async (featureData: CountryFeature) => {
    const requestId = terrainRequestIdRef.current + 1;
    terrainRequestIdRef.current = requestId;

    setTerrainLoading(true);
    setTerrainStatus('LOADING TERRAIN');

    try {
      const terrain = await loadTerrainForCountry(featureData, { maxDimension: 360 });
      if (requestId !== terrainRequestIdRef.current) {
        return;
      }

      terrainSceneRef.current?.setTerrain(terrain);
      setTerrainVisible(true);
      setTerrainStatus('3D TERRAIN LIVE');
    } catch {
      if (requestId === terrainRequestIdRef.current) {
        setTerrainVisible(false);
        setTerrainStatus('TERRAIN UNAVAILABLE');
      }
    } finally {
      if (requestId === terrainRequestIdRef.current) {
        setTerrainLoading(false);
      }
    }
  };

  const handleCountryClick = (event: MouseEvent, featureData: CountryFeature) => {
    event.stopPropagation();

    const svg = d3.select(svgRef.current as SVGSVGElement);
    const path = pathRef.current;
    const width = widthRef.current;
    const height = heightRef.current;

    if (!path || !width || !height || !zoomRef.current) {
      return;
    }

    const bounds = path.bounds(featureData);
    const [[x0, y0], [x1, y1]] = bounds;

    const bWidth = x1 - x0;
    const bHeight = y1 - y0;

    if (bWidth === 0 || bHeight === 0) {
      return;
    }

    const scale = Math.min(0.9 / Math.max(bWidth / width, bHeight / height), 8);

    const tx = width / 2 - (scale * (x0 + x1)) / 2;
    const ty = height / 2 - (scale * (y0 + y1)) / 2;

    svg
      .transition()
      .duration(750)
      .ease(d3.easeCubicInOut)
      .call(zoomRef.current.transform as any, d3.zoomIdentity.translate(tx, ty).scale(scale));

    const name = String(featureData.properties?.name ?? 'Unknown');
    setSelectedCountry(name);
    onCountrySelect(name);
    setZoomLevel('country');
    void loadTerrainForFeature(featureData);

    if (panelTimerRef.current) {
      window.clearTimeout(panelTimerRef.current);
    }
    panelTimerRef.current = window.setTimeout(() => setShowCountryPanel(true), 750);
  };

  const handleWorldView = () => {
    if (!zoomRef.current || !svgRef.current) {
      return;
    }

    const svg = d3.select(svgRef.current as SVGSVGElement);

    svg.transition().duration(750).ease(d3.easeCubicInOut).call(zoomRef.current.transform as any, d3.zoomIdentity);

    if (panelTimerRef.current) {
      window.clearTimeout(panelTimerRef.current);
      panelTimerRef.current = null;
    }

    setSelectedCountry(null);
    onCountrySelect('');
    setZoomLevel('world');
    setShowCountryPanel(false);
    setTerrainVisible(false);
    setTerrainStatus('2D VIEW');
  };

  useEffect(() => {
    if (!svgRef.current || !projection) {
      return;
    }

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const path = d3.geoPath(projection);
    projectionRef.current = projection;
    pathRef.current = path;
    const root = svg.append('g');
    gRef.current = root.node() as SVGGElement;

    root
      .append('rect')
      .attr('width', size.width)
      .attr('height', size.height)
      .attr('fill', '#0a1a0f');

    const hexDefs = svg.append('defs');
    const pattern = hexDefs
      .append('pattern')
      .attr('id', 'hex-grid-pattern')
      .attr('width', 52)
      .attr('height', 45)
      .attr('patternUnits', 'userSpaceOnUse');

    pattern
      .append('path')
      .attr('d', 'M13,0 L39,0 L52,22.5 L39,45 L13,45 L0,22.5 Z')
      .attr('fill', 'none')
      .attr('stroke', '#00c8ff')
      .attr('stroke-width', 0.7)
      .attr('opacity', 0.04);

    root
      .append('rect')
      .attr('width', size.width)
      .attr('height', size.height)
      .attr('fill', 'url(#hex-grid-pattern)')
      .attr('pointer-events', 'none');

    const graticule = d3.geoGraticule();
    root
      .append('path')
      .datum(graticule())
      .attr('d', (d) => path(d) ?? '')
      .attr('fill', 'none')
      .attr('stroke', '#00c8ff')
      .attr('stroke-width', 0.15)
      .attr('opacity', 0.12);

    if (countries.length > 0) {
      root
        .append('g')
        .selectAll('path')
        .data(countries)
        .enter()
        .append('path')
        .attr('d', (d) => path(d) ?? '')
        .attr('fill', '#0a1a0f')
        .attr('stroke', '#00c8ff')
        .attr('stroke-width', 2)
        .attr('opacity', 0.04)
        .style('filter', 'blur(2px)')
        .attr('pointer-events', 'none');

      const countriesGroup = root.append('g').attr('class', 'countries-interactive');
      countriesGroup
        .selectAll<SVGPathElement, CountryFeature>('.country')
        .data(countries)
        .join('path')
        .attr('class', 'country')
        .attr('d', (d) => pathRef.current?.(d) ?? '')
        .attr('fill', (d) => {
          const name = String(d.properties?.name ?? '');
          return selectedCountry && selectedCountry === name ? '#0a2a0f' : '#0a1a0f';
        })
        .attr('stroke', '#00c8ff')
        .attr('stroke-width', 0.4)
        .attr('opacity', 0.6)
        .style('cursor', 'pointer')
        .on('mouseenter', function () {
          d3.select(this).attr('fill', '#0d2a1a');
        })
        .on('mouseleave', function (_, d) {
          const name = String(d.properties?.name ?? '');
          d3.select(this).attr('fill', selectedCountry && selectedCountry === name ? '#0a2a0f' : '#0a1a0f');
        })
        .on('click', function (event, d) {
          handleCountryClick(event, d);
        });
    } else {
      // Ensure the map is visibly present even if country topology fails to load.
      root
        .append('path')
        .datum({ type: 'Sphere' })
        .attr('d', (d) => path(d as any) ?? '')
        .attr('fill', 'none')
        .attr('stroke', '#00c8ff')
        .attr('stroke-width', 0.6)
        .attr('opacity', 0.35);
    }

    const cityGroup = root.append('g');
    cityGroup
      .selectAll('circle')
      .data(CITIES)
      .enter()
      .append('circle')
      .attr('cx', (d) => projection(d.coords)?.[0] ?? -100)
      .attr('cy', (d) => projection(d.coords)?.[1] ?? -100)
      .attr('r', 2)
      .attr('fill', 'var(--cyan-bright)');

    cityGroup
      .selectAll('text')
      .data(CITIES)
      .enter()
      .append('text')
      .attr('x', (d) => (projection(d.coords)?.[0] ?? -100) + 4)
      .attr('y', (d) => (projection(d.coords)?.[1] ?? -100) - 4)
      .attr('font-size', '9px')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('fill', 'var(--text-secondary)')
      .text((d) => d.name);

    // Layer order: make interactive elements appear on top
    root.select('.countries-interactive').raise();

    const pointerMove = (event: MouseEvent) => {
      const [x, y] = d3.pointer(event, svg.node());
      const latLon = projectionRef.current?.invert ? projectionRef.current.invert([x, y]) : null;
      if (latLon) {
        setMousePos({ lat: latLon[1], lon: latLon[0] });
      }
    };

    svg.on('mousemove', pointerMove);

    return () => {
      svg.on('mousemove', null);
    };
  }, [countries, projection, selectedCountry, size.height, size.width]);

  useEffect(() => {
    return () => {
      if (panelTimerRef.current) {
        window.clearTimeout(panelTimerRef.current);
      }
    };
  }, []);

  return (
    <div className="map-container" ref={containerRef}>
      <svg
        ref={svgRef}
        className="map-svg"
        style={{
          opacity: terrainVisible ? 0.22 : 1,
          transition: 'opacity 650ms ease',
        }}
      />
      <canvas
        ref={terrainCanvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: terrainVisible ? 1 : 0,
          transition: 'opacity 650ms ease',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />
      {zoomLevel === 'country' && (
        <button
          onClick={handleWorldView}
          style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            background: 'rgba(5,10,15,0.92)',
            border: '1px solid #00c8ff',
            color: '#00c8ff',
            font: '11px JetBrains Mono, monospace',
            padding: '6px 14px',
            cursor: 'pointer',
            letterSpacing: '0.1em',
            borderRadius: 0,
            zIndex: 100,
          }}
        >
          {'\u2190 WORLD VIEW'}
        </button>
      )}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          zIndex: 100,
          border: '1px solid #00c8ff',
          background: 'rgba(5,10,15,0.9)',
          color: '#00c8ff',
          font: '10px JetBrains Mono, monospace',
          letterSpacing: '0.1em',
          padding: '4px 8px',
        }}
      >
        {terrainLoading ? 'LOADING TERRAIN' : terrainStatus}
      </div>
      {showCountryPanel && (
        <div
          style={{
            position: 'absolute',
            top: '60px',
            left: '16px',
            background: 'rgba(5,10,15,0.95)',
            border: '1px solid #00c8ff',
            color: '#00c8ff',
            font: '11px JetBrains Mono, monospace',
            padding: '14px 16px',
            borderRadius: 0,
            zIndex: 100,
            lineHeight: 1.6,
            minWidth: '220px',
          }}
        >
          <div>COUNTRY: {selectedCountry ?? 'UNKNOWN'}</div>
          <div>CAPITAL: {String(countries.find((c) => String(c.properties?.name ?? '') === selectedCountry)?.properties?.capital ?? 'UNKNOWN')}</div>
          <div>REGION: {String(countries.find((c) => String(c.properties?.name ?? '') === selectedCountry)?.properties?.region ?? 'UNKNOWN')}</div>
          <div>STATUS: MONITORING</div>
        </div>
      )}
      <div className="map-title">GROUNDSHIFT</div>
      <div className="map-status-text">{utcTime}</div>
      <div className="map-coords">
        LAT {mousePos.lat.toFixed(2)} / LON {mousePos.lon.toFixed(2)}
      </div>
      <div className="scanlines" />
    </div>
  );
};

export default MapView;
