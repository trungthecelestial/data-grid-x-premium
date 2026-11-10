import type {
  GridColDef,
  GridColType,
  GridFilterItem,
  GridFilterModel,
  GridFilterOperator,
  GridValidRowModel,
} from '../DataGrid.types';
import { getCellValue, getFormattedValue } from './columns';

const isBlank = (value: unknown) => value === undefined || value === null || value === '';

const toText = (value: unknown) => String(value ?? '').toLowerCase();

const textOperator = (
  value: string,
  test: (cell: string, filter: string) => boolean,
): GridFilterOperator<any> => ({
  value,
  inputType: 'text',
  getApplyFilterFn: (item) => (isBlank(item.value) ? null : (cell) => test(toText(cell), toText(item.value))),
});

const emptyOperators: GridFilterOperator<any>[] = [
  { value: 'isEmpty', requiresFilterValue: false, getApplyFilterFn: () => (cell) => isBlank(cell) },
  { value: 'isNotEmpty', requiresFilterValue: false, getApplyFilterFn: () => (cell) => !isBlank(cell) },
];

const anyOfOperator: GridFilterOperator<any> = {
  value: 'isAnyOf',
  inputType: 'multi',
  getApplyFilterFn: (item) => {
    if (!Array.isArray(item.value) || item.value.length === 0) {
      return null;
    }
    const allowed = item.value.map(toText);
    return (cell) => allowed.includes(toText(cell));
  },
};

const stringOperators: GridFilterOperator<any>[] = [
  textOperator('contains', (cell, filter) => cell.includes(filter)),
  textOperator('doesNotContain', (cell, filter) => !cell.includes(filter)),
  textOperator('equals', (cell, filter) => cell === filter),
  textOperator('doesNotEqual', (cell, filter) => cell !== filter),
  textOperator('startsWith', (cell, filter) => cell.startsWith(filter)),
  textOperator('endsWith', (cell, filter) => cell.endsWith(filter)),
  ...emptyOperators,
  anyOfOperator,
];

const numberOperator = (value: string, test: (cell: number, filter: number) => boolean): GridFilterOperator<any> => ({
  value,
  inputType: 'number',
  getApplyFilterFn: (item) => {
    if (isBlank(item.value) || Number.isNaN(Number(item.value))) {
      return null;
    }
    const filter = Number(item.value);
    return (cell) => (isBlank(cell) ? value === '!=' : test(Number(cell), filter));
  },
});

const numberOperators: GridFilterOperator<any>[] = [
  numberOperator('=', (cell, filter) => cell === filter),
  numberOperator('!=', (cell, filter) => cell !== filter),
  numberOperator('>', (cell, filter) => cell > filter),
  numberOperator('>=', (cell, filter) => cell >= filter),
  numberOperator('<', (cell, filter) => cell < filter),
  numberOperator('<=', (cell, filter) => cell <= filter),
  ...emptyOperators,
  anyOfOperator,
];

const toTime = (value: unknown, withTime: boolean): number | null => {
  if (isBlank(value)) {
    return null;
  }
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value as string | number);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  if (!withTime) {
    date.setHours(0, 0, 0, 0);
  }
  return date.getTime();
};

const dateOperator = (
  value: string,
  withTime: boolean,
  test: (cell: number, filter: number) => boolean,
): GridFilterOperator<any> => ({
  value,
  inputType: withTime ? 'datetime-local' : 'date',
  getApplyFilterFn: (item) => {
    const filter = toTime(item.value, withTime);
    if (filter === null) {
      return null;
    }
    return (cell) => {
      const time = toTime(cell, withTime);
      return time === null ? value === 'not' : test(time, filter);
    };
  },
});

const dateOperators = (withTime: boolean): GridFilterOperator<any>[] => [
  dateOperator('is', withTime, (cell, filter) => cell === filter),
  dateOperator('not', withTime, (cell, filter) => cell !== filter),
  dateOperator('after', withTime, (cell, filter) => cell > filter),
  dateOperator('onOrAfter', withTime, (cell, filter) => cell >= filter),
  dateOperator('before', withTime, (cell, filter) => cell < filter),
  dateOperator('onOrBefore', withTime, (cell, filter) => cell <= filter),
  ...emptyOperators,
];

const booleanOperators: GridFilterOperator<any>[] = [
  {
    value: 'is',
    inputType: 'boolean',
    getApplyFilterFn: (item) =>
      isBlank(item.value) ? null : (cell) => Boolean(cell) === (String(item.value) === 'true'),
  },
];

const selectOperators: GridFilterOperator<any>[] = [
  {
    value: 'is',
    inputType: 'singleSelect',
    getApplyFilterFn: (item) => (isBlank(item.value) ? null : (cell) => String(cell) === String(item.value)),
  },
  {
    value: 'not',
    inputType: 'singleSelect',
    getApplyFilterFn: (item) => (isBlank(item.value) ? null : (cell) => String(cell) !== String(item.value)),
  },
  anyOfOperator,
];

