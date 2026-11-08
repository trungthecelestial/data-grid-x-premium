import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DataGrid, useGridApiRef } from './DataGrid';
import type { GridApi, GridColDef, GridDataSource, GridDataSourceGetRowsParams } from './DataGrid.types';
import { GridDataSourceCacheDefault } from './features/dataSourceCache';

type Sale = { id: string; region?: string; name?: string; amount?: number; count?: number; key?: string };

const leaves: Sale[] = [
  { id: 'a', region: 'East', name: 'Alpha', amount: 10 },
  { id: 'b', region: 'East', name: 'Beta', amount: 30 },
  { id: 'c', region: 'West', name: 'Gamma', amount: 5 },
];

const columns: GridColDef<Sale>[] = [
  { field: 'region', headerName: 'Region' },
  { field: 'name', headerName: 'Name' },
  // Throws on a missing value, as a formatter written for full rows would.
  { field: 'amount', headerName: 'Amount', type: 'number', valueFormatter: (value: number) => `$${value.toFixed(0)}` },
];

function makeGroupSource(extra: Partial<GridDataSource<Sale>> = {}) {
  const getRows = vi.fn(async ({ groupKeys, groupFields, sortModel }: GridDataSourceGetRowsParams) => {
    if (groupFields.length > 0 && groupKeys.length === 0) {
      const groups = ['East', 'West'].map((region) => {
        const rows = leaves.filter((row) => row.region === region);
        return { id: `g-${region}`, key: region, count: rows.length, amount: rows.reduce((total, row) => total + (row.amount ?? 0), 0) };
      });
      if (sortModel[0]?.sort === 'desc') {
        groups.reverse();
      }
      return { rows: groups, rowCount: 2, aggregateRow: { id: 'totals', amount: 45 } };
    }
    return { rows: leaves.filter((row) => row.region === groupKeys[0]), rowCount: 0 };
  });
  const source: GridDataSource<Sale> = {
    getRows,
    getGroupKey: (row) => row.key as string,
    getChildrenCount: (row) => row.count ?? 0,
    ...extra,
  };
  return { source, getRows };
}

const cellTexts = () =>
  screen
    .getAllByRole('row')
    .map((row) => within(row).queryAllByRole('gridcell').map((cell) => cell.textContent))
    .filter((cells) => cells.length > 0);

const expandRow = (label: RegExp) => {
  const row = screen.getByText(label).closest('tr') as HTMLElement;
  fireEvent.click(within(row).getByRole('button', { name: /expand or collapse/i }));
};

const grouped = { rowGrouping: { model: ['region'] } };

function renderWithApi(props: Partial<React.ComponentProps<typeof DataGrid<Sale>>> & { dataSource: GridDataSource<Sale> }) {
  const holder: { ref: { current: GridApi } | null } = { ref: null };
  function Harness() {
    const apiRef = useGridApiRef();
    holder.ref = apiRef;
    return <DataGrid rows={[]} columns={columns} apiRef={apiRef} disableVirtualization {...props} />;
  }
  render(<Harness />);
  return () => (holder.ref as { current: GridApi }).current;
}

