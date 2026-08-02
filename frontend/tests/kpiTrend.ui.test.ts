import { describe, expect, it } from 'vitest';
import { getTrendDirection, getTrendPercent } from '@/widgets/kpi-bar/trend';

describe('KPI trend helpers', () => {
  it('returns a stable direction when there is no previous value', () => {
    expect(getTrendDirection(12)).toBe('stable');
  });

  it('returns the direction and percentage change for comparable values', () => {
    expect(getTrendDirection(15, 10)).toBe('up');
    expect(getTrendDirection(8, 10)).toBe('down');
    expect(getTrendPercent(15, 10)).toBe(50);
  });

  it('does not calculate a percentage from a zero baseline', () => {
    expect(getTrendPercent(5, 0)).toBeNull();
  });
});
