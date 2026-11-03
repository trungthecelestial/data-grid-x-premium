import { describe, expect, it } from 'vitest';
import type { GridColDef } from '../DataGrid.types';
import { aggregateValues, computeAggregates } from './aggregation';
import {
  buildGroupHeaderRows,
  getFormattedValue,
  moveField,
  reconcileOrder,
  resolveColumnWidths,
} from './columns';
import { buildCsv, buildPrintHtml } from './export';
import { countActiveFilters, getFilterPredicate } from './filtering';
import { applySortClick, sortRows } from './sorting';
import { buildGroupedTree, buildPathTree, flattenTree, pruneTree, sortTree } from './tree';
import { getOffsets, getVirtualRange } from '../hooks/virtualization';

type Row = { id: number; name: string; age: number | null; active?: boolean; joined?: string; team?: string };

const columns: GridColDef<Row>[] = [
  { field: 'name', headerName: 'Name' },
  { field: 'age', headerName: 'Age', type: 'number' },
  { field: 'active', headerName: 'Active', type: 'boolean' },
  { field: 'joined', headerName: 'Joined', type: 'date' },
];
const byField = new Map(columns.map((column) => [column.field, column]));

const rows: Row[] = [
  { id: 1, name: 'Ada', age: 36, active: true, joined: '2020-01-10' },
  { id: 2, name: 'alan', age: 41, active: false, joined: '2021-05-02' },
  { id: 3, name: 'Grace', age: null, active: true, joined: '2019-03-20' },
  { id: 4, name: 'Linus', age: 30, active: false },
];

describe('sorting', () => {
  it('sorts numbers with nulls first and flips for desc', () => {
    expect(sortRows(rows, [{ field: 'age', sort: 'asc' }], byField).map((row) => row.id)).toEqual([3, 4, 1, 2]);
    expect(sortRows(rows, [{ field: 'age', sort: 'desc' }], byField).map((row) => row.id)).toEqual([2, 1, 4, 3]);
  });

  it('sorts several columns in order and does not mutate the input', () => {
    const copy = [...rows];
    const sorted = sortRows(rows, [{ field: 'active', sort: 'desc' }, { field: 'name', sort: 'asc' }], byField);
    expect(sorted.map((row) => row.id)).toEqual([1, 3, 2, 4]);
    expect(rows).toEqual(copy);
  });

  it('uses a custom comparator', () => {
    const custom = new Map(byField).set('name', { field: 'name', sortComparator: (a, b) => b.length - a.length });
    expect(sortRows(rows, [{ field: 'name', sort: 'asc' }], custom).map((row) => row.name)[0]).toBe('Grace');
  });

  it('cycles asc, desc, none on header clicks and edits one entry with multi sort', () => {
    const order = ['asc', 'desc', null] as const;
    const first = applySortClick([], 'name', order, false);
    expect(first).toEqual([{ field: 'name', sort: 'asc' }]);
    expect(applySortClick(first, 'name', order, false)).toEqual([{ field: 'name', sort: 'desc' }]);
    expect(applySortClick([{ field: 'name', sort: 'desc' }], 'name', order, false)).toEqual([]);
    expect(applySortClick(first, 'age', order, true)).toEqual([
      { field: 'name', sort: 'asc' },
      { field: 'age', sort: 'asc' },
    ]);
  });
});

