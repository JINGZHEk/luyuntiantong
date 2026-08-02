import { describe, expect, it } from 'vitest';
import { normalizeGaugeRange } from '@/entities/charts/gauge-utils';

describe('gauge range', () => {
  it('keeps a valid range unchanged', () => {
    expect(normalizeGaugeRange(0, 10)).toEqual({ min: 0, max: 10 });
  });

  it('widens an equal range to avoid a zero denominator', () => {
    expect(normalizeGaugeRange(2, 2)).toEqual({ min: 2, max: 3 });
  });

  it('widens a reversed range around the lower bound', () => {
    expect(normalizeGaugeRange(8, 2)).toEqual({ min: 2, max: 8 });
  });
});
