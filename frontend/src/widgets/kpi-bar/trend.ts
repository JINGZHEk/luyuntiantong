export type TrendDirection = 'up' | 'down' | 'stable';

export function getTrendDirection(current: number, previous?: number): TrendDirection {
  if (previous === undefined || current === previous) return 'stable';
  return current > previous ? 'up' : 'down';
}

export function getTrendPercent(current: number, previous?: number): number | null {
  if (previous === undefined || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
