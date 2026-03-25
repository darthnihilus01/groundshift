import * as d3 from 'd3';
import type { GeoJsonProperties, Geometry } from 'geojson';

export interface ZoomState {
  currentZoom: string | null; // stores the name of the currently zoomed country
  isAnimating: boolean;
}

/**
 * Calculate geographic bounds (min/max lon/lat) from a GeoJSON feature.
 * This is more robust than using feature.bbox which may not exist.
 */
export function getBoundsFromFeature(
  feature: GeoJSON.Feature<Geometry, GeoJsonProperties>,
): [[number, number], [number, number]] | null {
  if (!feature.geometry) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const extractCoordinates = (coords: any): void => {
    if (Array.isArray(coords[0])) {
      coords.forEach((c: any) => extractCoordinates(c));
    } else {
      const [lon, lat] = coords;
      if (typeof lon === 'number' && typeof lat === 'number') {
        minX = Math.min(minX, lon);
        maxX = Math.max(maxX, lon);
        minY = Math.min(minY, lat);
        maxY = Math.max(maxY, lat);
      }
    }
  };

  if (feature.geometry.type === 'Point') {
    const [lon, lat] = feature.geometry.coordinates as [number, number];
    return [
      [lon, lat],
      [lon, lat],
    ];
  }

  if (feature.geometry.type === 'Polygon') {
    extractCoordinates(feature.geometry.coordinates);
  } else if (feature.geometry.type === 'MultiPolygon') {
    extractCoordinates(feature.geometry.coordinates);
  } else if (feature.geometry.type === 'LineString') {
    extractCoordinates(feature.geometry.coordinates);
  } else if (feature.geometry.type === 'MultiLineString') {
    extractCoordinates(feature.geometry.coordinates);
  }

  return isFinite(minX) && isFinite(maxX) && isFinite(minY) && isFinite(maxY)
    ? [
        [minX, minY],
        [maxX, maxY],
      ]
    : null;
}

/**
 * Calculate the optimal scale and translate to fit geographic bounds into the viewport.
 * Takes into account padding and the current projection.
 *
 * @param projection - d3 geo projection (e.g., d3.geoNaturalEarth1())
 * @param geoBounds - [[minLon, minLat], [maxLon, maxLat]]
 * @param svgWidth - SVG viewport width
 * @param svgHeight - SVG viewport height
 * @param padding - padding around the zoomed feature (in pixels)
 * @returns { k, tx, ty } - scale, translate-x, translate-y for d3.zoomTransform
 */
export function getTransformFromBounds(
  projection: d3.GeoProjection,
  geoBounds: [[number, number], [number, number]],
  svgWidth: number,
  svgHeight: number,
  padding: number = 40,
): { k: number; tx: number; ty: number } {
  const [[minLon, minLat], [maxLon, maxLat]] = geoBounds;

  // Project the bounds corners to screen space
  const [x0, y0] = projection([minLon, minLat]) || [0, 0];
  const [x1, y1] = projection([maxLon, maxLat]) || [svgWidth, svgHeight];

  // Calculate bounding box in screen space
  const screenBounds = {
    x0: Math.min(x0, x1),
    y0: Math.min(y0, y1),
    x1: Math.max(x0, x1),
    y1: Math.max(y0, y1),
  };

  const screenWidth = screenBounds.x1 - screenBounds.x0;
  const screenHeight = screenBounds.y1 - screenBounds.y0;

  // Ensure minimum dimensions to handle very small countries
  const minDimension = 50;
  const adjustedWidth = Math.max(screenWidth, minDimension);
  const adjustedHeight = Math.max(screenHeight, minDimension);

  // Calculate scale to fit the feature
  const kWidth = (svgWidth - 2 * padding) / adjustedWidth;
  const kHeight = (svgHeight - 2 * padding) / adjustedHeight;
  const k = Math.min(kWidth, kHeight, 8); // Cap scale at 8x

  // Calculate center of the feature in screen space
  const centerX = screenBounds.x0 + screenWidth / 2;
  const centerY = screenBounds.y0 + screenHeight / 2;

  // Center the scaled feature in the viewport
  const tx = svgWidth / 2 - k * centerX;
  const ty = svgHeight / 2 - k * centerY;

  return { k: Math.max(k, 1), tx, ty }; // Ensure scale >= 1
}

