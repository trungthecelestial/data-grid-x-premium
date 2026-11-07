import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataGrid, useGridApiRef } from './DataGrid';
import type { GridApi, GridCellSelectionModel, GridColDef } from './DataGrid.types';
import { parseClipboardText, parsePastedValue, SKIP_PASTE } from './features/clipboard';

type Person = { id: number; name: string; age: number; team: string; active: boolean };

const people: Person[] = [
  { id: 1, name: 'Ada', age: 36, team: 'red', active: true },
  { id: 2, name: 'Alan', age: 41, team: 'blue', active: false },
  { id: 3, name: 'Grace', age: 30, team: 'red', active: true },
  { id: 4, name: 'Linus', age: 25, team: 'blue', active: false },
];

const columns: GridColDef<Person>[] = [
  { field: 'name', headerName: 'Name', editable: true },
  { field: 'age', headerName: 'Age', type: 'number', editable: true },
  { field: 'team', headerName: 'Team', type: 'singleSelect', valueOptions: ['red', 'blue'], editable: true },
  { field: 'active', headerName: 'Active', type: 'boolean' },
];

const cell = (name: string) => screen.getByRole('gridcell', { name });
const isSelected = (name: string) => cell(name).getAttribute('aria-selected') === 'true';

function renderWithApi(props: Partial<React.ComponentProps<typeof DataGrid<Person>>> = {}) {
  const holder: { ref: { current: GridApi } | null } = { ref: null };
  function Harness() {
    const apiRef = useGridApiRef();
    holder.ref = apiRef;
    return <DataGrid rows={people} columns={columns} apiRef={apiRef} {...props} />;
  }
  const view = render(<Harness />);
  return { ...view, api: () => (holder.ref as { current: GridApi }).current };
}

function paste(text: string) {
  fireEvent.paste(cell('Ada'), { clipboardData: { getData: () => text } });
}

describe('clipboard helpers', () => {
  it('splits rows and cells and ignores a trailing line break', () => {
    expect(parseClipboardText('a\tb\r\nc\td\r\n')).toEqual([['a', 'b'], ['c', 'd']]);
    expect(parseClipboardText('single')).toEqual([['single']]);
    expect(parseClipboardText('')).toEqual([]);
    expect(parseClipboardText('a\t\tc')).toEqual([['a', '', 'c']]);
  });

  it('reads quoted cells with tabs, line breaks and quotes', () => {
    expect(parseClipboardText('"a\tb"\t"line1\nline2"\t"say ""hi"""')).toEqual([['a\tb', 'line1\nline2', 'say "hi"']]);
  });

  it('converts text to the value of a column type', () => {
    const row = people[0] as Person;
    expect(parsePastedValue({ field: 'age', type: 'number' }, '1,250', row)).toBe(1250);
    expect(parsePastedValue({ field: 'age', type: 'number' }, 'abc', row)).toBe(SKIP_PASTE);
    expect(parsePastedValue({ field: 'age', type: 'number' }, '', row)).toBeNull();
    expect(parsePastedValue({ field: 'active', type: 'boolean' }, 'Yes', row)).toBe(true);
    expect(parsePastedValue({ field: 'active', type: 'boolean' }, 'no', row)).toBe(false);
    expect(parsePastedValue({ field: 'joined', type: 'date' }, 'nope', row)).toBe(SKIP_PASTE);
    expect((parsePastedValue({ field: 'joined', type: 'date' }, '2024-05-06', row) as Date).getFullYear()).toBe(2024);
    expect(parsePastedValue({ field: 'team', type: 'singleSelect', valueOptions: ['red', 'blue'] }, 'BLUE', row)).toBe('blue');
    expect(parsePastedValue({ field: 'team', type: 'singleSelect', valueOptions: ['red'] }, 'green', row)).toBe(SKIP_PASTE);
    expect(parsePastedValue({ field: 'age', type: 'number', valueParser: (value) => `parsed:${value}` }, '7', row)).toBe('parsed:7');
  });
});

