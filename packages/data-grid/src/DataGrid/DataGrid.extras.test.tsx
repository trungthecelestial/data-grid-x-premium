import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataGrid, useGridApiRef } from './DataGrid';
import type { GridApi, GridColDef } from './DataGrid.types';
import { buildCsv } from './features/export';
import { computeAutosizeWidths } from './features/autosize';

type Person = { id: number; name: string; age: number; team: string };

const people: Person[] = [
  { id: 1, name: 'Ada', age: 36, team: 'red' },
  { id: 2, name: 'Alan', age: 41, team: 'blue' },
  { id: 3, name: 'Grace', age: 30, team: 'red' },
  { id: 4, name: 'Linus', age: 25, team: 'blue' },
];

const columns: GridColDef<Person>[] = [
  { field: 'name', headerName: 'Name', editable: true },
  { field: 'age', headerName: 'Age', type: 'number', editable: true },
  { field: 'team', headerName: 'Team' },
];

function renderWithApi(props: Partial<React.ComponentProps<typeof DataGrid<Person>>> = {}) {
  const holder: { ref: { current: GridApi } | null } = { ref: null };
  function Harness() {
    const apiRef = useGridApiRef();
    holder.ref = apiRef;
    return <DataGrid rows={people} columns={columns} apiRef={apiRef} {...props} />;
  }
  const view = render(<Harness />);
  // The api object is replaced on every render, so always read it through the ref.
  return { ...view, api: () => (holder.ref as { current: GridApi }).current };
}

