import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { describe, expect, it, vi } from 'vitest';
import { DataGrid, useGridApiRef } from './DataGrid';
import type { GridApi, GridColDef, GridDataSource, GridDataSourceGetRowsParams } from './DataGrid.types';
import { buildServerPivotLayout } from './features/pivot';
import { GRID_AGGREGATION_FUNCTIONS } from './features/aggregation';
import { arSD, deDE, esES, frFR, jaJP, ptBR, zhCN } from './locales';
import { DEFAULT_LOCALE_TEXT } from './localeText';

type Person = { id: number; name: string; team: string; age: number };

const people: Person[] = [
  { id: 1, name: 'Ada', team: 'red', age: 36 },
  { id: 2, name: 'Bob', team: 'red', age: 40 },
  { id: 3, name: 'Cy', team: 'blue', age: 20 },
];

const columns: GridColDef<Person>[] = [
  { field: 'name', headerName: 'Name', editable: true },
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

describe('server-side pivoting', () => {
  type Sale = { id: string; region?: string; year?: number; amount?: number; key?: string; count?: number; [field: string]: unknown };
  const sales: Sale[] = [
    { id: 's1', region: 'North', year: 2023, amount: 10 },
    { id: 's2', region: 'North', year: 2024, amount: 20 },
    { id: 's3', region: 'South', year: 2024, amount: 5 },
  ];
  const saleColumns: GridColDef<Sale>[] = [
    { field: 'region', headerName: 'Region' },
    { field: 'year', headerName: 'Year', type: 'number' },
    { field: 'amount', headerName: 'Amount', type: 'number' },
  ];

  // A tiny pivoting server: one group row per region, with a sum per year in `<year>>->amount`.
  const getRows = vi.fn(async (params: GridDataSourceGetRowsParams) => {
    const model = params.pivotModel;
    if (!model) {
      return { rows: sales, rowCount: sales.length };
    }
    const years = [...new Set(sales.map((sale) => String(sale.year)))].sort();
    const sumFor = (rows: Sale[]) =>
      Object.fromEntries(years.map((year) => [`${year}>->amount`, rows.filter((row) => String(row.year) === year).reduce((total, row) => total + (row.amount ?? 0), 0)]));
    const groups = ['North', 'South'].map((region) => ({ id: `g-${region}`, key: region, count: 0, ...sumFor(sales.filter((sale) => sale.region === region)) }));
    return { rows: groups, rowCount: groups.length, pivotColumns: years.map((key) => ({ key })), aggregateRow: { id: 'total', ...sumFor(sales) } };
  });
  const source: GridDataSource<Sale> = {
    getRows,
    getGroupKey: (row) => row.key as string,
    getChildrenCount: (row) => row.count ?? 0,
    supportsPivoting: true,
  };

  it('sends the pivot model and shows the columns and totals the server returns', async () => {
    render(
      <DataGrid
        rows={[]}
        columns={saleColumns}
        dataSource={source}
        pivotActive
        pivotModel={{ rows: [{ field: 'region' }], columns: [{ field: 'year' }], values: [{ field: 'amount', aggFunc: 'sum' }] }}
        disableVirtualization
      />,
    );
    await screen.findByText('North');
    expect(getRows.mock.lastCall?.[0]).toMatchObject({
      groupFields: ['region'],
      pivotModel: { rows: [{ field: 'region' }], columns: [{ field: 'year' }] },
    });
    expect(screen.getByRole('columnheader', { name: '2023' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '2024' })).toBeTruthy();
    const north = screen.getByText('North').closest('[role="row"]') as HTMLElement;
    expect(within(north).getByText('20 (sum)')).toBeTruthy();
    // The footer reads the totals from the aggregate row.
    expect(screen.getByText('25')).toBeTruthy();
  });

  it('builds generated columns with the field naming the server uses', () => {
    const layout = buildServerPivotLayout({
      model: { rows: [], columns: [{ field: 'year' }], values: [{ field: 'amount', aggFunc: 'sum' }] },
      columns: new Map(saleColumns.map((column) => [column.field, column as unknown as GridColDef])),
      pivotColumns: [{ key: '2023', label: 'FY23' }],
      functions: GRID_AGGREGATION_FUNCTIONS,
      getField: ({ columnPath, field }) => `${field}@${columnPath.join('|')}`,
    });
    expect(layout.columns.map((column) => column.field)).toEqual(['amount@2023']);
    expect(layout.aggregationModel).toEqual({ 'amount@2023': 'sum' });
    expect(layout.columnGroupingModel).toEqual([{ groupId: 'pivot-group:["2023"]', headerName: 'FY23', children: [{ field: 'amount@2023' }] }]);
  });

  it('leaves pivoting out without supportsPivoting', async () => {
    render(<DataGrid rows={[]} columns={saleColumns} dataSource={{ getRows: async () => ({ rows: sales, rowCount: 3 }) }} showToolbar />);
    await screen.findAllByText('North');
    expect(screen.queryByRole('button', { name: 'Pivot' })).toBeNull();
  });
});

describe('moving rows to another group or parent', () => {
  it('drops a grouped row into another group, writing the group value through processRowUpdate', async () => {
    const processRowUpdate = vi.fn((row: Person) => row);
    const { container } = render(
      <DataGrid
        rows={people}
        columns={columns}
        rowGroupingModel={['team']}
        defaultGroupingExpansionDepth={1}
        rowReordering
        processRowUpdate={processRowUpdate}
        disableVirtualization
      />,
    );
    const transfer = { setData: () => undefined, setDragImage: () => undefined, effectAllowed: '', dropEffect: '' };
    const rowOf = (name: string) => screen.getAllByRole('gridcell', { name }).find((cell) => cell.getAttribute('data-field') === 'name')?.closest('[role="row"]') as HTMLElement;
    fireEvent.dragStart(within(rowOf('Cy')).getByRole('button', { name: 'Reorder row' }), { dataTransfer: transfer });
    fireEvent.dragOver(rowOf('Ada'), { dataTransfer: transfer, clientY: 0 });
    fireEvent.drop(rowOf('Ada'), { dataTransfer: transfer });

    await waitFor(() => expect(processRowUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 3, team: 'red' }), expect.objectContaining({ team: 'blue' })));
    await screen.findByText('red (3)');
    const names = [...container.querySelectorAll('[data-field="name"][role="gridcell"]')].map((cell) => cell.textContent).filter(Boolean);
    expect(names).toEqual(['Cy', 'Ada', 'Bob']);
  });

  it('moves a tree row and its children to another parent with setTreeDataPath', async () => {
    const files = [
      { id: 1, path: ['a'] },
      { id: 2, path: ['a', 'x'] },
      { id: 3, path: ['b'] },
      { id: 4, path: ['b', 'y'] },
      { id: 5, path: ['b', 'y', 'deep'] },
    ];
    render(
      <DataGrid
        rows={files}
        columns={[{ field: 'id' }]}
        treeData
        getTreeDataPath={(row) => row.path}
        setTreeDataPath={(path, row) => ({ ...row, path })}
        defaultGroupingExpansionDepth={-1}
        rowReordering
        disableVirtualization
      />,
    );
    const transfer = { setData: () => undefined, setDragImage: () => undefined, effectAllowed: '', dropEffect: '' };
    const rowOf = (label: string) =>
      screen.getAllByRole('row').find((row) => row.querySelector('[data-field="__tree_data_group__"]')?.textContent === label) as HTMLElement;
    fireEvent.dragStart(within(rowOf('y')).getByRole('button', { name: 'Reorder row' }), { dataTransfer: transfer });
    fireEvent.dragOver(rowOf('x'), { dataTransfer: transfer, clientY: 0 });
    fireEvent.drop(rowOf('x'), { dataTransfer: transfer });

    await waitFor(() => {
      const labels = screen.getAllByRole('row').flatMap((row) => {
        const text = row.querySelector('[data-field="__tree_data_group__"]')?.textContent;
        return text ? [text] : [];
      });
      expect(labels).toEqual(['a', 'y', 'deep', 'x', 'b']);
    });
  });
});

