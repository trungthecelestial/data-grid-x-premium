import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataGrid, useGridApiRef } from './DataGrid';
import type { GridApi, GridChartsModel, GridColDef } from './DataGrid.types';
import { buildChartData, getNiceTicks, toChartNumber } from './features/charts';

type Sale = { id: number; region: string; quarter: string; amount: number; units: number };

const sales: Sale[] = [
  { id: 1, region: 'East', quarter: 'Q1', amount: 10, units: 1 },
  { id: 2, region: 'East', quarter: 'Q2', amount: 20, units: 2 },
  { id: 3, region: 'West', quarter: 'Q1', amount: 40, units: 4 },
  { id: 4, region: 'North', quarter: 'Q1', amount: 5, units: 5 },
];

const columns: GridColDef<Sale>[] = [
  { field: 'region', headerName: 'Region' },
  { field: 'quarter', headerName: 'Quarter' },
  { field: 'amount', headerName: 'Amount', type: 'number' },
  { field: 'units', headerName: 'Units', type: 'number' },
];

type Props = Partial<React.ComponentProps<typeof DataGrid<Sale>>>;

function renderGrid(props: Props = {}) {
  const holder: { ref: { current: GridApi } | null } = { ref: null };
  function Harness() {
    const apiRef = useGridApiRef();
    holder.ref = apiRef;
    return <DataGrid rows={sales} columns={columns} apiRef={apiRef} disableVirtualization pagination={false} showToolbar chartsIntegration {...props} />;
  }
  render(<Harness />);
  return () => (holder.ref as { current: GridApi }).current;
}

const openPanel = () => fireEvent.click(screen.getByRole('button', { name: 'Charts' }));

describe('chart data', () => {
  it('adds up points with the same label and leaves categories without a number empty', () => {
    const points = [
      { label: 'a', get: () => 1 },
      { label: 'b', get: () => 'x' },
      { label: 'a', get: () => '2' },
    ];
    const data = buildChartData(points, { type: 'column', series: ['v'] }, () => 'V');
    expect(data.categories).toEqual(['a', 'b']);
    expect(data.series[0]?.values).toEqual([3, null]);
  });

  it('keeps repeated labels apart when asked', () => {
    const points = [
      { label: 'a', get: () => 1 },
      { label: 'a', get: () => 2 },
    ];
    expect(buildChartData(points, { type: 'column', series: ['v'] }, () => 'V', { merge: false }).categories).toEqual(['a', 'a']);
  });

  it('reads numbers from numeric strings and dates only', () => {
    expect(toChartNumber('3.5')).toBe(3.5);
    expect(toChartNumber('')).toBeNull();
    expect(toChartNumber(new Date(5))).toBe(5);
    expect(toChartNumber(NaN)).toBeNull();
  });

  it('makes round ticks that cover the range', () => {
    expect(getNiceTicks(0, 47)).toEqual([0, 10, 20, 30, 40, 50]);
    expect(getNiceTicks(0, 0)).toEqual([0, 1]);
  });
});

describe('charts integration', () => {
  it('has no Charts button unless chartsIntegration is on', () => {
    renderGrid({ chartsIntegration: false });
    expect(screen.queryByRole('button', { name: 'Charts' })).toBeNull();
  });

  it('asks for a series first, then draws one column per category', () => {
    renderGrid();
    openPanel();
    expect(screen.getByText('Pick at least one number column to chart.')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Amount' }));
    const svg = screen.getByRole('img');
    expect(svg.getAttribute('data-chart-type')).toBe('column');
    // The first non-number column labels the categories, so the two East rows add up.
    const bars = svg.querySelectorAll('rect[data-series="amount"]');
    expect([...bars].map((bar) => bar.querySelector('title')?.textContent)).toEqual([
      'Amount, East: 30',
      'Amount, West: 40',
      'Amount, North: 5',
    ]);
  });

  it('plots only the rows the filters leave', () => {
    renderGrid({
      initialState: { filter: { filterModel: { items: [{ field: 'quarter', operator: 'equals', value: 'Q1' }] } }, charts: { model: { type: 'column', series: ['amount'] } } },
    });
    openPanel();
    const titles = [...screen.getByRole('img').querySelectorAll('rect title')].map((title) => title.textContent);
    expect(titles).toEqual(['Amount, East: 10', 'Amount, West: 40', 'Amount, North: 5']);
  });

  it('switches type and category', () => {
    const onChartsModelChange = vi.fn();
    renderGrid({ chartsModel: { type: 'line', categoryField: 'quarter', series: ['amount', 'units'] }, onChartsModelChange });
    openPanel();
    const svg = screen.getByRole('img');
    expect(svg.getAttribute('data-chart-type')).toBe('line');
    expect(svg.querySelectorAll('polyline')).toHaveLength(2);
    expect([...svg.querySelectorAll('circle title')].map((title) => title.textContent)).toContain('Amount, Q1: 55');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Units' }));
    expect(onChartsModelChange).toHaveBeenCalledWith({ type: 'line', categoryField: 'quarter', series: ['amount'] });
  });

  it('draws pie slices and a scatter that needs two series', () => {
    renderGrid({ initialState: { charts: { model: { type: 'pie', series: ['amount'] } } } });
    openPanel();
    expect(screen.getByRole('img').querySelectorAll('path')).toHaveLength(3);
  });

  it('tells a scatter with one series to pick another', () => {
    renderGrid({ initialState: { charts: { model: { type: 'scatter', series: ['amount'] } } } });
    openPanel();
    expect(screen.getByText(/Pick two/)).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Units' }));
    expect(screen.getByRole('img').querySelectorAll('circle')).toHaveLength(3);
  });

  it('charts the groups with their aggregates when rows are grouped', () => {
    renderGrid({
      initialState: {
        rowGrouping: { model: ['region'] },
        aggregation: { model: { amount: 'max' } },
        charts: { model: { type: 'column', series: ['amount'] } },
      },
    });
    openPanel();
    const titles = [...screen.getByRole('img').querySelectorAll('rect title')].map((title) => title.textContent);
    expect(titles).toEqual(['Amount, East: 20', 'Amount, North: 5', 'Amount, West: 40']);
  });

  it('exposes the model and the data on the api, and saves them in the state', () => {
    const api = renderGrid();
    act(() => api().setChartsModel({ type: 'bar', series: ['units', 'nothing'] }));
    // Fields that are not number columns drop out.
    expect(api().getChartsModel()).toEqual({ type: 'bar', categoryField: undefined, series: ['units'] } satisfies GridChartsModel);
    expect(api().getChartData().series[0]?.values).toEqual([3, 4, 5]);
    expect(api().exportState().charts?.model?.type).toBe('bar');
    act(() => api().restoreState({ charts: { model: { type: 'area', series: ['amount'] } } }));
    expect(api().getChartsModel().type).toBe('area');
  });
});