/**
 * Apply zoom transform to a D3 selection (typically a <g> element).
 * Automatically updates d3.zoom's internal state.
 *
 * @param selection - D3 selection of the element to transform
 * @param transform - { k, tx, ty } transform parameters
 * @param duration - animation duration in ms (0 = no animation)
 * @param easing - d3.easingFn (default: d3.easeCubicInOut)
 */
export function applyTransform(
  selection: d3.Selection<SVGGElement, any, any, any>,
  transform: { k: number; tx: number; ty: number },
  duration: number = 800,
  easing: (t: number) => number = d3.easeCubicInOut,
): void {
  const zoomTransform = d3.zoomIdentity.translate(transform.tx, transform.ty).scale(transform.k);

  if (duration > 0) {
    selection.transition().duration(duration).ease(easing).attr('transform', zoomTransform.toString());
  } else {
    selection.attr('transform', zoomTransform.toString());
  }

  // Update d3.zoom's internal state (important for consistency)
  const node = selection.node();
  if (node) {
    (node as any).__zoom = zoomTransform;
  }
}

/**
 * Zoom to a specific country feature with animation.
 * Handles the full zoom-to-feature workflow.
 *
 * @param feature - GeoJSON feature to zoom to
 * @param selection - D3 selection of the container g element
 * @param projection - d3 geo projection
 * @param svgWidth - SVG viewport width
 * @param svgHeight - SVG viewport height
 * @param options - { padding, duration, easing, minScale, maxScale }
 */
export function zoomToFeature(
  feature: GeoJSON.Feature<Geometry, GeoJsonProperties>,
  selection: d3.Selection<SVGGElement, any, any, any>,
  projection: d3.GeoProjection,
  svgWidth: number,
  svgHeight: number,
  options: {
    padding?: number;
    duration?: number;
    easing?: (t: number) => number;
    minScale?: number;
    maxScale?: number;
  } = {},
): void {
  const { padding = 40, duration = 800, easing = d3.easeCubicInOut, maxScale = 8 } = options;

  const bounds = getBoundsFromFeature(feature);
  if (!bounds) {
    console.warn('Could not calculate bounds for feature', feature);
    return;
  }

  const transform = getTransformFromBounds(projection, bounds, svgWidth, svgHeight, padding);

  // Cap the scale
  const constrainedTransform = {
    ...transform,
    k: Math.min(transform.k, maxScale),
  };

  applyTransform(selection, constrainedTransform, duration, easing);
}

/**
 * Reset zoom to the original full-world view with animation.
 *
 * @param selection - D3 selection of the container g element
 * @param duration - animation duration in ms
 * @param easing - d3.easing function
 */
export function resetZoom(
  selection: d3.Selection<SVGGElement, any, any, any>,
  duration: number = 800,
  easing: (t: number) => number = d3.easeCubicInOut,
): void {
  const resetTransform = { k: 1, tx: 0, ty: 0 };
  applyTransform(selection, resetTransform, duration, easing);
}

/**
 * Create a d3.zoom behavior configured for map interaction.
 * Includes scale constraints and proper event handling.
 *
 * @param svgSelection - D3 selection of the SVG element
 * @param gSelection - D3 selection of the g element to be zoomed
 * @param onZoom - callback fired during zoom (useful for stroke-width scaling)
 * @returns the zoom behavior instance
 */
export function createMapZoom(
  svgSelection: d3.Selection<SVGSVGElement, any, any, any>,
  gSelection: d3.Selection<SVGGElement, any, any, any>,
  onZoom?: (transform: d3.ZoomTransform) => void,
): d3.ZoomBehavior<SVGSVGElement, unknown> {
  const zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([1, 8])
    .on('zoom', (event) => {
      gSelection.attr('transform', event.transform);
      onZoom?.(event.transform);
    });

  svgSelection.call(zoom);
  return zoom;
}
