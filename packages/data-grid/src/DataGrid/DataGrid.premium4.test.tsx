import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { describe, expect, it, vi } from 'vitest';
import { DataGrid, useGridApiRef } from './DataGrid';
import type { GridApi, GridColDef } from './DataGrid.types';
import { GridFilterPanel } from './components/GridFilterPanel';
import { deDE, frFR, getGridLocalization } from './locales';

type Person = { id: number; name: string; team: string; age: number };

const people: Person[] = [
  { id: 1, name: 'Ada', team: 'red', age: 36 },
  { id: 2, name: 'Bob', team: 'red', age: 40 },
  { id: 3, name: 'Cy', team: 'blue', age: 20 },
];

const columns: GridColDef<Person>[] = [
  { field: 'name', headerName: 'Name' },
  { field: 'team', headerName: 'Team' },
  { field: 'age', headerName: 'Age', type: 'number' },
];

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

describe('filter panel labels', () => {
  it('takes the delete, logic operator and multi-value texts from the locale', () => {
    render(
      <GridFilterPanel
        columns={columns}
        filterModel={{
          items: [
            { id: 1, field: 'team', operator: 'isAnyOf', value: [] },
            { id: 2, field: 'name', operator: 'contains', value: 'a' },
          ],
        }}
        onFilterModelChange={() => undefined}
        localeText={frFR}
      />,
    );
    expect(screen.getAllByRole('button', { name: 'Supprimer le filtre' })).toHaveLength(2);
    expect(screen.getByRole('combobox', { name: 'Opérateur logique' })).toBeTruthy();
    expect(screen.getByPlaceholderText('a, b, c')).toBeTruthy();
  });
});

describe('theme defaults', () => {
  it('reads the locale from the theme, and a grid can still override single texts', () => {
    render(
      <ThemeProvider theme={createTheme({}, getGridLocalization(deDE))}>
        <DataGrid rows={[]} columns={columns} showToolbar localeText={{ noRowsLabel: 'Leer' }} />
      </ThemeProvider>,
    );
    expect(screen.getByText('Leer')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Spalten' })).toBeTruthy();
  });

  it('applies other default props from the theme under the grid own', () => {
    render(
      <ThemeProvider theme={createTheme({ components: { MuiDataGrid: { defaultProps: { checkboxSelection: true, hideFooter: true } } } } as object)}>
        <DataGrid rows={people} columns={columns} hideFooter={false} />
      </ThemeProvider>,
    );
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0);
    expect(screen.getByText('1–3 of 3')).toBeTruthy();
  });
});

describe('keyboard moves across groups and tree levels', () => {
  const nameCells = (container: HTMLElement) =>
    [...container.querySelectorAll('[data-field="name"][role="gridcell"]')].map((cell) => cell.textContent).filter(Boolean);
  const handleOf = (name: string) =>
    within(
      screen.getAllByRole('gridcell', { name }).find((cell) => cell.getAttribute('data-field') === 'name')?.closest('[role="row"]') as HTMLElement,
    ).getByRole('button', { name: 'Reorder row' });

  it('moves a grouped row into the next group with Alt+Down at the end of its group', async () => {
    const { container } = render(
      <DataGrid rows={people} columns={columns} rowGroupingModel={['team']} defaultGroupingExpansionDepth={1} rowReordering disableVirtualization />,
    );
    // Groups sort by label, so blue comes first: Cy, then red: Ada, Bob.
    expect(nameCells(container)).toEqual(['Cy', 'Ada', 'Bob']);
    fireEvent.keyDown(handleOf('Cy'), { key: 'ArrowDown', altKey: true });
    await screen.findByText('red (3)');
    expect(nameCells(container)).toEqual(['Cy', 'Ada', 'Bob']);
    expect(screen.queryByText(/^blue/)).toBeNull();
  });

  it('moves a grouped row into the previous group with Alt+Up at the start of its group', async () => {
    const { container } = render(
      <DataGrid rows={people} columns={columns} rowGroupingModel={['team']} defaultGroupingExpansionDepth={1} rowReordering disableVirtualization />,
    );
    fireEvent.keyDown(handleOf('Ada'), { key: 'ArrowUp', altKey: true });
    await screen.findByText('blue (2)');
    // It joins the end of the group above.
    expect(nameCells(container)).toEqual(['Cy', 'Ada', 'Bob']);
    expect(screen.getByText('red (1)')).toBeTruthy();
  });

  const files = [
    { id: 1, path: ['a'] },
    { id: 2, path: ['a', 'x'] },
    { id: 3, path: ['b'] },
  ];
  const labels = () =>
    screen.getAllByRole('row').flatMap((row) => {
      const text = row.querySelector('[data-field="__tree_data_group__"]')?.textContent;
      return text ? [text] : [];
    });
  const treeHandle = (label: string) =>
    within(
      screen.getAllByRole('row').find((row) => row.querySelector('[data-field="__tree_data_group__"]')?.textContent === label) as HTMLElement,
    ).getByRole('button', { name: 'Reorder row' });

  it('indents and outdents a tree row with Alt+Shift+Arrow', async () => {
    const setTreeDataPath = vi.fn((path: string[], row: (typeof files)[number]) => ({ ...row, path }));
    const holder: { ref: { current: GridApi } | null } = { ref: null };
    function Harness() {
      const apiRef = useGridApiRef();
      holder.ref = apiRef;
      return (
      <DataGrid
        apiRef={apiRef}
        rows={files}
        columns={[{ field: 'id' }]}
        treeData
        getTreeDataPath={(row) => row.path}
        setTreeDataPath={setTreeDataPath}
        defaultGroupingExpansionDepth={-1}
        rowReordering
        disableVirtualization
      />
      );
    }
    render(<Harness />);
    const depthOf = (id: number) => (holder.ref as { current: GridApi }).current.getRowNode(id)?.depth;
    fireEvent.keyDown(treeHandle('b'), { key: 'ArrowRight', altKey: true, shiftKey: true });
    await waitFor(() => expect(depthOf(3)).toBe(1));
    expect(labels()).toEqual(['a', 'x', 'b']);
    expect(setTreeDataPath).toHaveBeenCalledWith(['a', 'b'], expect.objectContaining({ id: 3 }));

    fireEvent.keyDown(treeHandle('x'), { key: 'ArrowLeft', altKey: true, shiftKey: true });
    await waitFor(() => expect(depthOf(2)).toBe(0));
    expect(labels()).toEqual(['a', 'b', 'x']);
  });
});

