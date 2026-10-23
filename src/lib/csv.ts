/** A column in an exported CSV: its heading and how to read the value from a row. */
export type CsvColumn<T> = { header: string; value: (row: T) => string | number | boolean | null | undefined };

function cell(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  // Quote anything with a comma, quote or line break; stop spreadsheet formula injection
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]) {
  const lines = [columns.map((c) => cell(c.header)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => cell(c.value(row))).join(","));
  return lines.join("\r\n");
}

/** Downloads rows as a CSV file named like "maslink-users-2026-10-23.csv". */
export function downloadCsv<T>(name: string, rows: T[], columns: CsvColumn<T>[]) {
  // A byte order mark so Excel opens UTF-8 (names with accents, the rand sign) correctly
  const blob = new Blob(["﻿", toCsv(rows, columns)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `maslink-${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