describe('filtering', () => {
  const filter = (items: { field: string; operator: string; value?: unknown }[], extra = {}) =>
    getFilterPredicate({ items, ...extra }, byField, columns);
  const ids = (predicate: ((row: Row) => boolean) | null) => rows.filter((row) => (predicate ? predicate(row) : true)).map((row) => row.id);

  it('filters strings case-insensitively', () => {
    expect(ids(filter([{ field: 'name', operator: 'contains', value: 'A' }]))).toEqual([1, 2, 3]);
    expect(ids(filter([{ field: 'name', operator: 'startsWith', value: 'al' }]))).toEqual([2]);
    expect(ids(filter([{ field: 'name', operator: 'equals', value: 'ada' }]))).toEqual([1]);
    expect(ids(filter([{ field: 'name', operator: 'isAnyOf', value: ['ada', 'linus'] }]))).toEqual([1, 4]);
  });

  it('filters numbers, treating null as empty', () => {
    expect(ids(filter([{ field: 'age', operator: '>', value: '35' }]))).toEqual([1, 2]);
    expect(ids(filter([{ field: 'age', operator: 'isEmpty' }]))).toEqual([3]);
    expect(ids(filter([{ field: 'age', operator: '!=', value: '36' }]))).toEqual([2, 3, 4]);
  });

  it('filters dates and booleans', () => {
    expect(ids(filter([{ field: 'joined', operator: 'after', value: '2020-01-10' }]))).toEqual([2]);
    expect(ids(filter([{ field: 'joined', operator: 'onOrAfter', value: '2020-01-10' }]))).toEqual([1, 2]);
    expect(ids(filter([{ field: 'active', operator: 'is', value: 'true' }]))).toEqual([1, 3]);
  });

  it('combines items with and/or and ignores incomplete items', () => {
    const items = [
      { field: 'name', operator: 'contains', value: 'ada' },
      { field: 'age', operator: '>', value: '40' },
    ];
    expect(ids(filter(items))).toEqual([]);
    expect(ids(filter(items, { logicOperator: 'or' }))).toEqual([1, 2]);
    expect(filter([{ field: 'name', operator: 'contains', value: '' }])).toBeNull();
  });

  it('applies quick filter values across columns', () => {
    expect(ids(filter([], { quickFilterValues: ['ada'] }))).toEqual([1]);
    expect(ids(filter([], { quickFilterValues: ['a', '41'] }))).toEqual([2]);
    expect(ids(filter([], { quickFilterValues: ['ada', '41'], quickFilterLogicOperator: 'or' }))).toEqual([1, 2]);
  });

  it('counts only filters that narrow the rows', () => {
    expect(
      countActiveFilters({
        items: [
          { field: 'name', operator: 'contains', value: '' },
          { field: 'age', operator: 'isEmpty' },
        ],
        quickFilterValues: ['x'],
      }),
    ).toBe(2);
  });
});

