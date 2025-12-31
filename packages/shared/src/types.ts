import type { Hex } from 'viem';

// ============================================
// Strava API Types
// ============================================

export interface StravaAthlete {
  id: number;
  username: string;
  firstname: string;
  lastname: string;
  profile: string;
}

export interface StravaSegment {
  id: number;
  name: string;
  activity_type: string;
  distance: number;
  average_grade?: number;
  maximum_grade?: number;
  elevation_high?: number;
  elevation_low?: number;
}

export interface StravaSegmentEffort {
  id: number;
  segment: StravaSegment;
  elapsed_time: number;
  start_date: string;
}

export interface StravaTokenResponse {
  token_type: string;
  expires_at: number;
  expires_in: number;
  refresh_token: string;
  access_token: string;
  athlete: StravaAthlete;
}

// ============================================
// Application Types
// ============================================

export interface Segment {
  id: number;
  name: string;
  distance: number;
  activityType: string;
  completionDate: string;
}

export interface Activity {
  id: number;
  name: string;
  type: string;
  startDate: string;
  distance: number;
  segments?: Segment[];
  /** Whether segments have been fetched (true even if 0 segments) */
  segmentsLoaded?: boolean;
}

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  athlete: StravaAthlete | null;
}

export interface SignedSegment {
  segmentId: number;
  completionDate: number;
  signature: Hex;
}

// ============================================
// API Response Types (used by frontend)
// ============================================

export interface SegmentEffort {
  id: number;
  segment: {
    id: number;
    name: string;
    activity_type: string;
    distance: number;
  };
  start_date: string;
}

export interface ActivityDetails {
  id: number;
  name: string;
  type: string;
  start_date: string;
  segment_efforts: SegmentEffort[];
}
