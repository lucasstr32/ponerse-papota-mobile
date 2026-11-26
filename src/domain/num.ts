/** Parses user input accepting comma or point decimals. Returns null when there is no value. */
export function num(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(normalized)) return null;
  return Number(normalized);
}
