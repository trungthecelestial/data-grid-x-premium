import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DataGrid } from './DataGrid';
import type { GridCellModesModel, GridColDef, GridRowModesModel } from './DataGrid.types';

type Person = { id: number; name: string; team: string; age: number };

const people: Person[] = [
  { id: 1, name: 'Ada', team: 'red', age: 36 },
  { id: 2, name: 'Bob', team: 'red', age: 40 },
  { id: 3, name: 'Cy', team: 'blue', age: 40 },
];

const baseColumns: GridColDef<Person>[] = [
  { field: 'name', headerName: 'Name', editable: true },
  { field: 'team', headerName: 'Team' },
  { field: 'age', headerName: 'Age', type: 'number' },
];

const cell = (name: string) => screen.getByRole('gridcell', { name });

describe('edit validation', () => {
  const columns: GridColDef<Person>[] = [
    {
      field: 'name',
      headerName: 'Name',
      editable: true,
      preProcessEditCellProps: ({ props }) => ({ ...props, error: String(props.value).length < 3 }),
    },
  ];

  it('keeps the editor open while the value is invalid and saves once it is valid', () => {
    const processRowUpdate = vi.fn((row: Person) => row);
    render(<DataGrid rows={people} columns={columns} processRowUpdate={processRowUpdate} disableVirtualization />);

    fireEvent.doubleClick(cell('Ada'));
    const input = screen.getByRole('textbox', { name: 'Name' });
    fireEvent.change(input, { target: { value: 'Al' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(processRowUpdate).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeTruthy();

    fireEvent.change(input, { target: { value: 'Alan' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    return waitFor(() => expect(processRowUpdate).toHaveBeenCalledTimes(1));
  });

  it('supports async validators and Escape still cancels an invalid edit', async () => {
    const asyncColumns: GridColDef<Person>[] = [
      { field: 'name', editable: true, preProcessEditCellProps: async ({ props }) => ({ ...props, error: props.value === 'bad' }) },
    ];
    render(<DataGrid rows={people} columns={asyncColumns} disableVirtualization />);

    fireEvent.doubleClick(cell('Ada'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'bad' } });
    await waitFor(() => expect(input.getAttribute('aria-invalid')).toBe('true'));
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('textbox')).toBeTruthy();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('controlled edit modes', () => {
  it('starts and stops a row edit from rowModesModel and reports user edits', () => {
    const onChange = vi.fn();
    function Harness() {
      const [model, setModel] = useState<GridRowModesModel>({});
      return (
        <>
          <button onClick={() => setModel({ 2: { mode: 'edit' } })}>edit</button>
          <button onClick={() => setModel({ 2: { mode: 'view', ignoreModifications: true } })}>cancel</button>
          <DataGrid
            rows={people}
            columns={baseColumns}
            editMode="row"
            rowModesModel={model}
            onRowModesModelChange={(next) => {
              onChange(next);
              setModel(next);
            }}
            disableVirtualization
          />
        </>
      );
    }
    render(<Harness />);

    fireEvent.click(screen.getByText('edit'));
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeTruthy();
    fireEvent.click(screen.getByText('cancel'));
    expect(screen.queryByRole('textbox')).toBeNull();

    fireEvent.doubleClick(cell('Ada'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ 1: { mode: 'edit' } }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Name' }), { key: 'Escape' });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ 1: { mode: 'view' } }));
  });

  it('starts a cell edit from cellModesModel', () => {
    function Harness() {
      const [model, setModel] = useState<GridCellModesModel>({});
      return (
        <>
          <button onClick={() => setModel({ 3: { name: { mode: 'edit' } } })}>edit</button>
          <DataGrid rows={people} columns={baseColumns} cellModesModel={model} onCellModesModelChange={setModel} disableVirtualization />
        </>
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByText('edit'));
    expect((screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe('Cy');
  });
});

describe('column spanning', () => {
  it('merges a cell with the next columns and skips them', () => {
    const columns: GridColDef<Person>[] = [
      { field: 'name', headerName: 'Name', width: 100, colSpan: (_value, row) => (row.id === 1 ? 2 : 1) },
      { field: 'team', headerName: 'Team', width: 100 },
      { field: 'age', headerName: 'Age', width: 100 },
    ];
    render(<DataGrid rows={people} columns={columns} disableVirtualization />);

    const ada = cell('Ada');
    expect(ada.getAttribute('aria-colspan')).toBe('2');
    expect(getComputedStyle(ada).width).toBe('200px');
    // The covered "red" cell of row 1 is gone, row 2 keeps its own.
    expect(screen.getAllByRole('gridcell', { name: 'red' })).toHaveLength(1);
    expect(cell('Bob').getAttribute('aria-colspan')).toBeNull();
  });
});

describe('row spanning', () => {
  it('merges equal values in consecutive rows', () => {
    render(<DataGrid rows={people} columns={baseColumns} rowSpanning disableVirtualization />);

    const red = screen.getAllByRole('gridcell', { name: 'red' });
    expect(red).toHaveLength(1);
    expect(red[0]?.getAttribute('aria-rowspan')).toBe('2');
    // 40 appears in rows 2 and 3 and merges too, while the unique values stay single.
    expect(screen.getAllByRole('gridcell', { name: '40' })[0]?.getAttribute('aria-rowspan')).toBe('2');
    expect(cell('Ada').getAttribute('aria-rowspan')).toBeNull();
  });
});