describe('server-side row grouping', () => {
  it('asks for groups and shows them with the server count', async () => {
    const { source, getRows } = makeGroupSource();
    renderWithApi({ dataSource: source, initialState: grouped });
    await screen.findByText('East (2)');
    expect(getRows.mock.calls[0]?.[0]).toMatchObject({ groupKeys: [], groupFields: ['region'], start: 0, end: 9 });
    expect(screen.getByText('West (1)')).toBeTruthy();
  });

  it('loads children on expand with the group path, once', async () => {
    const { source, getRows } = makeGroupSource();
    renderWithApi({ dataSource: source, initialState: grouped });
    await screen.findByText('East (2)');
    expandRow(/East/);
    await screen.findByText('Alpha');
    expect(getRows.mock.calls.at(-1)?.[0].groupKeys).toEqual(['East']);
    const calls = getRows.mock.calls.length;
    expandRow(/East/);
    expandRow(/East/);
    expect(getRows).toHaveBeenCalledTimes(calls);
  });

  it('reloads the children of open groups after a sort change', async () => {
    const { source, getRows } = makeGroupSource();
    renderWithApi({ dataSource: source, initialState: grouped });
    await screen.findByText('East (2)');
    expandRow(/East/);
    await screen.findByText('Alpha');
    fireEvent.click(screen.getByRole('columnheader', { name: /Name/ }));
    fireEvent.click(screen.getByRole('columnheader', { name: /Name/ }));
    await waitFor(() => expect(getRows.mock.calls.some(([params]) => params.groupKeys[0] === 'East' && params.sortModel[0]?.sort === 'desc')).toBe(true));
    await screen.findByText('Alpha');
  });

  it('does not run column formatters on empty group cells, or offer groups for selection and export', async () => {
    const { source } = makeGroupSource();
    const api = renderWithApi({ dataSource: source, initialState: grouped, checkboxSelection: true });
    await screen.findByText('East (2)');
    const row = screen.getByText('East (2)').closest('tr') as HTMLElement;
    expect(within(row).getByRole('checkbox', { name: /select row/i }).hasAttribute('disabled')).toBe(true);
    expect(api().getDataAsCsv().split(/\r?\n/)).toHaveLength(1);
  });

  it('shows server aggregates on groups and in the footer', async () => {
    const { source } = makeGroupSource({ getAggregatedValue: (row, field) => row[field as keyof Sale] });
    renderWithApi({ dataSource: source, initialState: { ...grouped, aggregation: { model: { amount: 'sum' } } } });
    await screen.findByText('$40 (sum)');
    expect(screen.getByText('$45')).toBeTruthy();
  });

  it('sends the aggregation model', async () => {
    const { source, getRows } = makeGroupSource();
    renderWithApi({ dataSource: source, initialState: { aggregation: { model: { amount: 'sum' } } } });
    await waitFor(() => expect(getRows.mock.calls[0]?.[0].aggregationModel).toEqual({ amount: 'sum' }));
  });

  it('stops grouping from the group column menu state', async () => {
    const { source, getRows } = makeGroupSource();
    const api = renderWithApi({ dataSource: source, initialState: grouped });
    await screen.findByText('East (2)');
    act(() => api().setRowGroupingModel([]));
    await waitFor(() => expect(getRows.mock.calls.at(-1)?.[0].groupFields).toEqual([]));
  });

  it('keeps grouping on the loaded rows without the nesting callbacks', async () => {
    const getRows = vi.fn(async () => ({ rows: leaves, rowCount: 3 }));
    renderWithApi({ dataSource: { getRows }, initialState: grouped });
    await screen.findByText('East (2)');
    expect(getRows.mock.calls[0]).toEqual([expect.objectContaining({ groupFields: [] })]);
  });
});

describe('server-side tree data', () => {
  it('loads nested levels with the whole path', async () => {
    const getRows = vi.fn(async ({ groupKeys }: GridDataSourceGetRowsParams) => {
      if (groupKeys.length === 0) return { rows: [{ id: '1', key: 'root', count: 1, name: 'Top' }], rowCount: 1 };
      if (groupKeys.length === 1) return { rows: [{ id: '2', key: 'mid', count: 1, name: 'Middle' }], rowCount: 1 };
      return { rows: [{ id: '3', key: 'leaf', count: 0, name: 'Bottom' }], rowCount: 1 };
    });
    const source: GridDataSource<Sale> = { getRows, getGroupKey: (row) => row.key as string, getChildrenCount: (row) => row.count ?? 0 };
    renderWithApi({ dataSource: source, treeData: true, columns: [columns[1] as GridColDef<Sale>] });
    await screen.findByText('Top');
    expandRow(/^root$/);
    await screen.findByText('Middle');
    expandRow(/^mid$/);
    await screen.findByText('Bottom');
    expect(getRows.mock.calls.at(-1)?.[0]).toMatchObject({ groupKeys: ['root', 'mid'], groupFields: [] });
  });
});

