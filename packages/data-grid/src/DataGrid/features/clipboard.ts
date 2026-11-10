import type { GridColDef, GridValidRowModel } from '../DataGrid.types';
import { getValueOptions } from './columns';

/**
 * Splits tab separated clipboard text into rows and cells.
 * Quoted cells may hold tabs, line breaks and doubled quotes, the way spreadsheets write them.
 */
export function parseClipboardText(text: string, delimiter = '\t'): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let cellStart = true;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"' && cellStart) {
      quoted = true;
      cellStart = false;
    } else if (text.startsWith(delimiter, index)) {
      index += delimiter.length - 1;
      row.push(cell);
      cell = '';
      cellStart = true;
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      cellStart = true;
    } else {
      cell += char;
      cellStart = false;
    }
  }
  // A trailing line break ends the last row, it does not start another one.
  if (cell !== '' || row.length > 0 || !cellStart) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export const SKIP_PASTE = Symbol('skip-paste');

/** Turns pasted text into the value a column stores, or `SKIP_PASTE` when the text does not fit the column. */
export function parsePastedValue<R extends GridValidRowModel>(
  column: GridColDef<R>,
  text: string,
  row: R,
): unknown | typeof SKIP_PASTE {
  if (column.valueParser) {
    return column.valueParser(text, row);
  }
  switch (column.type) {
    case 'number': {
      if (text.trim() === '') {
        return null;
      }
      const value = Number(text.replace(/,/g, ''));
      return Number.isNaN(value) ? SKIP_PASTE : value;
    }
    case 'boolean':
      return /^(true|yes|y|1)$/i.test(text.trim());
    case 'date':
    case 'dateTime': {
      if (text.trim() === '') {
        return null;
      }
      const date = new Date(text);
      return Number.isNaN(date.getTime()) ? SKIP_PASTE : date;
    }
    case 'singleSelect': {
      const wanted = text.trim().toLowerCase();
      const option = getValueOptions(column).find(
        (candidate) => String(candidate.label).toLowerCase() === wanted || String(candidate.value).toLowerCase() === wanted,
      );
      return option ? option.value : SKIP_PASTE;
    }
    default:
      return text;
  }
}