describe('column header keyboard navigation', () => {
  it('moves from the first row up to the headers, across them, and sorts with Enter', () => {
    const onSortModelChange = vi.fn();
    render(<DataGrid rows={people} columns={columns} onSortModelChange={onSortModelChange} disableVirtualization />);
    const ada = screen.getByRole('gridcell', { name: 'Ada' });
    ada.focus();
    fireEvent.keyDown(ada, { key: 'ArrowUp' });
    const nameHeader = screen.getByRole('columnheader', { name: 'Name' });
    expect(document.activeElement).toBe(nameHeader);
    expect(nameHeader.getAttribute('tabindex')).toBe('0');
    expect(ada.getAttribute('tabindex')).toBe('-1');

    fireEvent.keyDown(nameHeader, { key: 'ArrowRight' });
    const teamHeader = screen.getByRole('columnheader', { name: 'Team' });
    expect(document.activeElement).toBe(teamHeader);
    fireEvent.keyDown(teamHeader, { key: 'Enter' });
    expect(onSortModelChange).toHaveBeenLastCalledWith([{ field: 'team', sort: 'asc' }]);

    fireEvent.keyDown(teamHeader, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('gridcell', { name: 'blue' }));
  });

  it('opens the column menu with Ctrl+Enter', async () => {
    render(<DataGrid rows={people} columns={columns} disableVirtualization />);
    const header = screen.getByRole('columnheader', { name: 'Name' });
    header.focus();
    fireEvent.keyDown(header, { key: 'Enter', ctrlKey: true });
    expect(await screen.findByRole('menuitem', { name: 'Hide column' })).toBeTruthy();
  });

  it('swaps the arrows in a right-to-left grid', () => {
    render(
      <ThemeProvider theme={createTheme({ direction: 'rtl' })}>
        <DataGrid rows={people} columns={columns} localeText={arSD} disableVirtualization />
      </ThemeProvider>,
    );
    const nameHeader = screen.getByRole('columnheader', { name: 'Name' });
    nameHeader.focus();
    fireEvent.keyDown(nameHeader, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(screen.getByRole('columnheader', { name: 'Team' }));
    expect(screen.getByRole('grid').closest('[dir]')?.getAttribute('dir')).toBe('rtl');
  });
});

describe('api methods', () => {
  it('manages filter items and the logic operator', () => {
    const onFilterModelChange = vi.fn();
    const { api } = renderWithApi({ onFilterModelChange });
    act(() => api().upsertFilterItem({ id: 1, field: 'team', operator: 'equals', value: 'red' }));
    expect(screen.queryByRole('gridcell', { name: 'Cy' })).toBeNull();
    act(() => api().upsertFilterItem({ id: 1, field: 'team', operator: 'equals', value: 'blue' }));
    expect(screen.getByRole('gridcell', { name: 'Cy' })).toBeTruthy();
    act(() => api().setFilterLogicOperator('or'));
    expect(onFilterModelChange).toHaveBeenLastCalledWith(expect.objectContaining({ logicOperator: 'or' }));
    act(() => api().deleteFilterItem({ id: 1, field: 'team', operator: 'equals' }));
    expect(screen.getByRole('gridcell', { name: 'Ada' })).toBeTruthy();
  });

  it('opens and closes the filter panel, the preferences and the column menu', async () => {
    const { api } = renderWithApi();
    act(() => api().showFilterPanel('team'));
    expect(await screen.findByRole('button', { name: 'Add filter' })).toBeTruthy();
    act(() => api().hideFilterPanel());
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Add filter' })).toBeNull());

    act(() => api().showColumnMenu('name'));
    expect(await screen.findByRole('menuitem', { name: 'Hide column' })).toBeTruthy();
    act(() => api().hideColumnMenu());
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Hide column' })).toBeNull());

    act(() => api().showPreferences('columns'));
    expect(await screen.findByRole('textbox', { name: 'Search' })).toBeTruthy();
  });

  it('sorts a column and lists sorted rows', () => {
    const { api } = renderWithApi();
    act(() => api().sortColumn('age', 'desc'));
    expect(api().getSortedRowIds()).toEqual([2, 1, 3]);
    expect(api().getRowIdFromRowIndex(0)).toBe(2);
    act(() => api().sortColumn('team', 'asc', true));
    expect(api().getSortModel()).toEqual([
      { field: 'age', sort: 'desc' },
      { field: 'team', sort: 'asc' },
    ]);
    act(() => api().sortColumn('age', null));
    expect(api().getSortModel()).toEqual([{ field: 'team', sort: 'asc' }]);
  });

  it('reads and changes edit state', async () => {
    const { api } = renderWithApi();
    expect(api().getCellMode(1, 'name')).toBe('view');
    act(() => api().startCellEditMode({ id: 1, field: 'name' }));
    expect(api().getCellMode(1, 'name')).toBe('edit');
    await act(async () => {
      expect(await api().setEditCellValue({ id: 1, field: 'name', value: 'Ann' })).toBe(true);
    });
    expect((screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe('Ann');
    expect(await api().setEditCellValue({ id: 2, field: 'name', value: 'x' })).toBe(false);
  });

  it('describes rows, cells, headers and the row tree', () => {
    const { api } = renderWithApi({ rowGroupingModel: ['team'] });
    expect(api().getRowParams(1)).toEqual({ id: 1, row: people[0] });
    expect(api().getCellParams(1, 'age')).toMatchObject({ value: 36, formattedValue: '36' });
    expect(api().getColumnHeaderParams('name')?.colDef.headerName).toBe('Name');

    const group = api().getRowNode(api().getRowNode(1)?.parent as string);
    expect(group).toMatchObject({ type: 'group', groupingField: 'team', groupingKey: 'red', isAutoGenerated: true, childrenExpanded: false });
    expect(api().getRowGroupChildren({ groupId: group?.id as string })).toEqual([1, 2]);
  });

  it('changes the row grouping criteria', () => {
    const onRowGroupingModelChange = vi.fn();
    const { api } = renderWithApi({ onRowGroupingModelChange });
    act(() => api().addRowGroupingCriteria('team'));
    expect(onRowGroupingModelChange).toHaveBeenLastCalledWith(['team']);
    act(() => api().addRowGroupingCriteria('age', 0));
    expect(onRowGroupingModelChange).toHaveBeenLastCalledWith(['age', 'team']);
    act(() => api().setRowGroupingCriteriaIndex('age', 1));
    expect(onRowGroupingModelChange).toHaveBeenLastCalledWith(['team', 'age']);
    act(() => api().removeRowGroupingCriteria('team'));
    expect(onRowGroupingModelChange).toHaveBeenLastCalledWith(['age']);
  });

  it('focuses a column header', () => {
    const { api } = renderWithApi();
    act(() => api().setColumnHeaderFocus('age'));
    expect(document.activeElement).toBe(screen.getByRole('columnheader', { name: /^Age/ }));
  });
});

describe('locales', () => {
  it('translates every text of the default locale', () => {
    const keys = Object.keys(DEFAULT_LOCALE_TEXT).sort();
    for (const locale of [frFR, deDE, esES, ptBR, jaJP, zhCN, arSD]) {
      expect(Object.keys(locale).sort()).toEqual(keys);
      expect(Object.keys(locale.filterOperators).sort()).toEqual(Object.keys(DEFAULT_LOCALE_TEXT.filterOperators).sort());
    }
  });

  it('shows a locale in the grid', () => {
    render(<DataGrid rows={[]} columns={columns} localeText={frFR} showToolbar />);
    expect(screen.getByText('Pas de résultats')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Colonnes' })).toBeTruthy();
  });
});