describe('cell selection', () => {
  it('selects a cell on click and does not select the row', () => {
    const onRowSelectionModelChange = vi.fn();
    render(<DataGrid rows={people} columns={columns} cellSelection onRowSelectionModelChange={onRowSelectionModelChange} />);

    fireEvent.mouseDown(cell('Alan'));
    fireEvent.click(cell('Alan'));

    expect(isSelected('Alan')).toBe(true);
    expect(isSelected('Ada')).toBe(false);
    expect(onRowSelectionModelChange).not.toHaveBeenCalled();
  });

  it('selects a range with Shift+click', () => {
    const onChange = vi.fn<(model: GridCellSelectionModel) => void>();
    render(<DataGrid rows={people} columns={columns} cellSelection onCellSelectionModelChange={onChange} />);

    fireEvent.mouseDown(cell('Ada'));
    fireEvent.mouseDown(cell('41'), { shiftKey: true });

    expect(onChange).toHaveBeenLastCalledWith({ 1: { name: true, age: true }, 2: { name: true, age: true } });
    expect(isSelected('Alan')).toBe(true);
    expect(isSelected('Grace')).toBe(false);
  });

  it('selects a range by dragging and stops when the button is released', () => {
    render(<DataGrid rows={people} columns={columns} cellSelection />);

    fireEvent.mouseDown(cell('Ada'));
    fireEvent.mouseEnter(cell('30'));
    expect(isSelected('Grace')).toBe(true);
    expect(isSelected('30')).toBe(true);
    expect(isSelected('Linus')).toBe(false);

    fireEvent.mouseUp(window);
    fireEvent.mouseEnter(cell('25'));
    expect(isSelected('Linus')).toBe(false);
  });

  it('toggles single cells with Ctrl+click', () => {
    render(<DataGrid rows={people} columns={columns} cellSelection />);

    fireEvent.mouseDown(cell('Ada'));
    fireEvent.mouseDown(cell('Grace'), { ctrlKey: true });
    expect(isSelected('Ada')).toBe(true);
    expect(isSelected('Grace')).toBe(true);

    fireEvent.mouseDown(cell('Ada'), { ctrlKey: true });
    expect(isSelected('Ada')).toBe(false);
    expect(isSelected('Grace')).toBe(true);
  });

  it('extends the selection with Shift+Arrow', () => {
    render(<DataGrid rows={people} columns={columns} cellSelection />);

    fireEvent.mouseDown(cell('Ada'));
    fireEvent.click(cell('Ada'));
    fireEvent.keyDown(cell('Ada'), { key: 'ArrowDown', shiftKey: true });

    expect(isSelected('Ada')).toBe(true);
    expect(isSelected('Alan')).toBe(true);
    expect(isSelected('Grace')).toBe(false);
  });

  it('follows a controlled model and exposes it through the api', () => {
    const { api } = renderWithApi({ cellSelection: true, cellSelectionModel: { 3: { name: true } } });

    expect(isSelected('Grace')).toBe(true);
    expect(api().isCellSelected(3, 'name')).toBe(true);
    expect(api().isCellSelected(3, 'age')).toBe(false);
    expect(api().getSelectedCellsAsArray()).toEqual([{ id: 3, field: 'name' }]);
  });

  it('sets the selection through the api', () => {
    const { api } = renderWithApi({ cellSelection: true });

    act(() => api().setCellSelectionModel({ 2: { team: true } }));
    expect(api().getSelectedCellsAsArray()).toEqual([{ id: 2, field: 'team' }]);
  });

  it('leaves cells alone when cellSelection is off', () => {
    render(<DataGrid rows={people} columns={columns} />);

    fireEvent.mouseDown(cell('Ada'));
    expect(cell('Ada').getAttribute('aria-selected')).toBeNull();
  });
});

