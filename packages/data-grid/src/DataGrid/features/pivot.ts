import type {
  GridAggregationFunction,
  GridAggregationFunctionDef,
  GridAggregationModel,
  GridColDef,
  GridColumnGroupChild,
  GridColumnGroupingModel,
  GridPivotModel,
  GridRowId,
  GridValidRowModel,
} from '../DataGrid.types';
import { formatAggregate, getAggregationInput, type GridAggregationFunctions } from './aggregation';
import { getCellValue, getFormattedValue } from './columns';
import { compareValues } from './sorting';
import { NO_VALUE_LABEL } from './tree';

export const PIVOT_ROW_ID = '__pivotRowId';
export const PIVOT_ROW_PATH = '__pivotRowPath';

const PIVOT_COLUMN_WIDTH = 130;

export const EMPTY_PIVOT_MODEL: GridPivotModel = { rows: [], columns: [], values: [] };

export const isPivotModelEmpty = (model: GridPivotModel) =>
  model.rows.length === 0 && model.columns.length === 0 && model.values.length === 0;

export interface GridPivotResult {
  /** One row per row-field combination at every level, parents before their children. */
  rows: GridValidRowModel[];
  columns: GridColDef[];
  columnGroupingModel: GridColumnGroupingModel | undefined;
  aggregationModel: GridAggregationModel;
  /** Aggregates over all rows per generated field, or `null` when there are no row fields and the only row already is the total. */
  totals: Record<string, unknown> | null;
  /** Header of the hierarchy column. */
  rowHeaderName: string;
  /** Column that writes the row path into exports, where the hierarchy column is not available. */
  rowLabelColumn: GridColDef;
}

interface RowBucket {
  raw: unknown;
  label: string;
  children: Map<string, RowBucket>;
  values: Map<string, unknown[]>;
}

interface ColumnBucket {
  raw: unknown;
  label: string;
  children: Map<string, ColumnBucket>;
}

interface PivotValue {
  column: GridColDef<any>;
  fn: GridAggregationFunction;
  def: GridAggregationFunctionDef;
}

const compareBuckets = (a: { raw: unknown; label: string }, b: { raw: unknown; label: string }) =>
  compareValues(a.raw, b.raw) || a.label.localeCompare(b.label, undefined, { numeric: true });

function getKey(row: GridValidRowModel, column: GridColDef<any>) {
  const raw = getCellValue(row, column);
  const label = getFormattedValue(row, column, raw);
  return { raw, label: label === '' ? NO_VALUE_LABEL : label };
}

function getBucket<B extends { children: Map<string, B> }>(parent: B, key: { raw: unknown; label: string }, create: () => B): B {
  let bucket = parent.children.get(key.label);
  if (!bucket) {
    bucket = create();
    parent.children.set(key.label, bucket);
  }
  return bucket;
}

/**
 * Turns source rows into the rows and columns of a pivot table.
 * Every value is aggregated from the source rows of its own cell, so subtotals and totals stay correct for functions such as the average.
 */
