/**
 * Tiny, pure RFC 4180 CSV serializer. No I/O, no deps — kept simple so it's easy to
 * reason about (and unit-test) and can't drift from the export route's needs.
 *
 * Escaping: a field is quoted when it contains a comma, double-quote, CR, or LF; any
 * internal double-quote is doubled. null / undefined → empty field. Numbers are emitted
 * as-is (plain, no thousands separators or currency) so a spreadsheet reads them numeric.
 */
export type CsvCell = string | number | null | undefined;

function escapeCell(cell: CsvCell): string {
  if (cell == null) return "";
  const s = typeof cell === "number" ? (Number.isFinite(cell) ? String(cell) : "") : String(cell);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Serialize a header row + data rows to a CSV string with CRLF line endings.
 * Prepends a UTF-8 BOM so Excel opens accented text cleanly.
 */
export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}
