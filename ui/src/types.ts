export interface Watch {
  id: string
  name: string
  aoi_wkt: string
  threshold: number
  description?: string
  created_at: string
  active: boolean
}

export interface Alert {
  id: string
  watch_id: string
  watch_name: string
  severity: 'critical' | 'moderate' | 'low'
  change_score: number
  location: string
  geojson_path: string
  probable_cause: string
  fired_at: string
  aoi_wkt: string
}

export type LayerId = 'anomalies' | 'flights' | 'news'

export interface LayerState {
  id: LayerId
  label: string
  active: boolean
  color: string
}
