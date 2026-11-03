import type { GridColDef, GridSortDirection, GridSortModel, GridValidRowModel } from '../DataGrid.types';
import { getCellValue } from './columns';

export const DEFAULT_SORTING_ORDER: readonly GridSortDirection[] = ['asc', 'desc', null];

/** Nullish values sort first in ascending order. */
export function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) {
    return 0;
  }
  if (a == null) {
    return -1;
  }
  if (b == null) {
    return 1;
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return Number(a) - Number(b);
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

export function getNextSortDirection(
  current: GridSortDirection,
  order: readonly GridSortDirection[] = DEFAULT_SORTING_ORDER,
): GridSortDirection {
  const index = order.indexOf(current ?? null);
  return order[(index + 1) % order.length] ?? null;
}

/** Returns the model after a header click: plain clicks replace the model, multi-sort clicks edit one entry. */
export function applySortClick(
  model: GridSortModel,
  field: string,
  order: readonly GridSortDirection[],
  multiple: boolean,
): GridSortModel {
  const current = model.find((item) => item.field === field)?.sort;
  const next = getNextSortDirection(current, order);
  if (!multiple) {
    return next ? [{ field, sort: next }] : [];
  }
  const others = model.filter((item) => item.field !== field);
  const existingIndex = model.findIndex((item) => item.field === field);
  if (!next) {
    return others;
  }
  const entry = { field, sort: next };
  return existingIndex === -1 ? [...others, entry] : model.map((item) => (item.field === field ? entry : item));
}

export function getRowComparator<R extends GridValidRowModel>(
  model: GridSortModel,
  columns: ReadonlyMap<string, GridColDef<R>>,
): ((a: R, b: R) => number) | null {
  const active = model.flatMap((item) => {
    const column = columns.get(item.field);
    return column && item.sort ? [{ column, direction: item.sort === 'desc' ? -1 : 1 }] : [];
  });
  if (active.length === 0) {
    return null;
  }
  return (a, b) => {
    for (const { column, direction } of active) {
      const valueA = getCellValue(a, column);
      const valueB = getCellValue(b, column);
      const result = column.sortComparator
        ? column.sortComparator(valueA, valueB, a, b)
        : compareValues(valueA, valueB);
      if (result !== 0) {
        return result * direction;
      }
    }
    return 0;
  };
}

export function sortRows<R extends GridValidRowModel>(
  rows: readonly R[],
  model: GridSortModel,
  columns: ReadonlyMap<string, GridColDef<R>>,
): R[] {
  const comparator = getRowComparator(model, columns);
  return comparator ? [...rows].sort(comparator) : [...rows];
}
