import { describe, expect, it } from 'vitest';
import type { GridAggregationFunctionDef, GridColDef, GridPivotModel } from '../DataGrid.types';
import { computeAggregates, formatAggregate, getAvailableAggregationFunctions, GRID_AGGREGATION_FUNCTIONS } from './aggregation';
import { computePivot, PIVOT_ROW_PATH } from './pivot';

type Sale = { id: number; region: string | null; product: string; quarter: string; amount: number | null; units: number };

const sales: Sale[] = [
  { id: 1, region: 'East', product: 'Pen', quarter: 'Q2', amount: 10, units: 1 },
  { id: 2, region: 'East', product: 'Ink', quarter: 'Q1', amount: 20, units: 3 },
  { id: 3, region: 'West', product: 'Pen', quarter: 'Q1', amount: 30, units: 1 },
  { id: 4, region: 'East', product: 'Pen', quarter: 'Q1', amount: 60, units: 1 },
];

const columnList: GridColDef<Sale>[] = [
  { field: 'region', headerName: 'Region' },
  { field: 'product', headerName: 'Product' },
  { field: 'quarter', headerName: 'Quarter' },
  { field: 'amount', headerName: 'Amount', type: 'number', valueFormatter: (value: number) => `$${value}` },
  { field: 'units', type: 'number' },
];
const byField = new Map(columnList.map((column) => [column.field, column]));

const pivot = (model: GridPivotModel, rows: Sale[] = sales) =>
  computePivot({ rows, columns: byField, model, functions: GRID_AGGREGATION_FUNCTIONS, totalLabel: 'Total' });

const field = (columns: string[], value: string) => `pivot:${JSON.stringify(columns)}:${value}`;

describe('computePivot', () => {
  const model: GridPivotModel = {
    rows: [{ field: 'region' }, { field: 'product' }],
    columns: [{ field: 'quarter' }],
    values: [{ field: 'amount', aggFunc: 'avg' }],
  };

  it('builds parents before children, in sorted order', () => {
    expect(pivot(model).rows.map((row) => row[PIVOT_ROW_PATH])).toEqual([['East'], ['East', 'Ink'], ['East', 'Pen'], ['West'], ['West', 'Pen']]);
  });

  it('aggregates subtotals and totals from source rows, not from lower levels', () => {
    const result = pivot(model);
    const q1 = field(['Q1'], 'amount');
    const east = result.rows[0] as Record<string, unknown>;
    // East in Q1 holds 20 and 60. The average of its children would give the same here, so the total below is the telling case.
    expect(east[q1]).toBe(40);
    // (20 + 30 + 60) / 3, where averaging the region averages would give 35.
    expect(result.totals?.[q1]).toBeCloseTo(36.67, 2);
  });

  it('leaves combinations without source rows empty', () => {
    const west = pivot(model).rows[3] as Record<string, unknown>;
    expect(field(['Q2'], 'amount') in west).toBe(false);
  });

  it('orders generated columns and nests them under their groups', () => {
    const result = pivot({ ...model, columns: [{ field: 'quarter', sort: 'desc' }, { field: 'product' }] });
    expect(result.columns.map((column) => column.field)).toEqual([
      field(['Q2', 'Pen'], 'amount'),
      field(['Q1', 'Ink'], 'amount'),
      field(['Q1', 'Pen'], 'amount'),
    ]);
    expect(result.columnGroupingModel?.map((group) => group.headerName)).toEqual(['Q2', 'Q1']);
  });

  it('adds one column per value without column fields, and no header groups', () => {
    const result = pivot({
      rows: [{ field: 'region' }],
      columns: [],
      values: [
        { field: 'amount', aggFunc: 'sum' },
        { field: 'units', aggFunc: 'max' },
      ],
    });
    expect(result.columns.map((column) => column.headerName)).toEqual(['Amount', 'units']);
    expect(result.columnGroupingModel).toBeUndefined();
    expect((result.rows[0] as Record<string, unknown>)[field([], 'amount')]).toBe(90);
  });

  it('shows one total row and no footer without row fields', () => {
    const result = pivot({ rows: [], columns: [], values: [{ field: 'amount', aggFunc: 'sum' }] });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.[PIVOT_ROW_PATH]).toEqual(['Total']);
    expect(result.totals).toBeNull();
  });

  it('groups empty cells under a label of their own', () => {
    const result = pivot({ rows: [{ field: 'region' }], columns: [], values: [{ field: 'units', aggFunc: 'size' }] }, [
      ...sales,
      { id: 5, region: null, product: 'Pen', quarter: 'Q1', amount: 1, units: 1 },
    ]);
    expect(result.rows.map((row) => row[PIVOT_ROW_PATH])).toEqual([['(No value)'], ['East'], ['West']]);
  });

  it('types a column by the results of its function', () => {
    const result = pivot({ rows: [{ field: 'region' }], columns: [], values: [{ field: 'product', aggFunc: 'size' }] });
    expect(result.columns[0]?.type).toBe('number');
  });

  it('ignores unknown fields and functions, and handles no rows', () => {
    const result = pivot({ rows: [{ field: 'nope' }], columns: [{ field: 'nope' }], values: [{ field: 'amount', aggFunc: 'nope' }] }, []);
    expect(result.rows).toEqual([]);
    expect(result.columns).toEqual([]);
  });
});

