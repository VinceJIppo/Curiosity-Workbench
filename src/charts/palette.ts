// Brand chart order (colorblind-aware): indigo, orange, fuchsia, light blue, gray.
// These fail strict contrast and deuteranopia checks on white, so every chart adds
// secondary encoding: a dash pattern per series, direct end labels and a legend.
export const SERIES = ['#8098F9', '#FF8C42', '#D785F7', '#87B5F6', '#B6B6B6'];
export const DASHES = ['', '9 5', '3 4', '12 4 3 4', '2 3'];
export const INK = '#222222';
export const MUTED = '#5f5f5f';
export const GRID = '#ececec';

/** Color by entity position, never by rank. Baseline is gray. */
export function scenarioColor(index: number, isBaseline: boolean): string {
  if (isBaseline) return SERIES[4];
  return SERIES[index % 4];
}
export function scenarioDash(index: number, isBaseline: boolean): string {
  if (isBaseline) return DASHES[4];
  return DASHES[index % 4];
}
