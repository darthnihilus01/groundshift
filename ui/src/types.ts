export type TabType = 'tacmap' | 'watches' | 'alerts' | 'database';

export interface Watch {
  id: string;
  name: string;
  aoi_wkt?: string;
  threshold: number;
  description?: string;
  created_at?: string;
  active: boolean;
}

export interface Alert {
  id: string;
  watch_id?: string;
  watch_name?: string;
  timestamp?: string;
  fired_at?: string;
  severity: 'critical' | 'moderate' | 'low';
  change_score?: number;
  score?: number;
  location: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  geojson_path?: string;
  probable_cause?: string;
  cause?: string;
  aoi_wkt?: string;
  ndvi_loss?: number;
  before_image?: string;
  after_image?: string;
}

export type LayerId = 'anomalies' | 'flights' | 'news';

export interface LayerState {
  id: LayerId;
  label: string;
  active: boolean;
  count?: number;
}