describe('custom aggregation functions', () => {
  const median: GridAggregationFunctionDef<number, number | null> = {
    label: 'Median',
    columnTypes: ['number'],
    valueFormatter: (value) => `~${value}`,
    apply: ({ values }) => {
      const sorted = values.filter((value) => value != null).sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)] ?? null;
    },
  };
  const functions = { ...GRID_AGGREGATION_FUNCTIONS, median };

  it('applies a registered function and skips unknown ones', () => {
    expect(computeAggregates(sales, { amount: 'median', units: 'nope' }, byField, functions)).toEqual({ amount: 30 });
  });

  it('passes the field and group to the function', () => {
    const seen: unknown[] = [];
    const spy: GridAggregationFunctionDef = { apply: ({ field: name, groupId }) => seen.push([name, groupId]) };
    computeAggregates(sales, { amount: 'spy' }, byField, { spy }, 'group-1');
    expect(seen).toEqual([['amount', 'group-1']]);
  });

  it('reads more of the row through getCellValue', () => {
    const weighted: GridAggregationFunctionDef<{ amount: number; units: number }, number> = {
      getCellValue: ({ row }) => ({ amount: row.amount, units: row.units }),
      apply: ({ values }) =>
        values.reduce((total, { amount, units }) => total + amount * units, 0) / values.reduce((total, { units }) => total + units, 0),
    };
    // (10 + 60 + 30 + 60) / 6
    expect(computeAggregates(sales, { amount: 'weighted' }, byField, { weighted }).amount).toBeCloseTo(26.67, 2);
  });

  it('prefers the formatter of the function', () => {
    expect(formatAggregate('median', 30, byField.get('amount') as GridColDef<Sale>, median)).toBe('~30');
  });

  it('offers functions by column type, column list and opt-out', () => {
    expect(getAvailableAggregationFunctions({ field: 'a', type: 'number' }, functions)).toEqual(['sum', 'avg', 'min', 'max', 'size', 'median']);
    expect(getAvailableAggregationFunctions({ field: 'a' }, functions)).toEqual(['size']);
    expect(getAvailableAggregationFunctions({ field: 'a', type: 'date' }, functions)).toEqual(['min', 'max', 'size']);
    expect(getAvailableAggregationFunctions({ field: 'a', availableAggregationFunctions: ['median', 'gone'] }, functions)).toEqual(['median']);
    expect(getAvailableAggregationFunctions({ field: 'a', type: 'number', aggregable: false }, functions)).toEqual([]);
    expect(getAvailableAggregationFunctions({ field: 'a', type: 'actions' }, functions)).toEqual([]);
  });
});
