import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataGrid } from './DataGrid';
import type { GridColDef, GridFilterModel } from './DataGrid.types';

type Person = { id: number; name: string; age: number; team: string };

const people: Person[] = [
  { id: 1, name: 'Ada', age: 36, team: 'red' },
  { id: 2, name: 'Alan', age: 41, team: 'blue' },
  { id: 3, name: 'Grace', age: 30, team: 'red' },
  { id: 4, name: 'Linus', age: 25, team: 'blue' },
];

const columns: GridColDef<Person>[] = [
  { field: 'name', headerName: 'Name' },
  { field: 'age', headerName: 'Age', type: 'number' },
  { field: 'team', headerName: 'Team' },
];

const names = () => screen.queryAllByRole('gridcell', { hidden: true }).map((cell) => cell.textContent);

describe('column virtualization', () => {
  const wide = Array.from({ length: 30 }, (_, index): GridColDef<Record<string, string>> => ({
    field: `c${index}`,
    headerName: `Col ${index}`,
    width: 100,
  }));
  const wideRows = [{ id: '1', ...Object.fromEntries(wide.map((column) => [column.field, `v-${column.field}`])) }];

  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 400 });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 300 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    // @ts-expect-error restoring the jsdom default
    delete HTMLElement.prototype.clientWidth;
    // @ts-expect-error restoring the jsdom default
    delete HTMLElement.prototype.clientHeight;
  });

  it('renders only the columns near the viewport and keeps the column count', () => {
    render(<DataGrid rows={wideRows} columns={wide} columnBuffer={1} hideFooter />);

    expect(screen.getByRole('grid').getAttribute('aria-colcount')).toBe('30');
    expect(screen.getByRole('columnheader', { name: 'Col 0' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Col 4' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Col 10' })).toBeNull();
    expect(screen.queryByText('v-c10')).toBeNull();
  });

  it('renders the columns that scroll into view', () => {
    const { container } = render(
      <DataGrid rows={wideRows} columns={wide} columnBuffer={1} hideFooter />,
    );
    const scroller = container.querySelector('.MuiTableContainer-root') as HTMLElement;

    scroller.scrollLeft = 1500;
    fireEvent.scroll(scroller);

    expect(screen.getByRole('columnheader', { name: 'Col 15' })).toBeTruthy();
    expect(screen.getByText('v-c15')).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Col 0' })).toBeNull();
    // aria-colindex still reports the real position.
    expect(screen.getByRole('columnheader', { name: 'Col 15' }).getAttribute('aria-colindex')).toBe('16');
  });

  it('always renders pinned columns', () => {
    const { container } = render(
      <DataGrid
        rows={wideRows}
        columns={wide}
       
        columnBuffer={1}
        hideFooter
        pinnedColumns={{ left: ['c0'], right: ['c29'] }}
      />,
    );
    const scroller = container.querySelector('.MuiTableContainer-root') as HTMLElement;

    scroller.scrollLeft = 1500;
    fireEvent.scroll(scroller);

    expect(screen.getByRole('columnheader', { name: 'Col 0' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Col 29' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Col 15' })).toBeTruthy();
  });

  it('renders every column when disabled', () => {
    render(<DataGrid rows={wideRows} columns={wide} disableColumnVirtualization hideFooter />);

    expect(screen.getByRole('columnheader', { name: 'Col 29' })).toBeTruthy();
  });
});

describe('column menu pin actions', () => {
  it('pins a column to either side and unpins it', async () => {
    const onPinnedColumnsChange = vi.fn();
    const { rerender } = render(<DataGrid rows={people} columns={columns} onPinnedColumnsChange={onPinnedColumnsChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Age Menu', hidden: true }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Pin to left' }));
    expect(onPinnedColumnsChange).toHaveBeenLastCalledWith({ left: ['age'], right: [] });

    rerender(
      <DataGrid rows={people} columns={columns} pinnedColumns={{ left: ['age'] }} onPinnedColumnsChange={onPinnedColumnsChange} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Age Menu', hidden: true }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Pin to right' }));
    expect(onPinnedColumnsChange).toHaveBeenLastCalledWith({ left: [], right: ['age'] });

    fireEvent.click(screen.getByRole('button', { name: 'Age Menu', hidden: true }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Unpin' }));
    expect(onPinnedColumnsChange).toHaveBeenLastCalledWith({ left: [], right: [] });
  });

  it('omits the pin actions when pinning is disabled for the grid or the column', async () => {
    const { rerender } = render(<DataGrid rows={people} columns={columns} disableColumnPinning />);
    fireEvent.click(screen.getByRole('button', { name: 'Age Menu', hidden: true }));
    await screen.findByRole('menu');
    expect(screen.queryByRole('menuitem', { name: 'Pin to left' })).toBeNull();

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    rerender(<DataGrid rows={people} columns={[{ field: 'name', headerName: 'Name', pinnable: false }]} />);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Name Menu', hidden: true }));
    await screen.findByRole('menu');
    expect(screen.queryByRole('menuitem', { name: 'Pin to left' })).toBeNull();
  });
});