describe('copy and paste', () => {
  it('copies the selected cells as tab separated text', () => {
    const onClipboardCopy = vi.fn();
    render(
      <DataGrid
        rows={people}
        columns={columns}
        cellSelection
        cellSelectionModel={{ 1: { name: true, age: true }, 2: { name: true, age: true } }}
        onClipboardCopy={onClipboardCopy}
      />,
    );

    fireEvent.keyDown(cell('Ada'), { key: 'c', ctrlKey: true });
    expect(onClipboardCopy).toHaveBeenCalledWith('Ada\t36\r\nAlan\t41');
  });

  it('pastes a block starting at the focused cell', async () => {
    const onPaste = vi.fn();
    render(<DataGrid rows={people} columns={columns} onClipboardPaste={onPaste} />);

    fireEvent.click(cell('Alan'));
    fireEvent.paste(cell('Alan'), { clipboardData: { getData: () => 'Alicia\t50\nGreta\t51' } });

    await waitFor(() => expect(screen.getByRole('gridcell', { name: 'Alicia' })).toBeTruthy());
    expect(onPaste).toHaveBeenCalledWith('Alicia\t50\nGreta\t51');
    expect(screen.getByRole('gridcell', { name: '50' })).toBeTruthy();
    expect(screen.getByRole('gridcell', { name: 'Greta' })).toBeTruthy();
    expect(screen.getByRole('gridcell', { name: '51' })).toBeTruthy();
    expect(screen.getByRole('gridcell', { name: 'Ada' })).toBeTruthy();
  });

  it('starts the paste at the top left of the selection', async () => {
    render(<DataGrid rows={people} columns={columns} cellSelection cellSelectionModel={{ 3: { name: true } }} />);

    paste('Zed');

    await waitFor(() => expect(screen.getByRole('gridcell', { name: 'Zed' })).toBeTruthy());
    expect(screen.getByRole('gridcell', { name: 'Ada' })).toBeTruthy();
    expect(screen.queryByRole('gridcell', { name: 'Grace' })).toBeNull();
  });

  it('fills every selected cell with one pasted value', async () => {
    render(
      <DataGrid
        rows={people}
        columns={columns}
        cellSelection
        cellSelectionModel={{ 1: { name: true }, 2: { name: true }, 3: { name: true } }}
      />,
    );

    paste('Same');

    await waitFor(() => expect(screen.getAllByRole('gridcell', { name: 'Same' })).toHaveLength(3));
    expect(screen.getByRole('gridcell', { name: 'Linus' })).toBeTruthy();
  });

  it('skips cells that are not editable or do not fit the column', async () => {
    const processRowUpdate = vi.fn((row: Person) => row);
    render(<DataGrid rows={people} columns={columns} processRowUpdate={processRowUpdate} />);

    fireEvent.click(cell('Ada'));
    // Age gets text that is no number, team is a valid option, and the read-only active column is ignored.
    fireEvent.paste(cell('Ada'), { clipboardData: { getData: () => 'Ann\tabc\tblue\tfalse' } });

    await waitFor(() => expect(screen.getByRole('gridcell', { name: 'Ann' })).toBeTruthy());
    expect(processRowUpdate).toHaveBeenCalledTimes(1);
    expect(processRowUpdate.mock.calls[0]?.[0]).toMatchObject({ id: 1, name: 'Ann', age: 36, team: 'blue', active: true });
  });

  it('does nothing when disabled', () => {
    const onPaste = vi.fn();
    render(<DataGrid rows={people} columns={columns} disableClipboardPaste onClipboardPaste={onPaste} />);

    fireEvent.click(cell('Ada'));
    paste('Nope');

    expect(onPaste).not.toHaveBeenCalled();
    expect(screen.queryByRole('gridcell', { name: 'Nope' })).toBeNull();
  });

  it('leaves the paste to a text editor that is open', () => {
    const onPaste = vi.fn();
    render(<DataGrid rows={people} columns={columns} onClipboardPaste={onPaste} />);

    fireEvent.doubleClick(cell('Ada'));
    fireEvent.paste(screen.getByRole('textbox', { name: 'Name' }), { clipboardData: { getData: () => 'typed' } });

    expect(onPaste).not.toHaveBeenCalled();
  });
});
