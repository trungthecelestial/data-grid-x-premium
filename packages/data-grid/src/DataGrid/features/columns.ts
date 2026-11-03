import type {
  GridColDef,
  GridColumnGroup,
  GridColumnGroupingModel,
  GridValidRowModel,
  GridValueOption,
} from '../DataGrid.types';

export const DEFAULT_COLUMN_WIDTH = 100;
export const DEFAULT_MIN_WIDTH = 50;

export function getCellValue<R extends GridValidRowModel>(row: R, column: GridColDef<R>): unknown {
  const raw = row[column.field];
  return column.valueGetter ? column.valueGetter(raw, row) : raw;
}

export function getValueOptions<R extends GridValidRowModel>(column: GridColDef<R>): GridValueOption[] {
  return (column.valueOptions ?? []).map((option) =>
    typeof option === 'object' ? option : { value: option, label: String(option) },
  );
}

function toDate(value: unknown): Date | null {
  if (value == null || value === '') {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getFormattedValue<R extends GridValidRowModel>(
  row: R,
  column: GridColDef<R>,
  value: unknown = getCellValue(row, column),
): string {
  if (column.valueFormatter) {
    return column.valueFormatter(value, row);
  }
  if (value == null) {
    return '';
  }
  switch (column.type) {
    case 'date': {
      const date = toDate(value);
      return date ? date.toLocaleDateString() : '';
    }
    case 'dateTime': {
      const date = toDate(value);
      return date ? date.toLocaleString() : '';
    }
    case 'singleSelect':
      return getValueOptions(column).find((option) => option.value === value)?.label ?? String(value);
    default:
      return String(value);
  }
}

export function getDefaultAlign(column: GridColDef<any>): 'left' | 'center' | 'right' {
  if (column.align) {
    return column.align;
  }
  return column.type === 'number' ? 'right' : column.type === 'boolean' ? 'center' : 'left';
}

/** Keeps the saved order for fields that still exist and appends new fields in definition order. */
export function reconcileOrder(order: readonly string[], columns: readonly GridColDef<any>[]): string[] {
  const fields = new Set(columns.map((column) => column.field));
  const kept = order.filter((field) => fields.has(field));
  const known = new Set(kept);
  return [...kept, ...columns.map((column) => column.field).filter((field) => !known.has(field))];
}

export function moveField(order: readonly string[], field: string, targetField: string): string[] {
  if (field === targetField) {
    return [...order];
  }
  const next = order.filter((item) => item !== field);
  const targetIndex = order.indexOf(targetField);
  const insertAt = next.indexOf(targetField) + (order.indexOf(field) < targetIndex ? 1 : 0);
  next.splice(insertAt, 0, field);
  return next;
}

/**
 * Resolves every column to a pixel width.
 * Fixed columns use their override or `width`, flex columns share the space left over, and every column respects its min and max.
 */
export function resolveColumnWidths(
  columns: readonly GridColDef<any>[],
  containerWidth: number,
  overrides: Readonly<Record<string, number>>,
): number[] {
  const clamp = (column: GridColDef<any>, width: number) =>
    Math.min(column.maxWidth ?? Infinity, Math.max(column.minWidth ?? DEFAULT_MIN_WIDTH, width));

  const isFlex = (column: GridColDef<any>) => Boolean(column.flex) && overrides[column.field] === undefined;

  let fixedTotal = 0;
  let flexTotal = 0;
  for (const column of columns) {
    if (isFlex(column)) {
      flexTotal += column.flex ?? 0;
    } else {
      fixedTotal += clamp(column, overrides[column.field] ?? column.width ?? DEFAULT_COLUMN_WIDTH);
    }
  }

  const remaining = Math.max(0, containerWidth - fixedTotal);
  return columns.map((column) =>
    isFlex(column)
      ? clamp(column, (remaining * (column.flex ?? 0)) / flexTotal)
      : clamp(column, overrides[column.field] ?? column.width ?? DEFAULT_COLUMN_WIDTH),
  );
}

export interface ColumnGroupCell {
  groupId: string | null;
  headerName: string;
  startIndex: number;
  span: number;
}

/** Group paths per field, outermost group first. */
export function getGroupPaths(model: GridColumnGroupingModel | undefined): Map<string, GridColumnGroup[]> {
  const paths = new Map<string, GridColumnGroup[]>();
  const visit = (groups: readonly GridColumnGroup[], trail: GridColumnGroup[]) => {
    for (const group of groups) {
      const nextTrail = [...trail, group];
      for (const child of group.children) {
        if ('groupId' in child) {
          visit([child], nextTrail);
        } else {
          paths.set(child.field, nextTrail);
        }
      }
    }
  };
  visit(model ?? [], []);
  return paths;
}

/** One list of header cells per group level, outermost first. Adjacent columns of the same group merge into one cell. */
export function buildGroupHeaderRows(
  model: GridColumnGroupingModel | undefined,
  fields: readonly string[],
): ColumnGroupCell[][] {
  const paths = getGroupPaths(model);
  const depth = Math.max(0, ...fields.map((field) => paths.get(field)?.length ?? 0));
  const rows: ColumnGroupCell[][] = [];

  for (let level = 0; level < depth; level += 1) {
    const cells: ColumnGroupCell[] = [];
    fields.forEach((field, index) => {
      const group = paths.get(field)?.[level] ?? null;
      const previous = cells[cells.length - 1];
      if (previous && previous.groupId === (group?.groupId ?? null)) {
        previous.span += 1;
      } else {
        cells.push({
          groupId: group?.groupId ?? null,
          headerName: group ? (group.headerName ?? group.groupId) : '',
          startIndex: index,
          span: 1,
        });
      }
    });
    rows.push(cells);
  }
  return rows;
}
