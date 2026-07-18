/**
 * frontend/src/lib/analytics/heatmap.ts
 * =========================================
 * Pure color-intensity math for the Heatmap chart (Analytics.md §6.5/§13:
 * "sequential palette, single-hue light -> dark ramp"). The matrix itself
 * reuses chartData.buildPivotTable() unchanged — a heatmap and a pivot
 * table are the same rowDim x colDim x measure shape, only the cell
 * rendering differs (color intensity vs. formatted text).
 */

/** The [min, max] of the non-null values — the range the color ramp spans. */
export function heatmapRange(values: (number | null)[]): { min: number; max: number } | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

/** Normalize a value to [0, 1] within [min, max] — the fill opacity for one cell. Null/degenerate range -> 0. */
export function cellIntensity(value: number | null, range: { min: number; max: number } | null): number {
  if (value == null || range == null) return 0;
  if (range.max === range.min) return value > 0 ? 1 : 0;
  return Math.min(1, Math.max(0, (value - range.min) / (range.max - range.min)));
}