export function getDefaultFilterOperators(type: GridColType = 'string'): GridFilterOperator<any>[] {
  switch (type) {
    case 'number':
      return numberOperators;
    case 'date':
      return dateOperators(false);
    case 'dateTime':
      return dateOperators(true);
    case 'boolean':
      return booleanOperators;
    case 'singleSelect':
      return selectOperators;
    case 'actions':
      return [];
    default:
      return stringOperators;
  }
}

export function getColumnFilterOperators<R extends GridValidRowModel>(column: GridColDef<R>): GridFilterOperator<R>[] {
  return [...(column.filterOperators ?? getDefaultFilterOperators(column.type))];
}

export function isFilterable(column: GridColDef<any>): boolean {
  return column.filterable !== false && column.type !== 'actions';
}

export function getInitialFilterValue(operator: GridFilterOperator<any> | undefined): any {
  return operator?.inputType === 'multi' ? [] : undefined;
}

/** Number of filter items that currently narrow the rows, shown on the toolbar badge. */
export function countActiveFilters(model: GridFilterModel): number {
  const itemCount = model.items.filter(
    (item) => item.operator === 'isEmpty' || item.operator === 'isNotEmpty' || !isBlankFilterValue(item.value),
  ).length;
  const quick = (model.quickFilterValues ?? []).filter((value) => value.trim() !== '').length;
  return itemCount + quick;
}

function isBlankFilterValue(value: unknown): boolean {
  return isBlank(value) || (Array.isArray(value) && value.length === 0);
}

type RowPredicate<R> = (row: R) => boolean;

export interface GridFilterOptions {
  /** Compares text without its accents. */
  ignoreDiacritics?: boolean;
}

/** Strips accents, so `Café` becomes `Cafe`. Other values pass through. */
export function removeDiacritics<V>(value: V): V {
  if (typeof value === 'string') {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '') as V;
  }
  if (Array.isArray(value)) {
    return value.map(removeDiacritics) as V;
  }
  return value;
}

function buildItemPredicate<R extends GridValidRowModel>(
  item: GridFilterItem,
  columns: ReadonlyMap<string, GridColDef<R>>,
  options: GridFilterOptions,
): RowPredicate<R> | null {
  const column = columns.get(item.field);
  if (!column || !isFilterable(column)) {
    return null;
  }
  const operator = getColumnFilterOperators(column).find((candidate) => candidate.value === item.operator);
  if (options.ignoreDiacritics) {
    const test = operator?.getApplyFilterFn({ ...item, value: removeDiacritics(item.value) }, column);
    return test ? (row) => test(removeDiacritics(getCellValue(row, column)), row) : null;
  }
  const test = operator?.getApplyFilterFn(item, column);
  return test ? (row) => test(getCellValue(row, column), row) : null;
}

/** Combines the column filter items and the quick filter values into one predicate, or `null` when nothing filters. */
export function getFilterPredicate<R extends GridValidRowModel>(
  model: GridFilterModel,
  columns: ReadonlyMap<string, GridColDef<R>>,
  quickFilterColumns: readonly GridColDef<R>[],
  options: GridFilterOptions = {},
): RowPredicate<R> | null {
  const predicates: RowPredicate<R>[] = [];
  const normalize = options.ignoreDiacritics ? (text: string) => removeDiacritics(text) : (text: string) => text;

  const itemPredicates = model.items.flatMap((item) => {
    const predicate = buildItemPredicate(item, columns, options);
    return predicate ? [predicate] : [];
  });
  if (itemPredicates.length > 0) {
    predicates.push(
      model.logicOperator === 'or'
        ? (row) => itemPredicates.some((predicate) => predicate(row))
        : (row) => itemPredicates.every((predicate) => predicate(row)),
    );
  }

  const quickValues = (model.quickFilterValues ?? []).map((value) => normalize(value.trim().toLowerCase())).filter(Boolean);
  const searchable = quickFilterColumns.filter(isFilterable);
  if (quickValues.length > 0 && searchable.length > 0) {
    const matches = (row: R, value: string) =>
      searchable.some((column) => {
        if (column.getApplyQuickFilterFn) {
          const test = column.getApplyQuickFilterFn(value, column);
          return test ? test(getCellValue(row, column), row) : false;
        }
        return (
          normalize(getFormattedValue(row, column).toLowerCase()).includes(value) ||
          normalize(toText(getCellValue(row, column))).includes(value)
        );
      });
    predicates.push(
      model.quickFilterLogicOperator === 'or'
        ? (row) => quickValues.some((value) => matches(row, value))
        : (row) => quickValues.every((value) => matches(row, value)),
    );
  }

  return predicates.length === 0 ? null : (row) => predicates.every((predicate) => predicate(row));
}
