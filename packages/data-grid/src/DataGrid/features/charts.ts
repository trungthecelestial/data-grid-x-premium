import type { GridChartData, GridChartsModel, GridChartType, GridColDef, GridValidRowModel } from '../DataGrid.types';
import { getCellValue, getFormattedValue } from './columns';

export const EMPTY_CHARTS_MODEL: GridChartsModel = { type: 'column', series: [] };

/** The most categories one chart draws. More are cut off, as a chart of thousands of marks tells nothing. */
export const MAX_CHART_CATEGORIES = 100;

export const CHART_TYPES: readonly GridChartType[] = ['column', 'bar', 'line', 'area', 'pie', 'scatter'];

/** One mark position on the category axis. `get` reads the numeric input of a series field for it. */
export interface GridChartPoint {
  label: string;
  get: (field: string) => unknown;
}

export function toChartNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? null : time;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Columns that can feed a series: numbers, plus any column that has an aggregation when the rows are grouped. */
export function getChartSeriesColumns<R extends GridValidRowModel>(columns: readonly GridColDef<R>[]): GridColDef<R>[] {
  return columns.filter((column) => column.type === 'number' && !column.field.startsWith('__'));
}

/** Columns that can label the category axis: everything that is not a number or an action. */
export function getChartCategoryColumns<R extends GridValidRowModel>(columns: readonly GridColDef<R>[]): GridColDef<R>[] {
  return columns.filter((column) => column.type !== 'actions' && column.type !== 'number' && !column.field.startsWith('__'));
}

/** Points for ungrouped rows. Each row is a category labelled by the formatted value of `categoryColumn`. */
export function getRowChartPoints<R extends GridValidRowModel>(
  rows: readonly R[],
  columns: ReadonlyMap<string, GridColDef<R>>,
  categoryColumn: GridColDef<R> | undefined,
): GridChartPoint[] {
  return rows.map((row, index) => ({
    label: categoryColumn ? getFormattedValue(row, categoryColumn) : String(index + 1),
    get: (field) => {
      const column = columns.get(field);
      return column ? getCellValue(row, column) : undefined;
    },
  }));
}

/**
 * Turns points into series. Points with the same label add up, so a column chart of a text column shows one bar per distinct value.
 * `merge` turns that off, which grouped rows want because each group is already one label.
 */
export function buildChartData(
  points: readonly GridChartPoint[],
  model: GridChartsModel,
  getSeriesLabel: (field: string) => string,
  options: { merge?: boolean } = {},
): GridChartData {
  const fields = model.series;
  const order: string[] = [];
  const sums = new Map<string, number[]>();
  const counts = new Map<string, number[]>();
  const sumsOf = (key: string) => sums.get(key) as number[];
  const countsOf = (key: string) => counts.get(key) as number[];
  const merge = options.merge ?? true;
  points.forEach((point, index) => {
    const key = merge ? point.label : `${index}:${point.label}`;
    if (!sums.has(key)) {
      order.push(key);
      sums.set(key, fields.map(() => 0));
      counts.set(key, fields.map(() => 0));
    }
    fields.forEach((field, fieldIndex) => {
      const value = toChartNumber(point.get(field));
      if (value !== null) {
        sumsOf(key)[fieldIndex] = (sumsOf(key)[fieldIndex] ?? 0) + value;
        countsOf(key)[fieldIndex] = (countsOf(key)[fieldIndex] ?? 0) + 1;
      }
    });
  });
  const labelOf = (key: string) => (merge ? key : key.slice(key.indexOf(':') + 1));
  const kept = order.slice(0, MAX_CHART_CATEGORIES);
  return {
    categories: kept.map(labelOf),
    series: fields.map((field, fieldIndex) => ({
      field,
      label: getSeriesLabel(field),
      // A category with no number at all stays empty so a line does not dip to zero for it.
      values: kept.map((key): number | null => ((countsOf(key)[fieldIndex] ?? 0) > 0 ? (sumsOf(key)[fieldIndex] ?? null) : null)),
    })),
    truncated: order.length > kept.length,
  };
}

/** Round axis ticks that cover `min` to `max`, about `count` of them. */
export function getNiceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return [0, 1];
  }
  if (min === max) {
    if (min === 0) {
      return [0, 1];
    }
    return min > 0 ? getNiceTicks(0, max, count) : getNiceTicks(min, 0, count);
  }
  const rawStep = (max - min) / Math.max(1, count);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const residual = rawStep / magnitude;
  const step = (residual >= 5 ? 10 : residual >= 2 ? 5 : residual >= 1 ? 2 : 1) * magnitude;
  const first = Math.floor(min / step) * step;
  const last = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = first; value <= last + step / 2; value += step) {
    // Rounding keeps 0.1 + 0.2 style drift out of the labels.
    ticks.push(Number(value.toFixed(10)));
  }
  return ticks;
}

export function formatChartNumber(value: number): string {
  return Math.abs(value) >= 1000 || Number.isInteger(value) ? value.toLocaleString('en-US', { maximumFractionDigits: 0 }) : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** Drops fields the model names but the grid no longer has, and picks a category when it names none that exists. */
export function sanitizeChartsModel(
  model: GridChartsModel,
  seriesFields: ReadonlySet<string>,
  categoryFields: ReadonlySet<string>,
): GridChartsModel {
  return {
    ...model,
    categoryField: model.categoryField !== undefined && categoryFields.has(model.categoryField) ? model.categoryField : undefined,
    series: model.series.filter((field) => seriesFields.has(field)),
  };
}