describe('columns', () => {
  it('resolves fixed and flex widths and respects min and max', () => {
    const cols: GridColDef[] = [
      { field: 'a', width: 100 },
      { field: 'b', flex: 1 },
      { field: 'c', flex: 3, maxWidth: 200 },
    ];
    expect(resolveColumnWidths(cols, 500, {})).toEqual([100, 100, 200]);
    expect(resolveColumnWidths(cols, 0, {})).toEqual([100, 50, 50]);
    expect(resolveColumnWidths(cols, 500, { b: 300 })[1]).toBe(300);
  });

  it('keeps order for existing fields and appends new ones', () => {
    expect(reconcileOrder(['c', 'a', 'x'], [{ field: 'a' }, { field: 'b' }, { field: 'c' }])).toEqual(['c', 'a', 'b']);
    expect(moveField(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a']);
    expect(moveField(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
  });

  it('merges adjacent columns of a group into one header cell', () => {
    const cells = buildGroupHeaderRows(
      [{ groupId: 'person', headerName: 'Person', children: [{ field: 'first' }, { field: 'last' }] }],
      ['id', 'first', 'last', 'age'],
    );
    expect(cells).toHaveLength(1);
    expect(cells[0]?.map((cell) => [cell.groupId, cell.startIndex, cell.span])).toEqual([
      [null, 0, 1],
      ['person', 1, 2],
      [null, 3, 1],
    ]);
  });

  it('formats values by column type', () => {
    expect(getFormattedValue({ id: 1, k: 2 }, { field: 'k', type: 'singleSelect', valueOptions: [{ value: 2, label: 'Two' }] })).toBe('Two');
    expect(getFormattedValue({ id: 1, k: null }, { field: 'k' })).toBe('');
  });
});

describe('tree', () => {
  const treeRows = [
    { id: 1, path: ['A'] },
    { id: 2, path: ['A', 'B'] },
    { id: 3, path: ['A', 'B', 'C'] },
    { id: 4, path: ['X', 'Y'] },
  ];
  const getId = (row: { id: number }) => row.id;
  const getPath = (row: { path: string[] }) => row.path;

  it('builds a hierarchy and generates missing ancestors', () => {
    const roots = buildPathTree(treeRows, getId, getPath);
    expect(roots.map((node) => node.label)).toEqual(['A', 'X']);
    expect(roots[1]?.row).toBeUndefined();
    expect(String(roots[1]?.id)).toContain('auto-generated-row-');
    expect(roots[0]?.rowCount).toBe(3);
    expect(flattenTree(roots, () => true).map((node) => node.label)).toEqual(['A', 'B', 'C', 'X', 'Y']);
    expect(flattenTree(roots, () => false).map((node) => node.label)).toEqual(['A', 'X']);
  });

  it('keeps ancestors of matching rows when pruning', () => {
    const roots = buildPathTree(treeRows, getId, getPath);
    const pruned = pruneTree(roots, (row) => row.id === 3);
    expect(flattenTree(pruned, () => true).map((node) => node.label)).toEqual(['A', 'B', 'C']);
  });

  it('sorts siblings', () => {
    const roots = buildPathTree(
      [
        { id: 1, path: ['A'] },
        { id: 2, path: ['B'] },
        { id: 3, path: ['B', 'C'] },
        { id: 4, path: ['B', 'D'] },
      ],
      getId,
      getPath,
    );
    const sorted = sortTree(roots, (a, b) => b.id - a.id);
    expect(sorted.map((node) => node.label)).toEqual(['B', 'A']);
    expect(sorted[0]?.children.map((node) => node.label)).toEqual(['D', 'C']);
    // Generated groups have no row to compare, so they keep ordering by label.
    const generated = sortTree(buildPathTree(treeRows, getId, getPath), (a, b) => b.id - a.id);
    expect(generated.map((node) => node.label)).toEqual(['A', 'X']);
  });

  it('groups by field values', () => {
    const data: Row[] = [
      { id: 1, name: 'a', age: 1, team: 'red' },
      { id: 2, name: 'b', age: 2, team: 'blue' },
      { id: 3, name: 'c', age: 3, team: 'red' },
    ];
    const roots = buildGroupedTree(data, (row) => row.id, ['team'], (row, field) => String((row as Record<string, unknown>)[field]));
    expect(roots.map((node) => [node.label, node.rowCount])).toEqual([
      ['red', 2],
      ['blue', 1],
    ]);
    expect(roots[0]?.children.map((node) => node.id)).toEqual([1, 3]);
  });
});

describe('aggregation', () => {
  it('aggregates values', () => {
    expect(aggregateValues('sum', [1, 2, null, 3])).toBe(6);
    expect(aggregateValues('avg', [2, 4])).toBe(3);
    expect(aggregateValues('min', [3, 1, 2])).toBe(1);
    expect(aggregateValues('max', ['b', 'c', 'a'])).toBe('c');
    expect(aggregateValues('size', [1, null])).toBe(2);
    expect(aggregateValues('sum', [null])).toBeNull();
  });

  it('computes one value per field of the model', () => {
    expect(computeAggregates(rows, { age: 'max', name: 'size' }, byField)).toEqual({ age: 41, name: 4 });
  });
});

describe('export', () => {
  it('builds CSV with quoting', () => {
    const data = [{ id: 1, name: 'He said "hi", ok', age: 3 }];
    const csv = buildCsv(data, [{ field: 'name', headerName: 'Name' }, { field: 'age', type: 'number' }]);
    expect(csv).toBe('Name,age\r\n"He said ""hi"", ok",3');
    expect(buildCsv(data, [{ field: 'age' }], { includeHeaders: false, delimiter: ';' })).toBe('3');
  });

  it('escapes HTML for print', () => {
    expect(buildPrintHtml([{ id: 1, name: '<b>' }], [{ field: 'name' }])).toContain('&lt;b&gt;');
  });
});

describe('virtualization', () => {
  it('computes the visible range with overscan', () => {
    const offsets = getOffsets(new Array<number>(100).fill(10));
    expect(getVirtualRange(offsets, 0, 50, 0)).toEqual({ start: 0, end: 6, offsetTop: 0, offsetBottom: 940 });
    expect(getVirtualRange(offsets, 500, 50, 2)).toMatchObject({ start: 48, end: 58 });
    expect(getVirtualRange(getOffsets([]), 0, 50, 3)).toEqual({ start: 0, end: 0, offsetTop: 0, offsetBottom: 0 });
  });

  it('handles variable heights', () => {
    const offsets = getOffsets([10, 100, 10, 10]);
    expect(getVirtualRange(offsets, 50, 10, 0)).toMatchObject({ start: 1, end: 2 });
  });
});
