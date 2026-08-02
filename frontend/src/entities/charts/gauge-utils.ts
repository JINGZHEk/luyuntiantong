export function normalizeGaugeRange(min: number, max: number): { min: number; max: number } {
  if (min <= max && min !== max) return { min, max };
  if (min === max) return { min, max: max + 1 };
  return { min: max, max: min };
}
