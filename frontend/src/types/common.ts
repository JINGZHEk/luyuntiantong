export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface Velocity {
  vx: number;
  vy: number;
}

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TimeSeriesPoint {
  time: string;
  value: number;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  source: string;
  message: string;
}

export interface KpiItem {
  label: string;
  value: number;
  unit: string;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: number;
}

export type ThemeMode = 'dark' | 'light';

export interface PageState {
  loading: boolean;
  error: string | null;
  empty: boolean;
}