export function computePivot<R extends GridValidRowModel>(params: {
  rows: readonly R[];
  columns: ReadonlyMap<string, GridColDef<R>>;
  model: GridPivotModel;
  functions: GridAggregationFunctions;
  totalLabel: string;
}): GridPivotResult {
  const { rows, columns, model, functions, totalLabel } = params;

  const rowColumns = model.rows.flatMap(({ field }) => columns.get(field) ?? []);
  const columnLevels = model.columns.flatMap(({ field, sort }) => {
    const column = columns.get(field);
    return column ? [{ column, direction: sort === 'desc' ? -1 : 1 }] : [];
  });
  const values: PivotValue[] = model.values.flatMap(({ field, aggFunc }) => {
    const column = columns.get(field);
    const def = functions[aggFunc];
    return column && def ? [{ column, fn: aggFunc, def }] : [];
  });

  const getDerivedField = (columnPath: readonly string[], valueField: string) => `pivot:${JSON.stringify(columnPath)}:${valueField}`;

  const rowRoot: RowBucket = { raw: null, label: '', children: new Map(), values: new Map() };
  const columnRoot: ColumnBucket = { raw: null, label: '', children: new Map() };

  for (const row of rows) {
    let columnBucket = columnRoot;
    const columnPath: string[] = [];
    for (const { column } of columnLevels) {
      const key = getKey(row, column);
      columnBucket = getBucket(columnBucket, key, () => ({ ...key, children: new Map() }));
      columnPath.push(key.label);
    }

    const chain = [rowRoot];
    let rowBucket = rowRoot;
    for (const column of rowColumns) {
      const key = getKey(row, column);
      rowBucket = getBucket(rowBucket, key, () => ({ ...key, children: new Map(), values: new Map() }));
      chain.push(rowBucket);
    }

    for (const { column, def } of values) {
      const field = getDerivedField(columnPath, column.field);
      const input = getAggregationInput(def, row, column);
      for (const bucket of chain) {
        const cell = bucket.values.get(field);
        if (cell) {
          cell.push(input);
        } else {
          bucket.values.set(field, [input]);
        }
      }
    }
  }

  // Walking the sorted column tree gives the generated columns and their nested header groups together.
  const valueByField = new Map<string, PivotValue>();
  const derivedFields: string[] = [];
  const visitColumns = (bucket: ColumnBucket, path: string[], depth: number): GridColumnGroupChild[] => {
    if (depth === columnLevels.length) {
      return values.map((value) => {
        const field = getDerivedField(path, value.column.field);
        valueByField.set(field, value);
        derivedFields.push(field);
        return { field };
      });
    }
    const direction = columnLevels[depth]?.direction ?? 1;
    return [...bucket.children.values()]
      .sort((a, b) => compareBuckets(a, b) * direction)
      .map((child) => {
        const childPath = [...path, child.label];
        return {
          groupId: `pivot-group:${JSON.stringify(childPath)}`,
          headerName: child.label,
          children: visitColumns(child, childPath, depth + 1),
        };
      });
  };
  // Without source rows there are no column values to show, only the bare value columns when no field splits them.
  const groups = rows.length > 0 || columnLevels.length === 0 ? visitColumns(columnRoot, [], 0) : [];

  const nonNumericFields = new Set<string>();
  const numericFields = new Set<string>();
  const aggregate = (bucket: RowBucket, groupId: GridRowId | null) => {
    const result: Record<string, unknown> = {};
    for (const [field, cellValues] of bucket.values) {
      const value = valueByField.get(field);
      if (value) {
        const aggregated = value.def.apply({ values: cellValues, field: value.column.field, groupId }) ?? null;
        result[field] = aggregated;
        if (typeof aggregated === 'number') {
          numericFields.add(field);
        } else if (aggregated !== null) {
          nonNumericFields.add(field);
        }
      }
    }
    return result;
  };

  const pivotRows: GridValidRowModel[] = [];
  const addRow = (bucket: RowBucket, path: string[]) => {
    const id = `pivot-row:${JSON.stringify(path)}`;
    pivotRows.push({ ...aggregate(bucket, id), [PIVOT_ROW_ID]: id, [PIVOT_ROW_PATH]: path });
  };
  const visitRows = (bucket: RowBucket, path: string[]) => {
    for (const child of [...bucket.children.values()].sort(compareBuckets)) {
      const childPath = [...path, child.label];
      addRow(child, childPath);
      visitRows(child, childPath);
    }
  };

  let totals: Record<string, unknown> | null = null;
  if (rowColumns.length === 0) {
    if (rows.length > 0) {
      addRow(rowRoot, [totalLabel]);
    }
  } else {
    visitRows(rowRoot, []);
    totals = rows.length > 0 ? aggregate(rowRoot, null) : null;
  }

  const derivedColumns = derivedFields.map((field): GridColDef => {
    const { column, fn, def } = valueByField.get(field) as PivotValue;
    return {
      field,
      headerName: column.headerName ?? column.field,
      // The result of a function can differ from its input, as with the count of a text column.
      type: numericFields.has(field) && !nonNumericFields.has(field) ? 'number' : column.type,
      valueOptions: column.valueOptions,
      width: PIVOT_COLUMN_WIDTH,
      filterable: false,
      disableReorder: true,
      valueFormatter: (value: unknown) => formatAggregate(fn, value, column, def),
    };
  });

  const rowHeaderName = rowColumns.map((column) => column.headerName ?? column.field).join(' / ');

  return {
    rows: pivotRows,
    columns: derivedColumns,
    columnGroupingModel: columnLevels.length > 0 ? (groups as GridColumnGroupingModel) : undefined,
    aggregationModel: Object.fromEntries(derivedFields.map((field) => [field, (valueByField.get(field) as PivotValue).fn])),
    totals,
    rowHeaderName,
    rowLabelColumn: {
      field: '__pivot_row_label__',
      headerName: rowHeaderName,
      valueGetter: (_value: unknown, row: GridValidRowModel) => (row[PIVOT_ROW_PATH] as string[]).join(' / '),
    },
  };
}
