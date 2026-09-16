// RFC 4180 CSV with spreadsheet formula-injection neutralisation.

// Cells starting with these are evaluated as formulas by Excel/Sheets/Calc.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function csvCell(value: string): string {
  let v = value ?? '';
  if (FORMULA_PREFIX.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) || v !== v.trim() ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function downloadCsv(filename: string, rows: string[][]): void {
  // BOM so Excel opens UTF-8 correctly.
  const blob = new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
