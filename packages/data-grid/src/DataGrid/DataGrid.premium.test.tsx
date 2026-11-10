import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataGrid, useGridApiRef } from './DataGrid';
import type { GridApi, GridColDef } from './DataGrid.types';
import { GridFilterPanel } from './components/GridFilterPanel';
import { DEFAULT_LOCALE_TEXT } from './localeText';
import { buildCsv } from './features/export';
import { parseClipboardText } from './features/clipboard';

type Person = { id: number; name: string; team: string; age: number };

const people: Person[] = [
  { id: 1, name: 'Ada', team: 'red', age: 36 },
  { id: 2, name: 'Bob', team: 'red', age: 40 },
  { id: 3, name: 'Cy', team: 'blue', age: 20 },
  { id: 4, name: 'Dee', team: 'blue', age: 30 },
];

const columns: GridColDef<Person>[] = [
  { field: 'name', headerName: 'Name', editable: true },
  { field: 'team', headerName: 'Team' },
  { field: 'age', headerName: 'Age', type: 'number', editable: true },
];

const cell = (name: string) => screen.getByRole('gridcell', { name });

function renderWithApi(props: Partial<React.ComponentProps<typeof DataGrid<Person>>> = {}) {
  const holder: { ref: { current: GridApi } | null } = { ref: null };
  function Harness() {
    const apiRef = useGridApiRef();
    holder.ref = apiRef;
    return <DataGrid rows={people} columns={columns} apiRef={apiRef} disableVirtualization {...props} />;
  }
  const view = render(<Harness />);
  return { ...view, api: () => (holder.ref as { current: GridApi }).current };
}

async function editName(from: string, to: string) {
  fireEvent.doubleClick(cell(from));
  const input = screen.getByRole('textbox', { name: 'Name' });
  fireEvent.change(input, { target: { value: to } });
  fireEvent.keyDown(input, { key: 'Enter' });
  // The open editor already gives the cell the new name, so wait for the editor to close, which is when the edit is saved.
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull());
  await screen.findByRole('gridcell', { name: to });
}

