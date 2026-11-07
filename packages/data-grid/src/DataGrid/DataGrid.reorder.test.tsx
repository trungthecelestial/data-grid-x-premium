import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataGrid, useGridApiRef } from './DataGrid';
import type { GridApi, GridColDef } from './DataGrid.types';

type Person = { id: number; name: string };

const people: Person[] = [
  { id: 1, name: 'Ada' },
  { id: 2, name: 'Alan' },
  { id: 3, name: 'Grace' },
  { id: 4, name: 'Linus' },
];

const columns: GridColDef<Person>[] = [{ field: 'name', headerName: 'Name' }];

const order = () => screen.getAllByRole('gridcell').map((cell) => cell.textContent).filter(Boolean);

const dataTransfer = () => ({ setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '' });

const handles = () => screen.getAllByRole('button', { name: 'Reorder row' });
const rowOf = (name: string) => screen.getByRole('gridcell', { name }).closest('tr') as HTMLElement;

function drag(fromName: string, toName: string) {
  const handle = within(rowOf(fromName));
  fireEvent.dragStart(handle.getByRole('button', { name: 'Reorder row' }), { dataTransfer: dataTransfer() });
  fireEvent.dragOver(rowOf(toName), { dataTransfer: dataTransfer(), clientY: 0 });
  fireEvent.drop(rowOf(toName), { dataTransfer: dataTransfer() });
}

describe('row reordering', () => {
  it('adds a drag handle column only when enabled', () => {
    const { rerender } = render(<DataGrid rows={people} columns={columns} />);
    expect(screen.queryByRole('button', { name: 'Reorder row' })).toBeNull();

    rerender(<DataGrid rows={people} columns={columns} rowReordering />);
    expect(handles()).toHaveLength(4);
    expect(screen.getByRole('grid').getAttribute('aria-colcount')).toBe('2');
  });

  it('moves a row down when it is dropped on a later row', () => {
    const onRowOrderChange = vi.fn();
    render(<DataGrid rows={people} columns={columns} rowReordering onRowOrderChange={onRowOrderChange} />);

    drag('Ada', 'Grace');

    expect(order()).toEqual(['Alan', 'Grace', 'Ada', 'Linus']);
    expect(onRowOrderChange).toHaveBeenCalledWith({ row: people[0], oldIndex: 0, targetIndex: 2 });
  });

  it('moves a row up when it is dropped on an earlier row', () => {
    const onRowOrderChange = vi.fn();
    render(<DataGrid rows={people} columns={columns} rowReordering onRowOrderChange={onRowOrderChange} />);

    drag('Linus', 'Alan');

    expect(order()).toEqual(['Ada', 'Linus', 'Alan', 'Grace']);
    expect(onRowOrderChange).toHaveBeenCalledWith({ row: people[3], oldIndex: 3, targetIndex: 1 });
  });

  it('ignores a drop on the row being dragged', () => {
    const onRowOrderChange = vi.fn();
    render(<DataGrid rows={people} columns={columns} rowReordering onRowOrderChange={onRowOrderChange} />);

    drag('Alan', 'Alan');

    expect(order()).toEqual(['Ada', 'Alan', 'Grace', 'Linus']);
    expect(onRowOrderChange).not.toHaveBeenCalled();
  });

  it('moves a row with Alt+Arrow keys from its handle', () => {
    const onRowOrderChange = vi.fn();
    render(<DataGrid rows={people} columns={columns} rowReordering onRowOrderChange={onRowOrderChange} />);

    fireEvent.keyDown(within(rowOf('Alan')).getByRole('button', { name: 'Reorder row' }), { key: 'ArrowDown', altKey: true });
    expect(order()).toEqual(['Ada', 'Grace', 'Alan', 'Linus']);
    expect(onRowOrderChange).toHaveBeenLastCalledWith({ row: people[1], oldIndex: 1, targetIndex: 2 });

    fireEvent.keyDown(within(rowOf('Alan')).getByRole('button', { name: 'Reorder row' }), { key: 'ArrowUp', altKey: true });
    expect(order()).toEqual(['Ada', 'Alan', 'Grace', 'Linus']);
  });

  it('does not move past the first or last row', () => {
    const onRowOrderChange = vi.fn();
    render(<DataGrid rows={people} columns={columns} rowReordering onRowOrderChange={onRowOrderChange} />);

    fireEvent.keyDown(within(rowOf('Ada')).getByRole('button', { name: 'Reorder row' }), { key: 'ArrowUp', altKey: true });
    fireEvent.keyDown(within(rowOf('Linus')).getByRole('button', { name: 'Reorder row' }), { key: 'ArrowDown', altKey: true });

    expect(onRowOrderChange).not.toHaveBeenCalled();
    expect(order()).toEqual(['Ada', 'Alan', 'Grace', 'Linus']);
  });

  it('disables the handles while sorting or filtering is active', () => {
    const { rerender } = render(
      <DataGrid rows={people} columns={columns} rowReordering sortModel={[{ field: 'name', sort: 'desc' }]} />,
    );
    expect(handles().every((handle) => (handle as HTMLButtonElement).disabled)).toBe(true);

    rerender(
      <DataGrid
        rows={people}
        columns={columns}
        rowReordering
        filterModel={{ items: [{ id: 'a', field: 'name', operator: 'contains', value: 'a' }] }}
      />,
    );
    expect(handles().every((handle) => (handle as HTMLButtonElement).disabled)).toBe(true);

    rerender(<DataGrid rows={people} columns={columns} rowReordering sortModel={[]} />);
    expect(handles().every((handle) => !(handle as HTMLButtonElement).disabled)).toBe(true);
  });

  it('keeps the dragged order across re-renders and drops it when rows change', () => {
    const { rerender } = render(<DataGrid rows={people} columns={columns} rowReordering />);
    drag('Ada', 'Linus');
    expect(order()).toEqual(['Alan', 'Grace', 'Linus', 'Ada']);

    rerender(<DataGrid rows={people} columns={columns} rowReordering showToolbar />);
    expect(order()).toEqual(['Alan', 'Grace', 'Linus', 'Ada']);

    rerender(<DataGrid rows={[...people]} columns={columns} rowReordering />);
    expect(order()).toEqual(['Ada', 'Alan', 'Grace', 'Linus']);
  });

  it('moves rows through apiRef.setRowIndex without the handle column', () => {
    const holder: { ref: { current: GridApi } | null } = { ref: null };
    function Harness() {
      const apiRef = useGridApiRef();
      holder.ref = apiRef;
      return <DataGrid rows={people} columns={columns} apiRef={apiRef} />;
    }
    render(<Harness />);

    act(() => (holder.ref as { current: GridApi }).current.setRowIndex(4, 0));
    expect(order()).toEqual(['Linus', 'Ada', 'Alan', 'Grace']);
  });

  it('reorders across pages using positions among all rows', () => {
    const onRowOrderChange = vi.fn();
    render(
      <DataGrid
        rows={people}
        columns={columns}
        rowReordering
        pageSizeOptions={[2]}
        initialState={{ pagination: { paginationModel: { page: 0, pageSize: 2 } } }}
        onRowOrderChange={onRowOrderChange}
      />,
    );

    drag('Ada', 'Alan');
    expect(onRowOrderChange).toHaveBeenCalledWith({ row: people[0], oldIndex: 0, targetIndex: 1 });
    expect(order()).toEqual(['Alan', 'Ada']);
  });
});
