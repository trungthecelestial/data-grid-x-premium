import type { GridColDef, GridValidRowModel } from '../DataGrid.types';
import { getCellValue, getFormattedValue } from './columns';

export interface CsvOptions {
  delimiter?: string;
  includeHeaders?: boolean;
}

function exportValue<R extends GridValidRowModel>(row: R, column: GridColDef<R>): string {
  const value = getCellValue(row, column);
  if (typeof value === 'number' || typeof value === 'boolean') {
    return column.valueFormatter ? column.valueFormatter(value, row) : String(value);
  }
  return getFormattedValue(row, column, value);
}

function escapeCsv(value: string, delimiter: string): string {
  return value.includes('"') || value.includes('\n') || value.includes('\r') || value.includes(delimiter)
    ? `"${value.replace(/"/g, '""')}"`
    : value;
}

export function buildCsv<R extends GridValidRowModel>(
  rows: readonly R[],
  columns: readonly GridColDef<R>[],
  { delimiter = ',', includeHeaders = true }: CsvOptions = {},
): string {
  const lines: string[] = [];
  if (includeHeaders) {
    lines.push(columns.map((column) => escapeCsv(column.headerName ?? column.field, delimiter)).join(delimiter));
  }
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCsv(exportValue(row, column), delimiter)).join(delimiter));
  }
  return lines.join('\r\n');
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildPrintHtml<R extends GridValidRowModel>(
  rows: readonly R[],
  columns: readonly GridColDef<R>[],
  title = 'Data grid',
): string {
  const head = columns.map((column) => `<th>${escapeHtml(column.headerName ?? column.field)}</th>`).join('');
  const body = rows
    .map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(exportValue(row, column))}</td>`).join('')}</tr>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:Roboto,Arial,sans-serif;font-size:14px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}th{background:#f5f5f5}</style></head><body><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}

export function downloadFile(fileName: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Prints through a hidden iframe so the page itself is left untouched. */
export function printHtml(html: string): void {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const frameWindow = frame.contentWindow;
  if (!frameWindow) {
    frame.remove();
    return;
  }
  frameWindow.document.open();
  frameWindow.document.write(html);
  frameWindow.document.close();
  frameWindow.focus();
  frameWindow.print();
  setTimeout(() => frame.remove(), 1000);
}
