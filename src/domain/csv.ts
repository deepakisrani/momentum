/** Serialize rows to RFC-4180 CSV. A field is quoted only when it contains a
 * comma, double-quote, or newline; interior double-quotes are doubled. */
export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const escape = (v: string | number): string => {
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))]
  return lines.join('\n')
}
