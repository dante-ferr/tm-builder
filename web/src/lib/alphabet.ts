/** Machine symbols are single Unicode characters, including spaces. */
export function alphabetIssue(symbols: string[], label: string): string {
  if (symbols.some(symbol => Array.from(symbol).length !== 1)) return `${label}: enter one character per symbol.`;
  if (new Set(symbols).size !== symbols.length) return `${label}: each symbol must be unique.`;
  return '';
}
