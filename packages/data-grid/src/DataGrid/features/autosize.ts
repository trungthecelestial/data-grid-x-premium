import type { GridColDef, GridValidRowModel } from '../DataGrid.types';
import { DEFAULT_MIN_WIDTH, getCellValue, getFormattedValue } from './columns';

/** Horizontal padding of a cell (10px each side) plus a little room so text is not clipped. */
const CELL_PADDING = 24;
/** Room for the sort arrow and the menu button next to a header label. */
const HEADER_CHROME = 56;
/** Used when no canvas is available (server rendering, jsdom). */
const FALLBACK_CHAR_WIDTH = 8;

let canvasContext: CanvasRenderingContext2D | null | undefined;

function getContext(): CanvasRenderingContext2D | null {
  if (canvasContext === undefined) {
    try {
      canvasContext = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
    } catch {
      canvasContext = null;
    }
  }
  return canvasContext;
}

export function measureText(text: string, font: string): number {
  const context = getContext();
  if (!context) {
    return text.length * FALLBACK_CHAR_WIDTH;
  }
  context.font = font;
  return context.measureText(text).width;
}

export interface AutosizeInput<R extends GridValidRowModel> {
  columns: readonly GridColDef<R>[];
  rows: readonly R[];
  font: string;
  includeHeaders: boolean;
  extraWidth: number;
  maxRows: number;
}

/** Returns the width each column needs to show its widest sampled value without truncation, within its min and max. */
export function computeAutosizeWidths<R extends GridValidRowModel>({
  columns,
  rows,
  font,
  includeHeaders,
  extraWidth,
  maxRows,
}: AutosizeInput<R>): Record<string, number> {
  const sample = rows.length > maxRows ? rows.slice(0, maxRows) : rows;
  const result: Record<string, number> = {};
  for (const column of columns) {
    let widest = 0;
    if (includeHeaders) {
      widest = measureText(column.headerName ?? column.field, `600 ${font}`) + HEADER_CHROME;
    }
    for (const row of sample) {
      const text = getFormattedValue(row, column, getCellValue(row, column));
      widest = Math.max(widest, measureText(text, font) + CELL_PADDING);
    }
    const min = column.minWidth ?? DEFAULT_MIN_WIDTH;
    const max = column.maxWidth ?? Infinity;
    result[column.field] = Math.round(Math.min(max, Math.max(min, widest + extraWidth)));
  }
  return result;
}
