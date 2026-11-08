import type {
  GridAggregationFunction,
  GridAggregationFunctionDef,
  GridAggregationModel,
  GridColDef,
  GridLocaleText,
  GridRowId,
  GridValidRowModel,
} from '../DataGrid.types';
import { getCellValue, getFormattedValue } from './columns';
import { compareValues } from './sorting';

export type GridAggregationFunctions = Readonly<Record<string, GridAggregationFunctionDef>>;

const withoutEmpty = (values: readonly unknown[]) => values.filter((value) => value !== null && value !== undefined && value !== '');

/** Wraps a calculation so it only sees filled values and yields `null` when there are none. */
const overFilledValues =
  (calculate: (values: unknown[]) => unknown): GridAggregationFunctionDef['apply'] =>
  ({ values }) => {
    const filled = withoutEmpty(values);
    return filled.length === 0 ? null : calculate(filled);
  };

const total = (values: readonly unknown[]) => values.reduce<number>((sum, value) => sum + Number(value), 0);

/** The built-in functions. Spread them into `aggregationFunctions` to add your own next to them. */
export const GRID_AGGREGATION_FUNCTIONS: GridAggregationFunctions = {
  sum: { columnTypes: ['number'], apply: overFilledValues(total) },
  avg: { columnTypes: ['number'], apply: overFilledValues((values) => total(values) / values.length) },
  min: {
    columnTypes: ['number', 'date', 'dateTime'],
    apply: overFilledValues((values) => values.reduce((best, value) => (compareValues(value, best) < 0 ? value : best))),
  },
  max: {
    columnTypes: ['number', 'date', 'dateTime'],
    apply: overFilledValues((values) => values.reduce((best, value) => (compareValues(value, best) > 0 ? value : best))),
  },
  size: { apply: ({ values }) => values.length },
};

export function aggregateValues(
  fn: GridAggregationFunction,
  values: readonly unknown[],
  functions: GridAggregationFunctions = GRID_AGGREGATION_FUNCTIONS,
): unknown {
  return functions[fn]?.apply({ values: [...values], field: '', groupId: null }) ?? null;
}

/** The value a function reads from a row: its `getCellValue` result, or the cell value. */
export function getAggregationInput<R extends GridValidRowModel>(
  def: GridAggregationFunctionDef,
  row: R,
  column: GridColDef<R>,
): unknown {
  const value = getCellValue(row, column);
  return def.getCellValue ? def.getCellValue({ field: column.field, row, value }) : value;
}

/** Aggregated value per field of the model, over `rows`. Fields with an unknown column or function are left out. */
export function computeAggregates<R extends GridValidRowModel>(
  rows: readonly R[],
  model: GridAggregationModel,
  columns: ReadonlyMap<string, GridColDef<R>>,
  functions: GridAggregationFunctions = GRID_AGGREGATION_FUNCTIONS,
  groupId: GridRowId | null = null,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [field, fn] of Object.entries(model)) {
    const column = columns.get(field);
    const def = functions[fn];
    if (column && def) {
      result[field] = def.apply({ values: rows.map((row) => getAggregationInput(def, row, column)), field, groupId }) ?? null;
    }
  }
  return result;
}

export function formatAggregate<R extends GridValidRowModel>(
  fn: GridAggregationFunction,
  value: unknown,
  column: GridColDef<R>,
  def?: GridAggregationFunctionDef,
): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (def?.valueFormatter) {
    return def.valueFormatter(value);
  }
  if (typeof value === 'number' && (fn === 'avg' || fn === 'size')) {
    return Number(value.toFixed(2)).toLocaleString();
  }
  if (typeof value === 'number' && !column.valueFormatter) {
    return Number(value.toFixed(2)).toLocaleString();
  }
  return getFormattedValue({} as R, column, value);
}

export function getAggregationLabel(
  fn: GridAggregationFunction,
  functions: GridAggregationFunctions,
  localeText: Pick<GridLocaleText, 'aggregationFunctions'>,
): string {
  return functions[fn]?.label ?? localeText.aggregationFunctions[fn] ?? fn;
}

/** Functions offered for a column: its own `availableAggregationFunctions`, or every function that accepts its type. */
export function getAvailableAggregationFunctions(
  column: GridColDef<any>,
  functions: GridAggregationFunctions = GRID_AGGREGATION_FUNCTIONS,
): GridAggregationFunction[] {
  if (column.type === 'actions' || column.aggregable === false) {
    return [];
  }
  if (column.availableAggregationFunctions) {
    return column.availableAggregationFunctions.filter((name) => functions[name]);
  }
  const type = column.type ?? 'string';
  return Object.keys(functions).filter((name) => functions[name]?.columnTypes?.includes(type) ?? true);
}
