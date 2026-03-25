import * as d3 from 'd3';
import type { Feature, GeoJsonProperties, Geometry } from 'geojson';

const TILE_SIZE = 256;
const TERRARIUM_TILE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';

export interface TerrainBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface TerrainGrid {
  width: number;
  height: number;
  heights: Float32Array;
  bounds: TerrainBounds;
}

export interface TerrainLoadOptions {
  zoom?: number;
  maxDimension?: number;
}

function clampLat(lat: number): number {
  return Math.max(-85.05112878, Math.min(85.05112878, lat));
}

function normalizeLng(lng: number): number {
  let wrapped = lng;
  while (wrapped < -180) wrapped += 360;
  while (wrapped > 180) wrapped -= 360;
  return wrapped;
}

function lngLatToTile(lng: number, lat: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const safeLat = clampLat(lat);
  const safeLng = normalizeLng(lng);
  const latRad = (safeLat * Math.PI) / 180;

  const x = Math.floor(((safeLng + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);

  return {
    x: Math.max(0, Math.min(n - 1, x)),
    y: Math.max(0, Math.min(n - 1, y)),
  };
}

function tileToLngLat(tileX: number, tileY: number, zoom: number): { lng: number; lat: number } {
  const n = 2 ** zoom;
  const lng = (tileX / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * tileY) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lng, lat };
}

function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

function chooseZoom(bounds: TerrainBounds): number {
  const lngSpanRaw = Math.abs(bounds.east - bounds.west);
  const lngSpan = Math.min(lngSpanRaw, 360 - lngSpanRaw);
  const latSpan = Math.abs(bounds.north - bounds.south);
  const span = Math.max(lngSpan, latSpan);

  if (span > 90) return 5;
  if (span > 45) return 6;
  if (span > 20) return 7;
  if (span > 10) return 8;
  if (span > 5) return 9;
  if (span > 2) return 10;
  return 11;
}

async function fetchTileBitmap(zoom: number, x: number, y: number): Promise<ImageBitmap> {
  const url = `${TERRARIUM_TILE_URL}/${zoom}/${x}/${y}.png`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch terrain tile ${zoom}/${x}/${y}`);
  }

  const blob = await response.blob();
  return createImageBitmap(blob);
}

export function countryBounds(feature: Feature<Geometry, GeoJsonProperties>): TerrainBounds {
  const [[west, south], [east, north]] = d3.geoBounds(feature as any);
  return { west, south, east, north };
}

export async function loadTerrainForCountry(
  feature: Feature<Geometry, GeoJsonProperties>,
  options: TerrainLoadOptions = {},
): Promise<TerrainGrid> {
  const bounds = countryBounds(feature);
  const zoom = options.zoom ?? chooseZoom(bounds);
  const maxDimension = options.maxDimension ?? 320;

  const nw = lngLatToTile(bounds.west, bounds.north, zoom);
  const se = lngLatToTile(bounds.east, bounds.south, zoom);

  const xMin = Math.min(nw.x, se.x);
  const xMax = Math.max(nw.x, se.x);
  const yMin = Math.min(nw.y, se.y);
  const yMax = Math.max(nw.y, se.y);

  const tilesX = xMax - xMin + 1;
  const tilesY = yMax - yMin + 1;
  const totalTiles = tilesX * tilesY;

  if (totalTiles > 100) {
    throw new Error('Terrain request too large for interactive mode');
  }

  const stitchedWidth = tilesX * TILE_SIZE;
  const stitchedHeight = tilesY * TILE_SIZE;

  const stitchCanvas = document.createElement('canvas');
  stitchCanvas.width = stitchedWidth;
  stitchCanvas.height = stitchedHeight;

  const stitchContext = stitchCanvas.getContext('2d', { willReadFrequently: true });
  if (!stitchContext) {
    throw new Error('Terrain stitch context unavailable');
  }

  const tileTasks: Promise<void>[] = [];

  for (let y = yMin; y <= yMax; y += 1) {
    for (let x = xMin; x <= xMax; x += 1) {
      tileTasks.push(
        fetchTileBitmap(zoom, x, y).then((bitmap) => {
          const drawX = (x - xMin) * TILE_SIZE;
          const drawY = (y - yMin) * TILE_SIZE;
          stitchContext.drawImage(bitmap, drawX, drawY);
          bitmap.close();
        }),
      );
    }
  }

  await Promise.all(tileTasks);

  const scale = Math.min(1, maxDimension / Math.max(stitchedWidth, stitchedHeight));
  const outputWidth = Math.max(2, Math.floor(stitchedWidth * scale));
  const outputHeight = Math.max(2, Math.floor(stitchedHeight * scale));

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;

  const outputContext = outputCanvas.getContext('2d', { willReadFrequently: true });
  if (!outputContext) {
    throw new Error('Terrain sample context unavailable');
  }

  outputContext.drawImage(stitchCanvas, 0, 0, outputWidth, outputHeight);
  const rgba = outputContext.getImageData(0, 0, outputWidth, outputHeight).data;

  const heights = new Float32Array(outputWidth * outputHeight);
  for (let idx = 0, p = 0; idx < heights.length; idx += 1, p += 4) {
    heights[idx] = decodeTerrarium(rgba[p], rgba[p + 1], rgba[p + 2]);
  }

  const nwLngLat = tileToLngLat(xMin, yMin, zoom);
  const seLngLat = tileToLngLat(xMax + 1, yMax + 1, zoom);

  return {
    width: outputWidth,
    height: outputHeight,
    heights,
    bounds: {
      west: nwLngLat.lng,
      north: nwLngLat.lat,
      east: seLngLat.lng,
      south: seLngLat.lat,
    },
  };
}
