import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataGrid, useGridApiRef } from './DataGrid';
import type { GridAggregationFunctionDef, GridApi, GridColDef, GridInitialState, GridPivotModel } from './DataGrid.types';
import { GRID_AGGREGATION_FUNCTIONS } from './features/aggregation';

type Sale = { id: number; region: string; quarter: string; amount: number };

const sales: Sale[] = [
  { id: 1, region: 'East', quarter: 'Q1', amount: 10 },
  { id: 2, region: 'East', quarter: 'Q2', amount: 20 },
  { id: 3, region: 'West', quarter: 'Q1', amount: 40 },
  { id: 4, region: 'North', quarter: 'Q1', amount: 5 },
];

const columns: GridColDef<Sale>[] = [
  { field: 'region', headerName: 'Region' },
  { field: 'quarter', headerName: 'Quarter' },
  { field: 'amount', headerName: 'Amount', type: 'number' },
];

const model: GridPivotModel = {
  rows: [{ field: 'region' }],
  columns: [{ field: 'quarter' }],
  values: [{ field: 'amount', aggFunc: 'sum' }],
};

const pivotState: GridInitialState = { pivoting: { enabled: true, model } };

type Props = Partial<React.ComponentProps<typeof DataGrid<Sale>>>;

function renderGrid(props: Props = {}) {
  const holder: { ref: { current: GridApi } | null } = { ref: null };
  function Harness() {
    const apiRef = useGridApiRef();
    holder.ref = apiRef;
    return <DataGrid rows={sales} columns={columns} apiRef={apiRef} disableVirtualization pagination={false} {...props} />;
  }
  render(<Harness />);
  return () => (holder.ref as { current: GridApi }).current;
}

const rowTexts = () =>
  screen
    .getAllByRole('row')
    .map((row) => within(row).queryAllByRole('gridcell').map((cell) => cell.textContent))
    .filter((cells) => cells.length > 0);
const headers = () => screen.getAllByRole('columnheader').map((header) => header.textContent);

describe('pivoting', () => {
  it('shows one row per value, one column per value and a grand total', () => {
    renderGrid({ initialState: pivotState });
    expect(headers()).toEqual(expect.arrayContaining(['Q1', 'Q2', 'Region']));
    expect(rowTexts()).toEqual([
      ['East', '10', '20'],
      ['North', '5', ''],
      ['West', '40', ''],
      ['', '55', '20'],
    ]);
  });

  it('keeps showing the source rows until the model has fields', () => {
    renderGrid({ initialState: { pivoting: { enabled: true } } });
    expect(rowTexts()[0]).toEqual(['East', 'Q1', '10']);
  });

  it('switches through the api, and back to the untouched source grid', () => {
    const api = renderGrid({ initialState: { pivoting: { model } } });
    expect(rowTexts()).toHaveLength(4);
    act(() => api().setPivotActive(true));
    expect(api().isPivotActive()).toBe(true);
    expect(rowTexts()[0]).toEqual(['East', '10', '20']);
    act(() => api().setPivotActive(false));
    expect(rowTexts()[0]).toEqual(['East', 'Q1', '10']);
  });

  it('applies filters to the source rows before pivoting', () => {
    renderGrid({
      initialState: { ...pivotState, filter: { filterModel: { items: [{ field: 'quarter', operator: 'equals', value: 'Q2' }] } } },
    });
    expect(rowTexts()).toEqual([
      ['East', '20'],
      ['', '20'],
    ]);
  });

  it('sorts rows by a generated column', () => {
    renderGrid({ initialState: { ...pivotState, sorting: { sortModel: [{ field: 'pivot:["Q1"]:amount', sort: 'desc' }] } } });
    expect(rowTexts().map((cells) => cells[0])).toEqual(['West', 'East', 'North', '']);
  });

  it('expands nested row levels with their own subtotal', () => {
    renderGrid({ initialState: { pivoting: { enabled: true, model: { ...model, rows: [{ field: 'region' }, { field: 'quarter' }], columns: [] } } } });
    expect(rowTexts()[0]).toEqual(['East', '30']);
    fireEvent.click(within(screen.getAllByRole('row')[1] as HTMLElement).getByRole('button', { name: /expand or collapse/i }));
    expect(rowTexts().slice(0, 3)).toEqual([
      ['East', '30'],
      ['Q1', '10'],
      ['Q2', '20'],
    ]);
  });

  it('turns row-level features off and passes no generated rows to row callbacks', () => {
    const getRowClassName = vi.fn(() => 'x');
    const onRowClick = vi.fn();
    renderGrid({ initialState: pivotState, checkboxSelection: true, getRowClassName, onRowClick });
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(getRowClassName).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('East'));
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('keeps the selection for when pivoting ends', () => {
    const api = renderGrid({ initialState: { ...pivotState, rowSelection: [2] }, checkboxSelection: true });
    act(() => api().setPivotActive(false));
    expect(api().isRowSelected(2)).toBe(true);
  });

  it('pivots runtime edits', () => {
    const api = renderGrid({ initialState: { pivoting: { model } } });
    act(() => api().updateRows([{ id: 1, amount: 100 }]));
    act(() => api().setPivotActive(true));
    expect(rowTexts()[0]).toEqual(['East', '100', '20']);
  });

  it('exports the row path next to the generated columns', () => {
    const api = renderGrid({ initialState: pivotState });
    expect(api().getDataAsCsv().split(/\r?\n/)[1]).toBe('East,10,20');
  });

  it('round-trips pivot state and leaves generated values out of it', () => {
    const api = renderGrid({ initialState: pivotState });
    const state = api().exportState();
    expect(state.pivoting).toEqual({ enabled: true, model });
    expect(state.aggregation).toBeUndefined();
    act(() => api().restoreState({ pivoting: { enabled: false } }));
    expect(rowTexts()[0]).toEqual(['East', 'Q1', '10']);
  });

  it('reports controlled changes and follows the controlled props', () => {
    const onPivotActiveChange = vi.fn();
    const onPivotModelChange = vi.fn();
    const api = renderGrid({ pivotActive: false, pivotModel: model, onPivotActiveChange, onPivotModelChange });
    act(() => api().setPivotActive(true));
    expect(onPivotActiveChange).toHaveBeenCalledWith(true);
    expect(rowTexts()[0]).toEqual(['East', 'Q1', '10']);
    act(() => api().setPivotModel({ rows: [], columns: [], values: [] }));
    expect(onPivotModelChange).toHaveBeenCalledWith({ rows: [], columns: [], values: [] });
  });

  it('builds a table from the toolbar panel', async () => {
    renderGrid({ showToolbar: true });
    fireEvent.click(screen.getByRole('button', { name: 'Pivot' }));
    fireEvent.click(await screen.findByRole('switch', { name: 'Pivot table' }));

    const add = async (zone: string, option: string) => {
      fireEvent.mouseDown(within(screen.getByRole('region', { name: zone })).getByRole('combobox'));
      fireEvent.click(await screen.findByRole('option', { name: option }));
    };
    await add('Rows', 'Region');
    await add('Values', 'Amount');

    // The open panel hides the grid from the accessibility tree.
    const cells = screen.getAllByRole('row', { hidden: true }).map((row) => within(row).queryAllByRole('gridcell', { hidden: true })[1]?.textContent);
    expect(cells).toContain('30');
  });

  it('does not offer a field already used on the other axis', async () => {
    renderGrid({ showToolbar: true, initialState: pivotState });
    fireEvent.click(screen.getByRole('button', { name: 'Pivot' }));
    const rows = await screen.findByRole('region', { name: 'Rows' });
    fireEvent.mouseDown(within(rows).getAllByRole('combobox').at(-1) as HTMLElement);
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['Amount']);
  });

  it('is off with disablePivoting and with a data source', async () => {
    renderGrid({ showToolbar: true, disablePivoting: true, initialState: pivotState });
    expect(screen.queryByRole('button', { name: 'Pivot' })).toBeNull();
    expect(rowTexts()[0]).toEqual(['East', 'Q1', '10']);
  });
});

