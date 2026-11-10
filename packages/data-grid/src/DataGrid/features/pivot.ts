import type {
  GridAggregationFunction,
  GridAggregationFunctionDef,
  GridAggregationModel,
  GridColDef,
  GridColumnGroupChild,
  GridColumnGroupingModel,
  GridPivotColumnNode,
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

const toDate = (value: unknown): Date | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** The fields a date column offers to pivoting by default: its year and its quarter. */
export function getDefaultPivotDerivedColumns<R extends GridValidRowModel>(column: GridColDef<R>): GridColDef<R>[] | undefined {
  if (column.type !== 'date' && column.type !== 'dateTime') {
    return undefined;
  }
  const name = column.headerName ?? column.field;
  const dateOf = (row: R) => toDate(getCellValue(row, column));
  return [
    {
      field: `${column.field}-year`,
      headerName: `${name} (Year)`,
      type: 'number',
      valueGetter: (_value, row) => dateOf(row)?.getFullYear() ?? null,
      // No thousands separator in a year.
      valueFormatter: (value) => (value === null || value === undefined ? '' : String(value)),
      pivotable: true,
    },
    {
      field: `${column.field}-quarter`,
      headerName: `${name} (Quarter)`,
      type: 'number',
      valueGetter: (_value, row) => {
        const date = dateOf(row);
        return date ? Math.floor(date.getMonth() / 3) + 1 : null;
      },
      valueFormatter: (value) => (value === null || value === undefined ? '' : `Q${value}`),
      pivotable: true,
    },
  ];
}

/** The source columns with each one's derived fields right after it. Derived fields only serve pivoting. */
export function withPivotDerivedColumns<R extends GridValidRowModel>(
  columns: readonly GridColDef<R>[],
  getDerived: (column: GridColDef<R>) => GridColDef<R>[] | undefined,
): GridColDef<R>[] {
  const known = new Set(columns.map((column) => column.field));
  return columns.flatMap((column) => {
    if (column.pivotable === false) {
      return [column];
    }
    const derived = (getDerived(column) ?? []).filter((candidate) => !known.has(candidate.field));
    derived.forEach((candidate) => known.add(candidate.field));
    return [column, ...derived];
  });
}

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
  pivotingColDef?:
    | Partial<GridColDef>
    | ((params: { field: string; aggFunc: GridAggregationFunction; columnGroupPath: string[] }) => Partial<GridColDef> | undefined);
}): GridPivotResult {
  const { rows, columns, model, functions, totalLabel, pivotingColDef } = params;

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
  const pathByField = new Map<string, string[]>();
  const derivedFields: string[] = [];
  const visitColumns = (bucket: ColumnBucket, path: string[], depth: number): GridColumnGroupChild[] => {
    if (depth === columnLevels.length) {
      return values.map((value) => {
        const field = getDerivedField(path, value.column.field);
        valueByField.set(field, value);
        pathByField.set(field, path);
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
    const override =
      typeof pivotingColDef === 'function'
        ? pivotingColDef({ field: column.field, aggFunc: fn, columnGroupPath: pathByField.get(field) ?? [] })
        : pivotingColDef;
    return {
      headerName: column.headerName ?? column.field,
      // The result of a function can differ from its input, as with the count of a text column.
      type: numericFields.has(field) && !nonNumericFields.has(field) ? 'number' : column.type,
      valueOptions: column.valueOptions,
      width: PIVOT_COLUMN_WIDTH,
      filterable: false,
      disableReorder: true,
      valueFormatter: (value: unknown) => formatAggregate(fn, value, column, def),
      // The field keys the generated values, so an override cannot change it.
      ...override,
      field,
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

export const defaultPivotColumnField = ({ columnPath, field }: { columnPath: string[]; field: string }) => [...columnPath, field].join('>->');

/** Columns of a pivot table that the server calculated: what the grid needs to show the rows it returned. */
export interface GridServerPivotLayout {
  columns: GridColDef[];
  columnGroupingModel: GridColumnGroupingModel | undefined;
  /** Function per generated field, so group rows and the footer show their values as aggregates. */
  aggregationModel: GridAggregationModel;
  rowHeaderName: string;
}

/** Builds the generated columns from the model and the column tree a server returned. */
export function buildServerPivotLayout(params: {
  model: GridPivotModel;
  columns: ReadonlyMap<string, GridColDef<any>>;
  pivotColumns: readonly GridPivotColumnNode[] | undefined;
  functions: GridAggregationFunctions;
  getField?: (params: { columnPath: string[]; field: string; aggFunc: GridAggregationFunction }) => string;
  pivotingColDef?: Parameters<typeof computePivot>[0]['pivotingColDef'];
}): GridServerPivotLayout {
  const { model, columns, pivotColumns, functions, getField = defaultPivotColumnField, pivotingColDef } = params;
  const values = model.values.flatMap(({ field, aggFunc }) => {
    const column = columns.get(field);
    return column ? [{ column, fn: aggFunc, def: functions[aggFunc] }] : [];
  });
  const levels = model.columns.length;
  const generated: GridColDef[] = [];
  const aggregationModel: GridAggregationModel = {};

  const valueColumns = (path: string[]): GridColumnGroupChild[] =>
    values.map(({ column, fn, def }) => {
      const field = getField({ columnPath: path, field: column.field, aggFunc: fn });
      aggregationModel[field] = fn;
      const override =
        typeof pivotingColDef === 'function' ? pivotingColDef({ field: column.field, aggFunc: fn, columnGroupPath: path }) : pivotingColDef;
      generated.push({
        headerName: column.headerName ?? column.field,
        type: fn === 'size' ? 'number' : column.type,
        valueOptions: column.valueOptions,
        width: PIVOT_COLUMN_WIDTH,
        sortable: false,
        filterable: false,
        disableReorder: true,
        valueFormatter: (value: unknown) => formatAggregate(fn, value, column, def),
        ...override,
        field,
      });
      return { field };
    });

  const visit = (nodes: readonly GridPivotColumnNode[], path: string[], depth: number): GridColumnGroupChild[] =>
    nodes.map((node) => {
      const nodePath = [...path, node.key];
      return {
        groupId: `pivot-group:${JSON.stringify(nodePath)}`,
        headerName: node.label ?? node.key,
        children: depth + 1 < levels ? visit(node.children ?? [], nodePath, depth + 1) : valueColumns(nodePath),
      };
    });

  const groups = levels > 0 ? visit(pivotColumns ?? [], [], 0) : valueColumns([]);
  return {
    columns: generated,
    columnGroupingModel: levels > 0 ? (groups as GridColumnGroupingModel) : undefined,
    aggregationModel,
    rowHeaderName: model.rows.map(({ field }) => columns.get(field)?.headerName ?? field).join(' / '),
  };
}
