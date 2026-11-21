export interface StoredActivity {
  id: number;
  name: string;
  sportType: string;
  startLocal: string; // start_date_local, for example 2026-06-14T07:31:02Z
  distance: number; // meters
  movingTime: number; // seconds
}

export interface ActivityCache {
  version: 1;
  athleteId: number;
  syncedAt: number; // epoch milliseconds of the last full sync
  activities: StoredActivity[];
}

export type Metric = 'distance' | 'duration';