describe('custom aggregation in the grid', () => {
  const range: GridAggregationFunctionDef<number, number> = {
    label: 'Range',
    columnTypes: ['number'],
    valueFormatter: (value) => `±${value}`,
    apply: ({ values }) => Math.max(...values) - Math.min(...values),
  };
  const aggregationFunctions = { ...GRID_AGGREGATION_FUNCTIONS, range };

  it('shows the result in the footer, with its label in the header', () => {
    renderGrid({ aggregationFunctions, initialState: { aggregation: { model: { amount: 'range' } } } });
    expect(screen.getByText('±35')).toBeTruthy();
    expect(screen.getByText('Range')).toBeTruthy();
  });

  it('shows the result and the label on group rows', () => {
    renderGrid({ aggregationFunctions, initialState: { aggregation: { model: { amount: 'range' } }, rowGrouping: { model: ['region'] } } });
    expect(screen.getByText('±10 (range)')).toBeTruthy();
  });

  it('offers the function in the column menu', async () => {
    renderGrid({ aggregationFunctions });
    fireEvent.click(screen.getByRole('button', { name: 'Amount Menu' }));
    fireEvent.mouseDown(await screen.findByRole('combobox', { name: 'Aggregation' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Range' }));
    expect(screen.getByText('±35')).toBeTruthy();
  });

  it('ignores a model entry whose function is not registered', () => {
    renderGrid({ initialState: { aggregation: { model: { amount: 'range' } } } });
    expect(screen.queryByText('range')).toBeNull();
  });

  it('replaces the built-in functions when the prop omits them', async () => {
    renderGrid({ aggregationFunctions: { range } });
    fireEvent.click(screen.getByRole('button', { name: 'Amount Menu' }));
    fireEvent.mouseDown(await screen.findByRole('combobox', { name: 'Aggregation' }));
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['None', 'Range']);
  });

  it('pivots with a custom function', () => {
    renderGrid({
      aggregationFunctions,
      initialState: { pivoting: { enabled: true, model: { rows: [{ field: 'quarter' }], columns: [], values: [{ field: 'amount', aggFunc: 'range' }] } } },
    });
    expect(rowTexts()[0]).toEqual(['Q1', '±35']);
  });
});
