import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataGrid, useGridApiRef } from './DataGrid';
import type { GridColDef, GridDataSource } from './DataGrid.types';
import { getRowComparator } from './features/sorting';

type Item = { id: number; name: string };

const all: Item[] = Array.from({ length: 25 }, (_, index) => ({ id: index + 1, name: `Item ${String(index + 1).padStart(2, '0')}` }));
const columns: GridColDef<Item>[] = [{ field: 'name', headerName: 'Name' }];

function makeSource(): GridDataSource<Item> & { getRows: ReturnType<typeof vi.fn> } {
  return {
    getRows: vi.fn(async ({ sortModel, paginationModel }) => {
      const sorted = sortModel[0]?.sort === 'desc' ? [...all].reverse() : all;
      const start = paginationModel.page * paginationModel.pageSize;
      return { rows: sorted.slice(start, start + paginationModel.pageSize), rowCount: all.length };
    }),
  };
}

const names = () => screen.queryAllByRole('gridcell').map((cell) => cell.textContent);

describe('dataSource', () => {
  it('loads the first page and the row count', async () => {
    const dataSource = makeSource();
    render(<DataGrid rows={[]} columns={columns} dataSource={dataSource} pageSizeOptions={[10]} disableVirtualization />);

    await waitFor(() => expect(names()).toContain('Item 01'));
    expect(names()).toHaveLength(10);
    expect(dataSource.getRows).toHaveBeenCalledTimes(1);
    expect(dataSource.getRows.mock.calls[0]?.[0].paginationModel).toEqual({ page: 0, pageSize: 10 });
    expect(screen.getByText(/1–10 of 25/)).toBeTruthy();
  });

  it('fetches again for the next page and for a new sort', async () => {
    const dataSource = makeSource();
    render(<DataGrid rows={[]} columns={columns} dataSource={dataSource} pageSizeOptions={[10]} disableVirtualization />);
    await waitFor(() => expect(names()).toContain('Item 01'));

    fireEvent.click(screen.getByRole('button', { name: /next page/i }));
    await waitFor(() => expect(names()).toContain('Item 11'));
    expect(dataSource.getRows.mock.calls.at(-1)?.[0].paginationModel.page).toBe(1);

    fireEvent.click(screen.getByRole('columnheader', { name: /Name/ }));
    fireEvent.click(screen.getByRole('columnheader', { name: /Name/ }));
    await waitFor(() => expect(dataSource.getRows.mock.calls.at(-1)?.[0].sortModel).toEqual([{ field: 'name', sort: 'desc' }]));
    await waitFor(() => expect(names()).toContain('Item 15'));
  });

  it('refetches through the api and reports errors', async () => {
    const onError = vi.fn();
    const failing: GridDataSource<Item> = {
      getRows: vi.fn(async () => {
        throw new Error('boom');
      }),
      onError,
    };
    let refetch: (() => void) | undefined;
    function Harness() {
      const apiRef = useGridApiRef();
      refetch = () => apiRef.current.refetch();
      return <DataGrid rows={[]} columns={columns} dataSource={failing} apiRef={apiRef} disableVirtualization />;
    }
    render(<Harness />);
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    refetch?.();
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(2));
  });
});

describe('sorting options', () => {
  it('uses getSortComparator for the direction', () => {
    const byLength: GridColDef<Item> = {
      field: 'name',
      getSortComparator: (direction) => (a: string, b: string) => (direction === 'asc' ? 1 : -1) * (a.length - b.length || a.localeCompare(b)),
    };
    const rows: Item[] = [
      { id: 1, name: 'ccc' },
      { id: 2, name: 'a' },
      { id: 3, name: 'bb' },
    ];
    const map = new Map([['name', byLength]]);
    const asc = getRowComparator([{ field: 'name', sort: 'asc' }], map);
    const desc = getRowComparator([{ field: 'name', sort: 'desc' }], map);
    expect([...rows].sort(asc!).map((row) => row.name)).toEqual(['a', 'bb', 'ccc']);
    expect([...rows].sort(desc!).map((row) => row.name)).toEqual(['ccc', 'bb', 'a']);
  });

  it('cycles a column through its own sortingOrder', () => {
    const rows: Item[] = [
      { id: 1, name: 'b' },
      { id: 2, name: 'a' },
    ];
    render(<DataGrid rows={rows} columns={[{ field: 'name', headerName: 'Name', sortingOrder: ['desc', null] }]} disableVirtualization />);
    const header = () => screen.getByRole('columnheader', { name: /Name/ });
    fireEvent.click(header());
    expect(header().getAttribute('aria-sort')).toBe('descending');
    fireEvent.click(header());
    expect(header().getAttribute('aria-sort')).toBeNull();
  });
});

describe('columnGroupHeaderHeight', () => {
  it('sizes the group header row', () => {
    const { container } = render(
      <DataGrid
        rows={all.slice(0, 2)}
        columns={columns}
        columnGroupingModel={[{ groupId: 'g', headerName: 'Group', children: [{ field: 'name' }] }]}
        columnGroupHeaderHeight={20}
        columnHeaderHeight={60}
        disableVirtualization
      />,
    );
    const groupCell = screen.getByText('Group').closest('tr') as HTMLElement;
    expect(getComputedStyle(groupCell).height).toBe('20px');
    expect(container).toBeTruthy();
  });
});