describe('undo and redo', () => {
  it('undoes and redoes a cell edit through the api', async () => {
    const { api } = renderWithApi();
    expect(api().history.canUndo()).toBe(false);

    await editName('Ada', 'Ann');
    expect(api().history.canUndo()).toBe(true);

    await act(async () => {
      expect(await api().history.undo()).toBe(true);
    });
    expect(cell('Ada')).toBeTruthy();
    expect(api().history.canRedo()).toBe(true);

    await act(async () => {
      await api().history.redo();
    });
    expect(cell('Ann')).toBeTruthy();
  });

  it('undoes with Ctrl+Z and redoes with Ctrl+Shift+Z, passing the rows to processRowUpdate', async () => {
    const processRowUpdate = vi.fn((row: Person) => row);
    render(<DataGrid rows={people} columns={columns} processRowUpdate={processRowUpdate} disableVirtualization />);
    await editName('Ada', 'Ann');

    fireEvent.keyDown(cell('Ann'), { key: 'z', ctrlKey: true });
    await screen.findByRole('gridcell', { name: 'Ada' });
    expect(processRowUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Ada' }), expect.objectContaining({ name: 'Ann' }));

    fireEvent.keyDown(cell('Ada'), { key: 'Z', ctrlKey: true, shiftKey: true });
    await screen.findByRole('gridcell', { name: 'Ann' });
  });

  it('undoes a whole paste in one step', async () => {
    renderWithApi();
    fireEvent.click(cell('Ada'));
    fireEvent.paste(cell('Ada'), { clipboardData: { getData: () => 'Ann\nBea' } });
    await screen.findByRole('gridcell', { name: 'Bea' });

    fireEvent.keyDown(cell('Ann'), { key: 'z', metaKey: true });
    await screen.findByRole('gridcell', { name: 'Bob' });
    expect(cell('Ada')).toBeTruthy();
  });

  it('offers toolbar buttons that follow the stacks', async () => {
    render(<DataGrid rows={people} columns={columns} showToolbar disableVirtualization />);
    const undo = screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement;
    expect(undo.disabled).toBe(true);

    await editName('Ada', 'Ann');
    expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await screen.findByRole('gridcell', { name: 'Ada' });
    expect((screen.getByRole('button', { name: 'Redo' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('drops the history when the rows no longer match it', async () => {
    function Harness({ apiHolder }: { apiHolder: { ref: { current: GridApi } | null } }) {
      const apiRef = useGridApiRef();
      apiHolder.ref = apiRef;
      const [rows, setRows] = useState(people);
      return (
        <>
          <button type="button" onClick={() => setRows(rows.map((row) => (row.id === 1 ? { ...row, name: 'Zed' } : row)))}>
            replace
          </button>
          <DataGrid rows={rows} columns={columns} apiRef={apiRef} disableVirtualization />
        </>
      );
    }
    const holder: { ref: { current: GridApi } | null } = { ref: null };
    const api = () => (holder.ref as { current: GridApi }).current;
    render(<Harness apiHolder={holder} />);
    await editName('Ada', 'Ann');
    fireEvent.click(screen.getByRole('button', { name: 'replace' }));
    expect(cell('Zed')).toBeTruthy();

    await act(async () => {
      expect(await api().history.undo()).toBe(false);
    });
    expect(cell('Zed')).toBeTruthy();
    expect(api().history.canUndo()).toBe(false);
  });

  it('keeps no history with a stack size of 0', async () => {
    const { api } = renderWithApi({ historyStackSize: 0, showToolbar: true });
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    await editName('Ada', 'Ann');
    expect(api().history.canUndo()).toBe(false);
  });
});

describe('aggregation options', () => {
  it('aggregates every row with the "all" scope', () => {
    render(
      <DataGrid
        rows={people}
        columns={columns}
        aggregationModel={{ age: 'sum' }}
        aggregationRowsScope="all"
        filterModel={{ items: [{ field: 'team', operator: 'equals', value: 'red' }] }}
      />,
    );
    expect(screen.queryByRole('gridcell', { name: 'Cy' })).toBeNull();
    expect(screen.getByText('126')).toBeTruthy();
  });

  it('aggregates only the filtered rows by default', () => {
    render(
      <DataGrid
        rows={people}
        columns={columns}
        aggregationModel={{ age: 'sum' }}
        filterModel={{ items: [{ field: 'team', operator: 'equals', value: 'red' }] }}
      />,
    );
    expect(screen.getByText('76')).toBeTruthy();
  });

  it('puts group aggregates in a footer row and hides the grand total', () => {
    const { container } = render(
      <DataGrid
        rows={people}
        columns={columns}
        rowGroupingModel={['team']}
        aggregationModel={{ age: 'sum' }}
        defaultGroupingExpansionDepth={1}
        getAggregationPosition={(node) => (node.depth === -1 ? null : 'footer')}
        disableVirtualization
      />,
    );
    expect(screen.queryByText('76 (sum)')).toBeNull();
    expect(container.querySelectorAll('[data-group-footer]')).toHaveLength(2);
    const redFooter = container.querySelector('[data-group-footer$="team:red"]') as HTMLElement;
    expect(within(redFooter).getByText('red total')).toBeTruthy();
    expect(within(redFooter).getByText('76')).toBeTruthy();
    // The footer follows the group's last row.
    const rows = [...container.querySelectorAll('tbody [role="row"]')];
    expect(rows.indexOf(redFooter)).toBe(rows.findIndex((row) => row.textContent?.includes('Bob')) + 1);
    expect(screen.queryByText('126')).toBeNull();
  });
});

describe('grouping options', () => {
  it('gives each grouped field its own column in "multiple" mode', () => {
    render(
      <DataGrid
        rows={people}
        columns={columns}
        rowGroupingModel={['team', 'age']}
        rowGroupingColumnMode="multiple"
        defaultGroupingExpansionDepth={1}
        disableVirtualization
      />,
    );
    expect(screen.getByRole('columnheader', { name: /^Team/ })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /^Age/ })).toBeTruthy();
    const redRow = screen.getByText('red (2)').closest('[role="row"]') as HTMLElement;
    const ageGroupRow = screen.getByText('36 (1)').closest('[role="row"]') as HTMLElement;
    expect(redRow).not.toBe(ageGroupRow);
    // The age group shows in the second grouping column, not under the team one.
    const ageCells = within(ageGroupRow).getAllByRole('gridcell');
    expect(ageCells[0]?.textContent).toBe('');
    expect(ageCells[1]?.textContent).toBe('36 (1)');
  });

  it('expands groups chosen by isGroupExpandedByDefault', () => {
    render(
      <DataGrid
        rows={people}
        columns={columns}
        rowGroupingModel={['team']}
        isGroupExpandedByDefault={(node) => node.groupingKey === 'blue'}
        disableVirtualization
      />,
    );
    expect(screen.queryByRole('gridcell', { name: 'Ada' })).toBeNull();
    expect(cell('Cy')).toBeTruthy();
  });

  it('hides counts and shows a leaf field in the grouping column', () => {
    render(
      <DataGrid
        rows={people}
        columns={columns}
        rowGroupingModel={['team']}
        groupingColDef={{ hideDescendantCount: true, leafField: 'name' }}
        defaultGroupingExpansionDepth={1}
        disableVirtualization
      />,
    );
    expect(screen.getByText('red')).toBeTruthy();
    expect(screen.queryByText('red (2)')).toBeNull();
    expect(screen.getAllByText('Ada')).toHaveLength(2);
  });

  const files = [
    { id: 1, path: ['b'], size: 2 },
    { id: 2, path: ['b', 'z'], size: 1 },
    { id: 3, path: ['b', 'a'], size: 9 },
    { id: 4, path: ['a'], size: 5 },
  ];
  const fileColumns: GridColDef<(typeof files)[number]>[] = [{ field: 'size', headerName: 'Size', type: 'number' }];
  const treeLabels = () => screen.getAllByRole('row').flatMap((row) => {
    const text = row.querySelector('[data-field="__tree_data_group__"]')?.textContent;
    return text ? [text] : [];
  });

  it('keeps every child of a matching row with disableChildrenFiltering', () => {
    render(
      <DataGrid
        rows={files}
        columns={fileColumns}
        treeData
        getTreeDataPath={(row) => row.path}
        defaultGroupingExpansionDepth={-1}
        disableChildrenFiltering
        filterModel={{ items: [{ field: 'size', operator: '=', value: 2 }] }}
        disableVirtualization
      />,
    );
    expect(treeLabels()).toEqual(['b', 'z', 'a']);
  });

  it('sorts only the top level with disableChildrenSorting', () => {
    render(
      <DataGrid
        rows={files}
        columns={fileColumns}
        treeData
        getTreeDataPath={(row) => row.path}
        defaultGroupingExpansionDepth={-1}
        disableChildrenSorting
        sortModel={[{ field: 'size', sort: 'desc' }]}
        disableVirtualization
      />,
    );
    expect(treeLabels()).toEqual(['a', 'b', 'z', 'a']);
  });
});

describe('sorting, filtering and pagination options', () => {
  it('adds columns to the sort on any click with multipleColumnsSortingMode "always"', () => {
    const onSortModelChange = vi.fn();
    render(<DataGrid rows={people} columns={columns} multipleColumnsSortingMode="always" onSortModelChange={onSortModelChange} />);
    fireEvent.click(screen.getByRole('columnheader', { name: 'Team' }));
    fireEvent.click(screen.getByRole('columnheader', { name: /^Age/ }));
    expect(onSortModelChange).toHaveBeenLastCalledWith([
      { field: 'team', sort: 'asc' },
      { field: 'age', sort: 'asc' },
    ]);
  });

  it('adds to the sort with Ctrl/Cmd+click', () => {
    const onSortModelChange = vi.fn();
    render(<DataGrid rows={people} columns={columns} onSortModelChange={onSortModelChange} />);
    fireEvent.click(screen.getByRole('columnheader', { name: 'Team' }));
    fireEvent.click(screen.getByRole('columnheader', { name: /^Age/ }), { metaKey: true });
    expect(onSortModelChange).toHaveBeenLastCalledWith([
      { field: 'team', sort: 'asc' },
      { field: 'age', sort: 'asc' },
    ]);
  });

  it('matches text regardless of accents with ignoreDiacritics', () => {
    const rows = [
      { id: 1, name: 'Café' },
      { id: 2, name: 'Tea' },
    ];
    const { rerender } = render(
      <DataGrid rows={rows} columns={[{ field: 'name' }]} filterModel={{ items: [], quickFilterValues: ['cafe'] }} />,
    );
    expect(screen.queryByRole('gridcell', { name: 'Café' })).toBeNull();
    rerender(<DataGrid rows={rows} columns={[{ field: 'name' }]} filterModel={{ items: [], quickFilterValues: ['cafe'] }} ignoreDiacritics />);
    expect(cell('Café')).toBeTruthy();
    rerender(
      <DataGrid
        rows={rows}
        columns={[{ field: 'name' }]}
        filterModel={{ items: [{ field: 'name', operator: 'equals', value: 'CAFE' }] }}
        ignoreDiacritics
      />,
    );
    expect(cell('Café')).toBeTruthy();
    expect(screen.queryByRole('gridcell', { name: 'Tea' })).toBeNull();
  });

  describe('filterDebounceMs', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('filters the rows once the debounce time passed', () => {
      vi.useFakeTimers();
      const { rerender } = render(<DataGrid rows={people} columns={columns} filterDebounceMs={300} filterModel={{ items: [] }} />);
      rerender(
        <DataGrid rows={people} columns={columns} filterDebounceMs={300} filterModel={{ items: [], quickFilterValues: ['Ada'] }} />,
      );
      expect(cell('Bob')).toBeTruthy();
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(screen.queryByRole('gridcell', { name: 'Bob' })).toBeNull();
      expect(cell('Ada')).toBeTruthy();
    });
  });

  it('replaces the filter from a header filter with disableMultipleColumnsFiltering', () => {
    const onFilterModelChange = vi.fn();
    render(
      <DataGrid
        rows={people}
        columns={columns}
        headerFilters
        disableMultipleColumnsFiltering
        filterModel={{ items: [{ id: 1, field: 'team', operator: 'contains', value: 'red' }] }}
        onFilterModelChange={onFilterModelChange}
      />,
    );
    // The first header filter belongs to the Name column.
    const nameInput = within(screen.getByRole('grid')).getAllByRole('textbox', { name: 'Value' })[0] as HTMLElement;
    fireEvent.change(nameInput, { target: { value: 'A' } });
    expect(onFilterModelChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ items: [expect.objectContaining({ field: 'name', value: 'A' })] }),
    );
  });

  it('hides "Add filter" once a filter exists when the panel allows one', () => {
    render(
      <GridFilterPanel
        columns={columns}
        filterModel={{ items: [{ id: 1, field: 'team', operator: 'contains', value: 'red' }] }}
        onFilterModelChange={() => undefined}
        localeText={DEFAULT_LOCALE_TEXT}
        disableMultipleFilters
      />,
    );
    expect(screen.queryByRole('button', { name: 'Add filter' })).toBeNull();
  });

  it('sets the page size to the rows that fit with autoPageSize', async () => {
    const clientHeight = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(56 + 52 * 2 + 10);
    const clientWidth = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(600);
    const original = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    try {
      const onPaginationModelChange = vi.fn();
      render(<DataGrid rows={people} columns={columns} autoPageSize onPaginationModelChange={onPaginationModelChange} />);
      await waitFor(() => expect(onPaginationModelChange).toHaveBeenCalledWith({ page: 0, pageSize: 2 }));
      expect(screen.queryByRole('combobox')).toBeNull();
      expect(screen.queryByRole('gridcell', { name: 'Cy' })).toBeNull();
    } finally {
      globalThis.ResizeObserver = original;
      clientHeight.mockRestore();
      clientWidth.mockRestore();
    }
  });
});

describe('clipboard and export options', () => {
  it('escapes text that starts like a formula, but not numbers', () => {
    const rows = [{ id: 1, name: '=SUM(A1)', age: -3 }];
    const exportColumns: GridColDef[] = [{ field: 'name' }, { field: 'age', type: 'number' }];
    expect(buildCsv(rows, exportColumns, { includeHeaders: false, escapeFormulas: true })).toBe("'=SUM(A1),-3");
    expect(buildCsv(rows, exportColumns, { includeHeaders: false })).toBe('=SUM(A1),-3');
  });

  it('escapes formulas in CSV exports unless turned off', () => {
    const rows = [{ id: 1, name: '+1', team: 'x', age: 1 }];
    const { api } = renderWithApi({ rows: rows as Person[] });
    expect(api().getDataAsCsv({ includeHeaders: false })).toBe("'+1,x,1");
    expect(api().getDataAsCsv({ includeHeaders: false, escapeFormulas: false })).toBe('+1,x,1');
  });

  it('parses pasted text with another delimiter', () => {
    expect(parseClipboardText('a;b\nc;d', ';')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('copies with clipboardCopyCellDelimiter and pastes through splitClipboardPastedText', async () => {
    const onClipboardCopy = vi.fn();
    const split = vi.fn((text: string) => [text.split('|')]);
    render(
      <DataGrid
        rows={people}
        columns={columns}
        rowSelectionModel={[1]}
        clipboardCopyCellDelimiter=";"
        splitClipboardPastedText={split}
        onClipboardCopy={onClipboardCopy}
        disableVirtualization
      />,
    );
    fireEvent.keyDown(cell('Ada'), { key: 'c', ctrlKey: true });
    expect(onClipboardCopy).toHaveBeenCalledWith('Ada;red;36');

    fireEvent.click(cell('Bob'));
    fireEvent.paste(cell('Bob'), { clipboardData: { getData: () => 'Bea|ignored|41' } });
    expect(split).toHaveBeenCalledWith('Bea|ignored|41', ';');
    await screen.findByRole('gridcell', { name: 'Bea' });
    expect(cell('41')).toBeTruthy();
  });
});

describe('list view', () => {
  it('renders each row as one cell and no column headers', () => {
    render(
      <DataGrid
        rows={people}
        columns={columns}
        listView
        listViewColumn={{ field: 'card', renderCell: ({ row }) => <div>{`${row.name} of ${row.team}`}</div> }}
        disableVirtualization
      />,
    );
    expect(screen.queryAllByRole('columnheader')).toHaveLength(0);
    expect(screen.getByText('Ada of red')).toBeTruthy();
    const firstRow = screen.getByText('Ada of red').closest('[role="row"]') as HTMLElement;
    expect(within(firstRow).getAllByRole('gridcell')).toHaveLength(1);
  });
});

describe('row reordering', () => {
  it('turns off the handle of rows that isRowReorderable rejects', () => {
    render(
      <DataGrid rows={people} columns={columns} rowReordering isRowReorderable={({ row }) => row.team === 'red'} disableVirtualization />,
    );
    const handles = screen.getAllByRole('button', { name: 'Reorder row' }) as HTMLButtonElement[];
    expect(handles.map((handle) => handle.disabled)).toEqual([false, false, true, true]);
  });
});