describe('more api methods', () => {
  it('replaces rows and updates columns until the props change', () => {
    const { api } = renderWithApi();
    act(() => api().setRows([{ id: 9, name: 'Zoe', team: 'green', age: 1 }]));
    expect(screen.getByRole('gridcell', { name: 'Zoe' })).toBeTruthy();
    expect(screen.queryByRole('gridcell', { name: 'Ada' })).toBeNull();

    act(() => api().updateColumns([{ field: 'team', headerName: 'Squad' }, { field: 'extra', headerName: 'Extra', valueGetter: () => 'x' }]));
    expect(screen.getByRole('columnheader', { name: 'Squad' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Extra' })).toBeTruthy();
  });

  it('selects row and cell ranges', () => {
    const { api } = renderWithApi({ cellSelection: true });
    act(() => api().selectRowRange({ startId: 1, endId: 2 }));
    expect([...api().getSelectedRows().keys()]).toEqual([1, 2]);
    act(() => api().selectCellRange({ id: 1, field: 'name' }, { id: 2, field: 'team' }));
    expect(api().getSelectedCellsAsArray()).toEqual([
      { id: 1, field: 'name' },
      { id: 1, field: 'team' },
      { id: 2, field: 'name' },
      { id: 2, field: 'team' },
    ]);
  });

  it('answers about columns, elements, values and models', () => {
    const { api } = renderWithApi({ initialState: { pinnedColumns: { left: ['name'] } }, aggregationModel: { age: 'sum' } });
    expect(api().isColumnPinned('name')).toBe('left');
    expect(api().isColumnPinned('age')).toBe(false);
    expect(api().getColumnPosition('name')).toBe(0);
    expect(api().getColumnHeaderElement('team')?.textContent).toContain('Team');
    expect(api().getCellElement(2, 'name')?.textContent).toBe('Bob');
    expect(api().getRowElement(2)?.getAttribute('role')).toBe('row');
    expect(api().getRowValue(people[0] as Person, columns[2] as unknown as GridColDef)).toBe(36);
    expect(api().getRowFormattedValue(people[0] as Person, columns[2] as unknown as GridColDef)).toBe('36');
    expect(api().getLocaleText('noRowsLabel')).toBe('No rows');
    expect(api().getAggregationModel()).toEqual({ age: 'sum' });
    expect(api().isRowSelectable(1)).toBe(true);
    expect(api().getRootDimensions()).toMatchObject({ rowHeight: 52, columnHeaderHeight: 56 });
  });

  it('publishes events, opens detail panels and expands every group', () => {
    const onRowClick = vi.fn();
    const { api } = renderWithApi({
      onRowClick,
      rowGroupingModel: ['team'],
      getDetailPanelContent: ({ row }) => <span>Detail {row.name}</span>,
    });
    act(() => api().publishEvent('rowClick', { id: 1, row: people[0] as Person }, {}));
    expect(onRowClick).toHaveBeenCalledWith({ id: 1, row: people[0] }, {});

    act(() => api().setAllRowChildrenExpansion(true));
    expect(screen.getByRole('gridcell', { name: 'Ada' })).toBeTruthy();
    act(() => api().setExpandedDetailPanels([2]));
    expect(screen.getByText('Detail Bob')).toBeTruthy();
    act(() => api().setAllRowChildrenExpansion(false));
    expect(screen.queryByRole('gridcell', { name: 'Ada' })).toBeNull();
  });
});