describe('events', () => {
  it('reports row, cell and header clicks', () => {
    const onRowClick = vi.fn();
    const onCellClick = vi.fn();
    const onColumnHeaderClick = vi.fn();
    render(
      <DataGrid
        rows={people}
        columns={columns}
        onRowClick={onRowClick}
        onCellClick={onCellClick}
        onColumnHeaderClick={onColumnHeaderClick}
      />,
    );

    fireEvent.click(screen.getByRole('gridcell', { name: 'Ada' }));
    expect(onCellClick).toHaveBeenCalledWith(expect.objectContaining({ id: 1, field: 'name', value: 'Ada' }), expect.anything());
    expect(onRowClick).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), expect.anything());

    fireEvent.click(screen.getByRole('columnheader', { name: 'Age' }));
    expect(onColumnHeaderClick).toHaveBeenCalledWith(expect.objectContaining({ field: 'age' }), expect.anything());
  });

  it('reports double clicks', () => {
    const onRowDoubleClick = vi.fn();
    const onCellDoubleClick = vi.fn();
    render(<DataGrid rows={people} columns={columns} onRowDoubleClick={onRowDoubleClick} onCellDoubleClick={onCellDoubleClick} />);

    fireEvent.doubleClick(screen.getByRole('gridcell', { name: 'Alan' }));
    expect(onRowDoubleClick).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }), expect.anything());
    expect(onCellDoubleClick).toHaveBeenCalledWith(expect.objectContaining({ id: 2, field: 'name' }), expect.anything());
  });

  it('reports cell key presses', () => {
    const onCellKeyDown = vi.fn();
    render(<DataGrid rows={people} columns={columns} onCellKeyDown={onCellKeyDown} />);

    fireEvent.keyDown(screen.getByRole('gridcell', { name: 'Ada' }), { key: 'ArrowDown' });
    expect(onCellKeyDown).toHaveBeenCalledWith(expect.objectContaining({ id: 1, field: 'name' }), expect.objectContaining({ key: 'ArrowDown' }));
  });

  it('reports edit start and stop with a reason', async () => {
    const onCellEditStart = vi.fn();
    const onCellEditStop = vi.fn();
    render(<DataGrid rows={people} columns={columns} onCellEditStart={onCellEditStart} onCellEditStop={onCellEditStop} />);

    fireEvent.doubleClick(screen.getByRole('gridcell', { name: 'Ada' }));
    expect(onCellEditStart).toHaveBeenCalledWith({ id: 1, field: 'name' });

    const input = screen.getByRole('textbox', { name: 'Name' });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCellEditStop).toHaveBeenCalledWith({ id: 1, field: 'name', reason: 'escapeKeyDown' });
  });

  it('calls onRowsScrollEnd once per arrival at the bottom', () => {
    const onRowsScrollEnd = vi.fn();
    const { container } = render(<DataGrid rows={people} columns={columns} height={200} onRowsScrollEnd={onRowsScrollEnd} />);
    const scroller = container.querySelector('.MuiTableContainer-root') as HTMLElement;
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 200 });

    scroller.scrollTop = 100;
    fireEvent.scroll(scroller);
    expect(onRowsScrollEnd).not.toHaveBeenCalled();

    scroller.scrollTop = 790;
    fireEvent.scroll(scroller);
    fireEvent.scroll(scroller);
    expect(onRowsScrollEnd).toHaveBeenCalledTimes(1);
  });

  it('lets apiRef.subscribeEvent listen and unsubscribe', () => {
    const { api } = renderWithApi();
    const listener = vi.fn();
    const off = api().subscribeEvent('rowClick', listener);

    fireEvent.click(screen.getByRole('gridcell', { name: 'Ada' }));
    expect(listener).toHaveBeenCalledTimes(1);

    off();
    fireEvent.click(screen.getByRole('gridcell', { name: 'Alan' }));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('customisation', () => {
  it('adds row and cell class names', () => {
    render(
      <DataGrid
        rows={people}
        columns={columns}
        getRowClassName={({ row }) => (row.age > 35 ? 'senior' : 'junior')}
        getCellClassName={({ field }) => `cell-${field}`}
      />,
    );

    expect(screen.getByRole('gridcell', { name: 'Ada' }).closest('tr')?.className).toContain('senior');
    expect(screen.getByRole('gridcell', { name: 'Grace' }).closest('tr')?.className).toContain('junior');
    expect(screen.getByRole('gridcell', { name: 'Ada' }).className).toContain('cell-name');
  });

  it('uses getRowHeight per row', () => {
    render(<DataGrid rows={people} columns={columns} getRowHeight={({ row }) => (row.id === 1 ? 80 : null)} rowHeight={40} />);

    expect(getComputedStyle(screen.getByRole('gridcell', { name: 'Ada' }).closest('tr') as HTMLElement).height).toBe('80px');
    expect(getComputedStyle(screen.getByRole('gridcell', { name: 'Alan' }).closest('tr') as HTMLElement).height).toBe('40px');
  });

  it('blocks editing per cell with isCellEditable', () => {
    render(<DataGrid rows={people} columns={columns} isCellEditable={({ row }) => row.id !== 1} />);

    fireEvent.doubleClick(screen.getByRole('gridcell', { name: 'Ada' }));
    expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();

    fireEvent.doubleClick(screen.getByRole('gridcell', { name: 'Alan' }));
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeTruthy();
  });

  it('renders custom overlays and footer slots', () => {
    const { rerender } = render(
      <DataGrid rows={[]} columns={columns} slots={{ noRowsOverlay: () => <span>Nothing here</span> }} />,
    );
    expect(screen.getByText('Nothing here')).toBeTruthy();

    rerender(<DataGrid rows={people} columns={columns} loading slots={{ loadingOverlay: () => <span>Please wait</span> }} />);
    expect(screen.getByText('Please wait')).toBeTruthy();

    rerender(
      <DataGrid
        rows={people}
        columns={columns}
        slots={{ footer: ({ rowCount }) => <div>{`custom footer ${rowCount}`}</div> }}
      />,
    );
    expect(screen.getByText('custom footer 4')).toBeTruthy();
  });

  it('passes slotProps to the toolbar and hides its buttons', () => {
    render(
      <DataGrid
        rows={people}
        columns={columns}
        showToolbar
        disableColumnSelector
        disableDensitySelector
        slotProps={{ toolbar: { disableExport: true } }}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Columns' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Density' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull();
    expect(screen.getByRole('button', { name: /Filters/ })).toBeTruthy();
  });

  it('hides footer pieces', () => {
    render(
      <DataGrid
        rows={people}
        columns={columns}
        checkboxSelection
        hideFooterPagination
        hideFooterSelectedRowCount
        rowSelectionModel={[1]}
      />,
    );

    expect(screen.queryByText(/rows per page/i)).toBeNull();
    expect(screen.queryByText(/selected/i)).toBeNull();
  });

  it('drops selected ids that left the rows unless kept', () => {
    const onChange = vi.fn();
    const { rerender } = render(<DataGrid rows={people} columns={columns} rowSelectionModel={[1, 2]} onRowSelectionModelChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();

    rerender(<DataGrid rows={people.slice(2)} columns={columns} rowSelectionModel={[1, 2]} onRowSelectionModelChange={onChange} />);
    expect(onChange).toHaveBeenLastCalledWith([]);

    onChange.mockClear();
    rerender(
      <DataGrid
        rows={people.slice(2)}
        columns={columns}
        rowSelectionModel={[1, 2]}
        keepNonExistentRowsSelected
        onRowSelectionModelChange={onChange}
      />,
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('applies a column-level quick filter function', () => {
    const cols: GridColDef<Person>[] = [
      { field: 'name', headerName: 'Name' },
      { field: 'team', headerName: 'Team', getApplyQuickFilterFn: (value) => (cell) => cell === value },
    ];
    render(<DataGrid rows={people} columns={cols} filterModel={{ items: [], quickFilterValues: ['red'] }} />);

    expect(screen.getByRole('gridcell', { name: 'Ada' })).toBeTruthy();
    expect(screen.queryByRole('gridcell', { name: 'Alan' })).toBeNull();
  });
});

describe('apiRef', () => {
  it('reads rows and values', () => {
    const { api } = renderWithApi();

    expect(api().getRow(2)).toMatchObject({ name: 'Alan' });
    expect(api().getRow(99)).toBeNull();
    expect(api().getAllRowIds()).toEqual([1, 2, 3, 4]);
    expect(api().getRowsCount()).toBe(4);
    expect(api().getCellValue(3, 'name')).toBe('Grace');
    expect(api().getRowIndexRelativeToVisibleRows(3)).toBe(2);
  });

  it('adds, updates and deletes rows with updateRows', () => {
    const { api } = renderWithApi();

    act(() => api().updateRows([{ id: 1, name: 'Ada L.' }, { id: 5, name: 'Edsger', age: 72, team: 'blue' }, { id: 2, _action: 'delete' }]));

    expect(screen.getByRole('gridcell', { name: 'Ada L.' })).toBeTruthy();
    expect(screen.getByRole('gridcell', { name: 'Edsger' })).toBeTruthy();
    expect(screen.queryByRole('gridcell', { name: 'Alan' })).toBeNull();
    expect(api().getRowsCount()).toBe(4);
  });

  it('sets models and exports/restores state', () => {
    const { api } = renderWithApi();

    act(() => api().setSortModel([{ field: 'age', sort: 'asc' }]));
    expect(api().getAllRowIds()).toEqual([4, 3, 1, 2]);

    act(() => api().setColumnWidth('name', 222));
    act(() => api().setDensity('compact'));
    const state = api().exportState();
    expect(state.sorting?.sortModel).toEqual([{ field: 'age', sort: 'asc' }]);
    expect(state.columns?.dimensions?.name).toEqual({ width: 222 });
    expect(state.density).toBe('compact');

    act(() => api().restoreState({ sorting: { sortModel: [{ field: 'age', sort: 'desc' }] }, density: 'comfortable' }));
    expect(api().getSortModel()).toEqual([{ field: 'age', sort: 'desc' }]);
    expect(api().getDensity()).toBe('comfortable');
  });

  it('selects rows', () => {
    const { api } = renderWithApi();

    act(() => api().selectRows([1, 2]));
    expect(api().isRowSelected(1)).toBe(true);
    act(() => api().selectRow(3, true));
    expect(Array.from(api().getSelectedRows().keys()).sort()).toEqual([1, 2, 3]);
    act(() => api().selectRow(1, false));
    expect(api().isRowSelected(1)).toBe(false);
    act(() => api().selectRow(4, true, true));
    expect(Array.from(api().getSelectedRows().keys())).toEqual([4]);
  });

  it('moves and pins columns', () => {
    const { api } = renderWithApi();

    act(() => api().setColumnIndex('team', 0));
    expect(api().getVisibleColumns().map((column) => column.field)).toEqual(['team', 'name', 'age']);

    act(() => api().pinColumn('age', 'left'));
    expect(api().getPinnedColumns().left).toEqual(['age']);
    act(() => api().unpinColumn('age'));
    expect(api().getPinnedColumns().left).toEqual([]);
  });

  it('moves between pages', () => {
    const { api } = renderWithApi({ pageSizeOptions: [2, 4], initialState: { pagination: { paginationModel: { page: 0, pageSize: 2 } } } });

    expect(screen.queryByRole('gridcell', { name: 'Grace' })).toBeNull();
    act(() => api().setPage(1));
    expect(screen.getByRole('gridcell', { name: 'Grace' })).toBeTruthy();
  });

  it('exports CSV with chosen fields and rows', () => {
    const { api } = renderWithApi();

    expect(api().getDataAsCsv({ fields: ['team', 'name'], getRowsToExport: () => [3, 1] })).toBe('Team,Name\r\nred,Grace\r\nred,Ada');
    expect(api().getDataAsCsv({ utf8WithBom: true, includeHeaders: false, fields: ['name'], getRowsToExport: () => [1] })).toBe('﻿Ada');
  });
});

describe('clipboard', () => {
  it('copies the focused cell on Ctrl+C', () => {
    const onClipboardCopy = vi.fn();
    render(<DataGrid rows={people} columns={columns} onClipboardCopy={onClipboardCopy} />);

    fireEvent.keyDown(screen.getByRole('gridcell', { name: 'Ada' }), { key: 'c', ctrlKey: true });
    expect(onClipboardCopy).toHaveBeenCalledWith('Ada');
  });

  it('copies selected rows as tab separated text', () => {
    const onClipboardCopy = vi.fn();
    render(<DataGrid rows={people} columns={columns} rowSelectionModel={[1, 3]} onClipboardCopy={onClipboardCopy} />);

    fireEvent.keyDown(screen.getByRole('gridcell', { name: 'Ada' }), { key: 'c', ctrlKey: true });
    expect(onClipboardCopy).toHaveBeenCalledWith('Ada\t36\tred\r\nGrace\t30\tred');
  });

  it('does nothing when disabled', () => {
    const onClipboardCopy = vi.fn();
    render(<DataGrid rows={people} columns={columns} disableClipboardCopy onClipboardCopy={onClipboardCopy} />);

    fireEvent.keyDown(screen.getByRole('gridcell', { name: 'Ada' }), { key: 'c', ctrlKey: true });
    expect(onClipboardCopy).not.toHaveBeenCalled();
  });
});

describe('autosize and export helpers', () => {
  it('sizes a column to its widest value within min and max', () => {
    const widths = computeAutosizeWidths({
      columns: [
        { field: 'name', headerName: 'Name' },
        { field: 'team', headerName: 'Team', maxWidth: 70 },
      ],
      rows: [{ name: 'Ada', team: 'a very long team name' }, { name: 'Alexandria', team: 'x' }],
      font: '14px sans-serif',
      includeHeaders: false,
      extraWidth: 0,
      maxRows: 1000,
    });

    // Without a canvas the width is 8px per character plus padding.
    expect(widths.name).toBe('Alexandria'.length * 8 + 24);
    expect(widths.team).toBe(70);
  });

  it('adds a byte order mark and writes raw values on request', () => {
    const cols: GridColDef<Person>[] = [{ field: 'age', headerName: 'Age', valueFormatter: (value) => `${value} yrs` }];

    expect(buildCsv(people.slice(0, 1), cols, { includeHeaders: false })).toBe('36 yrs');
    expect(buildCsv(people.slice(0, 1), cols, { includeHeaders: false, raw: true, utf8WithBom: true })).toBe('﻿36');
  });

  it('autosizes through the api and reports widths', () => {
    const onColumnAutosize = vi.fn();
    const { api } = renderWithApi({ onColumnAutosize });

    act(() => api().autosizeColumns({ columns: ['name'] }));
    // The header (4 chars x 8px + 56px of sort and menu room) is wider than any value.
    expect(onColumnAutosize).toHaveBeenCalledWith({ name: 88 });
  });
});
