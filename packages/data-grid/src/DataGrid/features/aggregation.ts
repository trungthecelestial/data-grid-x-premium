import type {
  GridAggregationFunction,
  GridAggregationModel,
  GridColDef,
  GridValidRowModel,
} from '../DataGrid.types';
import { getCellValue, getFormattedValue } from './columns';
import { compareValues } from './sorting';

export function aggregateValues(fn: GridAggregationFunction, values: readonly unknown[]): unknown {
  if (fn === 'size') {
    return values.length;
  }
  const present = values.filter((value) => value !== null && value !== undefined && value !== '');
  if (present.length === 0) {
    return null;
  }
  switch (fn) {
    case 'sum':
      return present.reduce<number>((total, value) => total + Number(value), 0);
    case 'avg':
      return present.reduce<number>((total, value) => total + Number(value), 0) / present.length;
    case 'min':
      return present.reduce((best, value) => (compareValues(value, best) < 0 ? value : best));
    case 'max':
      return present.reduce((best, value) => (compareValues(value, best) > 0 ? value : best));
    default:
      return null;
  }
}

/** Aggregated value per field of the model, over `rows`. */
export function computeAggregates<R extends GridValidRowModel>(
  rows: readonly R[],
  model: GridAggregationModel,
  columns: ReadonlyMap<string, GridColDef<R>>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [field, fn] of Object.entries(model)) {
    const column = columns.get(field);
    if (column) {
      result[field] = aggregateValues(
        fn,
        rows.map((row) => getCellValue(row, column)),
      );
    }
  }
  return result;
}

export function formatAggregate<R extends GridValidRowModel>(
  fn: GridAggregationFunction,
  value: unknown,
  column: GridColDef<R>,
): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'number' && (fn === 'avg' || fn === 'size')) {
    return Number(value.toFixed(2)).toLocaleString();
  }
  if (typeof value === 'number' && !column.valueFormatter) {
    return Number(value.toFixed(2)).toLocaleString();
  }
  return getFormattedValue({} as R, column, value);
}