describe('header filters', () => {
  it('adds a filter row and keeps aria row indexes in order', () => {
    render(<DataGrid rows={people} columns={columns} headerFilters />);

    const rows = screen.getAllByRole('row', { hidden: true });
    expect(rows[0]?.getAttribute('aria-rowindex')).toBe('1');
    expect(rows[1]?.getAttribute('aria-rowindex')).toBe('2');
    expect(rows[2]?.getAttribute('aria-rowindex')).toBe('3');
    expect(screen.getAllByRole('button', { name: /Operator/ })).toHaveLength(3);
  });

  it('filters as the user types and clears the item when the value is emptied', () => {
    const onFilterModelChange = vi.fn<(model: GridFilterModel) => void>();
    render(<DataGrid rows={people} columns={columns} headerFilters onFilterModelChange={onFilterModelChange} />);

    const input = within(screen.getByRole('grid')).getAllByRole('textbox', { name: 'Value' })[0] as HTMLElement;
    fireEvent.change(input, { target: { value: 'Al' } });

    expect(onFilterModelChange).toHaveBeenLastCalledWith({
      items: [expect.objectContaining({ field: 'name', operator: 'contains', value: 'Al' })],
    });
    expect(names()).toContain('Alan');
    expect(names()).not.toContain('Grace');

    fireEvent.change(input, { target: { value: '' } });
    expect(onFilterModelChange).toHaveBeenLastCalledWith({ items: [] });
    expect(names()).toContain('Grace');
  });

  it('changes the operator of a column filter', async () => {
    const onFilterModelChange = vi.fn<(model: GridFilterModel) => void>();
    render(
      <DataGrid
        rows={people}
        columns={columns}
        headerFilters
        filterModel={{ items: [{ id: 'a', field: 'name', operator: 'contains', value: 'a' }] }}
        onFilterModelChange={onFilterModelChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Name Operator' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'equals' }));

    expect(onFilterModelChange).toHaveBeenLastCalledWith({
      items: [expect.objectContaining({ id: 'a', field: 'name', operator: 'equals' })],
    });
  });

  it('shows the filter of the column when the model already has one', () => {
    render(
      <DataGrid
        rows={people}
        columns={columns}
        headerFilters
        filterModel={{ items: [{ id: 'a', field: 'team', operator: 'contains', value: 'red' }] }}
      />,
    );

    const inputs = within(screen.getByRole('grid')).getAllByRole('textbox', { name: 'Value' }) as HTMLInputElement[];
    expect(inputs.map((input) => input.value)).toContain('red');
    expect(names()).not.toContain('Alan');
  });

  it('keeps filterable columns wide enough for their filter input', () => {
    const narrow: GridColDef<Person>[] = [
      { field: 'name', headerName: 'Name', width: 60 },
      { field: 'age', headerName: 'Age', type: 'number', width: 60, filterable: false },
      { field: 'team', headerName: 'Team', width: 300 },
    ];
    const widthOf = (name: string) => getComputedStyle(screen.getByRole('columnheader', { name })).width;

    const { rerender } = render(<DataGrid rows={people} columns={narrow} />);
    expect(widthOf('Name')).toBe('60px');

    rerender(<DataGrid rows={people} columns={narrow} headerFilters />);
    expect(widthOf('Name')).toBe('116px');
    // Columns that are not filterable, or already wide, keep their size.
    expect(widthOf('Age')).toBe('60px');
    expect(widthOf('Team')).toBe('300px');
  });

  it('skips columns that cannot be filtered', () => {
    render(
      <DataGrid
        rows={people}
        columns={[{ field: 'name', headerName: 'Name', filterable: false }, ...columns.slice(1)]}
        headerFilters
      />,
    );

    expect(screen.queryByRole('button', { name: 'Name Operator' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Age Operator' })).toBeTruthy();
  });
});