describe('lazy loading', () => {
  const makeLazy = (total = 100) =>
    vi.fn(async ({ start, end }: GridDataSourceGetRowsParams) => ({
      rows: Array.from({ length: Math.min(end, total - 1) - start + 1 }, (_, index) => ({ id: String(start + index), name: `Row ${start + index}` })),
      rowCount: total,
    }));

  const lazyColumns = [columns[1] as GridColDef<Sale>];

  it('loads batches for the rendered rows and shows the full scroll length', async () => {
    const getRows = makeLazy();
    render(<DataGrid rows={[]} columns={lazyColumns} dataSource={{ getRows }} lazyLoading lazyLoadingRequestThrottleMs={0} pageSizeOptions={[5]} />);
    await screen.findByText('Row 0');
    expect(getRows.mock.calls[0]?.[0]).toMatchObject({ start: 0, end: 4 });
    await screen.findByText('Row 5');
    expect(screen.queryByRole('button', { name: /next page/i })).toBeNull();
    const spacer = [...document.querySelectorAll<HTMLElement>('tr[role="presentation"]')].at(-1) as HTMLElement;
    expect(parseFloat(getComputedStyle(spacer).height)).toBeGreaterThan(4000);
  });

  it('loads what scrolls into view', async () => {
    const getRows = makeLazy();
    render(<DataGrid rows={[]} columns={lazyColumns} dataSource={{ getRows }} lazyLoading lazyLoadingRequestThrottleMs={0} pageSizeOptions={[5]} />);
    await screen.findByText('Row 0');
    const scroller = document.querySelector('.MuiTableContainer-root') as HTMLElement;
    scroller.scrollTop = 52 * 60;
    fireEvent.scroll(scroller);
    await screen.findByText('Row 60');
    expect(getRows.mock.calls.some(([params]) => params.start === 60)).toBe(true);
    expect(getRows.mock.calls.some(([params]) => params.start === 30)).toBe(false);
  });

  it('keeps loading on scroll under StrictMode', async () => {
    const getRows = makeLazy();
    render(
      <StrictMode>
        <DataGrid rows={[]} columns={lazyColumns} dataSource={{ getRows }} lazyLoading lazyLoadingRequestThrottleMs={0} pageSizeOptions={[5]} />
      </StrictMode>,
    );
    await screen.findByText('Row 0');
    const scroller = document.querySelector('.MuiTableContainer-root') as HTMLElement;
    scroller.scrollTop = 52 * 60;
    fireEvent.scroll(scroller);
    await screen.findByText('Row 60');
  });

  it('grows the list while the total is unknown and stops at the end', async () => {
    const getRows = vi.fn(async ({ start }: GridDataSourceGetRowsParams) => ({
      rows: start === 0 ? [{ id: '0', name: 'Row 0' }, { id: '1', name: 'Row 1' }] : [{ id: '2', name: 'Row 2' }],
    }));
    render(<DataGrid rows={[]} columns={lazyColumns} dataSource={{ getRows }} lazyLoading lazyLoadingRequestThrottleMs={0} pageSizeOptions={[2]} />);
    await screen.findByText('Row 2');
    await waitFor(() => expect(document.querySelectorAll('tbody tr[aria-rowindex]')).toHaveLength(3));
    expect(getRows).toHaveBeenCalledTimes(2);
  });

  it('shows skeletons for rows on their way', async () => {
    let resolveSecond: (value: { rows: Sale[]; rowCount: number }) => void = () => undefined;
    const getRows = vi.fn(({ start }: GridDataSourceGetRowsParams) =>
      start === 0
        ? Promise.resolve({ rows: [{ id: '0', name: 'Row 0' }, { id: '1', name: 'Row 1' }], rowCount: 4 })
        : new Promise<{ rows: Sale[]; rowCount: number }>((resolve) => {
            resolveSecond = resolve;
          }),
    );
    render(<DataGrid rows={[]} columns={lazyColumns} dataSource={{ getRows }} lazyLoading lazyLoadingRequestThrottleMs={0} pageSizeOptions={[2]} />);
    await screen.findByText('Row 0');
    await waitFor(() => expect(document.querySelectorAll('.MuiSkeleton-root')).toHaveLength(2));
    await waitFor(() => expect(getRows).toHaveBeenCalledTimes(2));
    await act(async () => resolveSecond({ rows: [{ id: '2', name: 'Row 2' }, { id: '3', name: 'Row 3' }], rowCount: 4 }));
    expect(document.querySelectorAll('.MuiSkeleton-root')).toHaveLength(0);
  });
});

