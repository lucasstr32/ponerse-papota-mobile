/** Formats a number with decimal comma, up to 2 decimals and no trailing zeros. */
export function formatDecimal(x: number): string {
  return String(Number(x.toFixed(2))).replace('.', ',');
}

/** Parses user input accepting comma or point decimals. Returns null when there is no value. */
export function num(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(normalized)) return null;
  return Number(normalized);
}
