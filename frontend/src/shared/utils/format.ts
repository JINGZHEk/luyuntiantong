import dayjs from 'dayjs';
import { RiskLevel } from '@/types/common';

export function formatTimestamp(ts: string): string {
  return dayjs(ts).format('HH:mm:ss.SSS');
}

export function formatDate(ts: string): string {
  return dayjs(ts).format('YYYY-MM-DD HH:mm:ss');
}

export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatLatency(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function riskLevelToNumber(level: RiskLevel): number {
  const map: Record<RiskLevel, number> = { low: 1, medium: 2, high: 3, critical: 4 };
  return map[level];
}

export function numberToRiskLevel(n: number): RiskLevel {
  if (n <= 1) return 'low';
  if (n <= 2) return 'medium';
  if (n <= 3) return 'high';
  return 'critical';
}
