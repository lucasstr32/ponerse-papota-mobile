/** Rounds a quotient to 6 decimals so floating point noise cannot flip a half. */
function snap6(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

/** Rounds a computed weight to 2 decimals, absorbing floating point noise. */
export function snapKg(x: number): number {
  return Math.round(snap6(x * 100)) / 100;
}

/** Rounds to the nearest 2.5 (smallest plate pair), halves go up. */
export function round25(x: number): number {
  return Math.round(snap6(x / 2.5)) * 2.5;
}

/** Rounds to the nearest 0.5, halves go up. */
export function roundHalf(x: number): number {
  return Math.round(snap6(x / 0.5)) * 0.5;
}

/** Epley one rep max estimate. Not rounded and not capped: callers decide. */
export function epley(weight: number, reps: number): number {
  if (reps <= 1) return weight;
  return weight * (1 + reps / 30);
}