describe('unknown row count', () => {
  it('pages on without a total and settles when a short page arrives', async () => {
    const getRows = vi.fn(async ({ start }: GridDataSourceGetRowsParams) => ({
      rows: start === 0 ? [{ id: '0', name: 'A' }, { id: '1', name: 'B' }] : [{ id: '2', name: 'C' }],
    }));
    render(<DataGrid rows={[]} columns={[columns[1] as GridColDef<Sale>]} dataSource={{ getRows }} pageSizeOptions={[2]} disableVirtualization />);
    await screen.findByText('A');
    expect(screen.getByText(/of more than/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /next page/i }));
    await screen.findByText('C');
    expect(screen.getByText(/3–3 of 3/)).toBeTruthy();
  });
});

describe('dataSourceCache', () => {
  const makeSource = () => vi.fn(async () => ({ rows: leaves, rowCount: 30 }));
  const sortByName = () => fireEvent.click(screen.getByRole('columnheader', { name: /Name/ }));

  it('serves a repeated request from the cache', async () => {
    const getRows = makeSource();
    renderWithApi({ dataSource: { getRows }, pageSizeOptions: [3] });
    await screen.findByText('Alpha');
    fireEvent.click(screen.getByRole('button', { name: /next page/i }));
    await waitFor(() => expect(getRows).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: /previous page/i }));
    await screen.findByText('Alpha');
    expect(getRows).toHaveBeenCalledTimes(2);
  });

  it('always asks the server with null', async () => {
    const getRows = makeSource();
    renderWithApi({ dataSource: { getRows }, dataSourceCache: null, pageSizeOptions: [3] });
    await screen.findByText('Alpha');
    sortByName();
    await waitFor(() => expect(getRows).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: /next page/i }));
    await waitFor(() => expect(getRows).toHaveBeenCalledTimes(3));
    fireEvent.click(screen.getByRole('button', { name: /previous page/i }));
    await waitFor(() => expect(getRows).toHaveBeenCalledTimes(4));
  });

  it('is emptied by refetch', async () => {
    const getRows = makeSource();
    const api = renderWithApi({ dataSource: { getRows } });
    await screen.findByText('Alpha');
    act(() => api().refetch());
    await waitFor(() => expect(getRows).toHaveBeenCalledTimes(2));
  });

  it('expires entries', () => {
    vi.useFakeTimers();
    try {
      const cache = new GridDataSourceCacheDefault({ ttl: 100 });
      const params = { start: 0 } as GridDataSourceGetRowsParams;
      cache.set(params, { rows: [] });
      expect(cache.get(params)).toEqual({ rows: [] });
      vi.advanceTimersByTime(101);
      expect(cache.get(params)).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not cache failures', async () => {
    const onError = vi.fn();
    const getRows = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue({ rows: leaves, rowCount: 3 });
    const api = renderWithApi({ dataSource: { getRows, onError } });
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    act(() => api().refetch());
    await screen.findByText('Alpha');
  });
});

describe('updateRow', () => {
  it('saves an edit through the data source and shows the stored row', async () => {
    const updateRow = vi.fn(async ({ updatedRow }: { updatedRow: Sale }) => ({ ...updatedRow, name: `${updatedRow.name} saved` }));
    const getRows = vi.fn(async () => ({ rows: leaves, rowCount: 3 }));
    renderWithApi({
      dataSource: { getRows, updateRow },
      columns: [{ field: 'name', headerName: 'Name', editable: true }],
    });
    fireEvent.doubleClick(await screen.findByText('Alpha'));
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'Changed' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await screen.findByText('Changed saved');
    expect(updateRow.mock.calls[0]?.[0]).toMatchObject({ rowId: 'a' });
  });
});
