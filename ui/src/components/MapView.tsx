import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { feature } from 'topojson-client';
import type { FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';
import countriesTopologyUrl from 'world-atlas/countries-110m.json?url';
import { createMapZoom, zoomToFeature, resetZoom } from '../utils/mapZoom';

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

const MapView: React.FC<MapViewProps> = ({ selectedCountry, onCountrySelect }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const rootGroupRef = useRef<SVGGElement>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [countries, setCountries] = useState<CountryFeature[]>([]);
  const [mousePos, setMousePos] = useState({ lat: 0, lon: 0 });
  const [utcTime, setUtcTime] = useState('00:00:00 UTC');
  const [currentZoom, setCurrentZoom] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState(1);

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
    if (!svgRef.current || !projection) {
      return;
    }

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const path = d3.geoPath(projection);
    const root = svg.append('g');
    rootGroupRef.current = root.node() as SVGGElement;

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
        .selectAll('path')
        .data(countries)
        .enter()
        .append('path')
        .attr('class', 'country-shape')
        .attr('d', (d) => path(d) ?? '')
        .attr('fill', (d) => {
          const name = String(d.properties?.name ?? '');
          return selectedCountry && selectedCountry === name ? '#0a2a0f' : '#0a1a0f';
        })
        .attr('stroke', '#00c8ff')
        .attr('stroke-width', 0.4 / zoomScale) // Scale stroke with zoom
        .attr('opacity', 0.6)
        .style('cursor', 'pointer')
        .on('mouseenter', function () {
          d3.select(this).attr('fill', '#0d2a1a');
        })
        .on('mouseleave', function (_, d) {
          const name = String(d.properties?.name ?? '');
          d3.select(this).attr('fill', selectedCountry && selectedCountry === name ? '#0a2a0f' : '#0a1a0f');
        })
        .on('click', (_, d) => {
          const name = String(d.properties?.name ?? 'UNKNOWN');
          onCountrySelect(name);

          // Toggle zoom: if already zoomed to this country, reset; otherwise zoom to it
          if (currentZoom === name) {
            resetZoom(root, 800, d3.easeCubicInOut);
            setCurrentZoom(null);
          } else {
            zoomToFeature(d, root, projection, size.width, size.height, {
              padding: 40,
              duration: 800,
              easing: d3.easeCubicInOut,
              maxScale: 8,
            });
            setCurrentZoom(name);
          }
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
      .attr('r', 2 / zoomScale) // Scale city markers with zoom
      .attr('fill', 'var(--cyan-bright)');

    cityGroup
      .selectAll('text')
      .data(CITIES)
      .enter()
      .append('text')
      .attr('x', (d) => (projection(d.coords)?.[0] ?? -100) + 4)
      .attr('y', (d) => (projection(d.coords)?.[1] ?? -100) - 4)
      .attr('font-size', `${Math.max(7, 9 / zoomScale)}px`) // Prevent text from becoming illegible
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('fill', 'var(--text-secondary)')
      .text((d) => d.name);

    // Background click to reset zoom
    root
      .append('rect')
      .attr('class', 'zoom-reset')
      .attr('width', size.width)
      .attr('height', size.height)
      .attr('fill', 'transparent')
      .attr('pointer-events', 'all')
      .on('click', () => {
        if (currentZoom) {
          resetZoom(root, 800, d3.easeCubicInOut);
          setCurrentZoom(null);
        }
      });

    // Layer order: make interactive elements appear on top
    root.select('.countries-interactive').raise();

    const pointerMove = (event: MouseEvent) => {
      const [x, y] = d3.pointer(event, svg.node());
      const latLon = projection.invert ? projection.invert([x, y]) : null;
      if (latLon) {
        setMousePos({ lat: latLon[1], lon: latLon[0] });
      }
    };

    svg.on('mousemove', pointerMove);

    // Initialize zoom behavior
    zoomBehaviorRef.current = createMapZoom(svg, root, (transform) => {
      setZoomScale(transform.k);
    });

    return () => {
      svg.on('mousemove', null);
    };
  }, [countries, onCountrySelect, projection, selectedCountry, size.height, size.width, currentZoom, zoomScale]);

  return (
    <div className="map-container" ref={containerRef}>
      <svg ref={svgRef} className="map-svg" />
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
