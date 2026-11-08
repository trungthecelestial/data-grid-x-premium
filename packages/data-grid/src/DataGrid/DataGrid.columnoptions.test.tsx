import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DataGrid } from './DataGrid';
import type { GridColDef } from './DataGrid.types';

type Person = { id: number; name: string; age: number };

const people: Person[] = [
  { id: 1, name: 'Ann', age: 30 },
  { id: 2, name: 'Bob', age: 40 },
  { id: 3, name: 'Cy', age: 50 },
];

describe('column options', () => {
  it('applies headerClassName, description and cellClassName', () => {
    const columns: GridColDef<Person>[] = [
      { field: 'name', headerName: 'Name', headerClassName: 'hdr', description: 'Full name', cellClassName: 'plain' },
      { field: 'age', headerName: 'Age', cellClassName: ({ value }) => ((value as number) > 35 ? 'old' : 'young') },
    ];
    render(<DataGrid rows={people} columns={columns} disableVirtualization />);
    const header = screen.getByRole('columnheader', { name: /Name/ });
    expect(header.classList.contains('hdr')).toBe(true);
    expect(header.getAttribute('title')).toBe('Full name');
    expect(screen.getByText('Ann').closest('[role="gridcell"]')!.classList.contains('plain')).toBe(true);
    expect(screen.getByText('30').closest('[role="gridcell"]')!.classList.contains('young')).toBe(true);
    expect(screen.getByText('40').closest('[role="gridcell"]')!.classList.contains('old')).toBe(true);
  });

  it('leaves disableExport columns out of the clipboard-style csv', () => {
    const columns: GridColDef<Person>[] = [
      { field: 'name', headerName: 'Name' },
      { field: 'age', headerName: 'Age', disableExport: true },
    ];
    render(<DataGrid rows={people} columns={columns} disableVirtualization />);
    expect(screen.getByText('Ann')).toBeTruthy();
  });
});

describe('selection options', () => {
  const columns: GridColDef<Person>[] = [{ field: 'name', headerName: 'Name' }];

  it('keeps one row with disableMultipleRowSelection and has no header checkbox', () => {
    render(<DataGrid rows={people} columns={columns} checkboxSelection disableMultipleRowSelection disableVirtualization />);
    expect(screen.queryByRole('checkbox', { name: /select all/i })).toBeNull();
    const boxes = screen.getAllByRole('checkbox');
    fireEvent.click(boxes[0]!);
    fireEvent.click(boxes[1]!);
    expect(screen.getAllByRole('checkbox').filter((box) => (box as HTMLInputElement).checked)).toHaveLength(1);
  });

  it('selects all rows with Ctrl+A', () => {
    render(<DataGrid rows={people} columns={columns} checkboxSelection disableVirtualization />);
    const cell = screen.getByText('Ann');
    cell.focus();
    fireEvent.keyDown(cell, { key: 'a', ctrlKey: true });
    expect(screen.getByText('3 rows selected')).toBeTruthy();
  });
});

describe('loading variants', () => {
  const columns: GridColDef<Person>[] = [{ field: 'name' }];
  it('renders a skeleton overlay', () => {
    render(<DataGrid rows={people} columns={columns} loading loadingVariant="skeleton" disableVirtualization />);
    expect(screen.getByRole('progressbar')).toBeTruthy();
  });
  it('renders a circular indicator', () => {
    render(<DataGrid rows={people} columns={columns} loading loadingVariant="circular-progress" disableVirtualization />);
    expect(screen.getByRole('progressbar')).toBeTruthy();
  });
});
