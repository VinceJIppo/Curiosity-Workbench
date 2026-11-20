// Small pure calculations shared by the engine, build vs buy and the golden tests.
// Round only at display, never here.

/** a / b, NaN when b is zero or either side is not a number. */
export function ratio(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return NaN;
  return a / b;
}

/** Specialists needed to hold a coverage line: ceil(sellers / sellersPerSpecialist). */
export function specialistsNeeded(sellers: number, sellersPerSpecialist: number): number {
  return Math.ceil(sellers / sellersPerSpecialist);
}

/** Loaded cost from cash comp and wage share: comp / wageShare. */
export function loadedFromWageShare(cashComp: number, wageShare: number): number {
  return cashComp / wageShare;
}

/** Loaded cost from cash comp and burden: comp x (1 + burden). */
export function loadedFromBurden(cashComp: number, burden: number): number {
  return cashComp * (1 + burden);
}
