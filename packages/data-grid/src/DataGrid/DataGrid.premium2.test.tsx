import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataGrid, useGridApiRef } from './DataGrid';
import type { GridApi, GridColDef, GridPivotModel } from './DataGrid.types';
import { GridPivotPanel, movePivotField } from './components/GridPivotPanel';
import { computePivot, getDefaultPivotDerivedColumns, withPivotDerivedColumns } from './features/pivot';
import { GRID_AGGREGATION_FUNCTIONS } from './features/aggregation';
import { unzip } from './features/unzip.testutil';
import { DEFAULT_LOCALE_TEXT } from './localeText';

type Sale = { id: number; region: string; amount: number; date: Date };

const sales: Sale[] = [
  { id: 1, region: 'North', amount: 10, date: new Date(2023, 1, 1) },
  { id: 2, region: 'North', amount: 20, date: new Date(2024, 4, 1) },
  { id: 3, region: 'South', amount: 5, date: new Date(2024, 10, 1) },
];

const saleColumns: GridColDef<Sale>[] = [
  { field: 'region', headerName: 'Region' },
  { field: 'amount', headerName: 'Amount', type: 'number' },
  { field: 'date', headerName: 'Date', type: 'date' },
];

function renderWithApi(element: (apiRef: { current: GridApi }) => React.ReactElement) {
  const holder: { ref: { current: GridApi } | null } = { ref: null };
  function Harness() {
    const apiRef = useGridApiRef();
    holder.ref = apiRef;
    return element(apiRef);
  }
  render(<Harness />);
  return () => (holder.ref as { current: GridApi }).current;
}

describe('grouping value getter', () => {
  it('groups rows by the value groupingValueGetter returns', () => {
    const columns: GridColDef<Sale>[] = [
      ...saleColumns.slice(0, 2),
      { field: 'date', headerName: 'Date', type: 'date', groupingValueGetter: (value: Date) => value.getFullYear() },
    ];
    render(<DataGrid rows={sales} columns={columns} rowGroupingModel={['date']} disableVirtualization />);
    expect(screen.getByText('2023 (1)')).toBeTruthy();
    expect(screen.getByText('2024 (2)')).toBeTruthy();
  });
});

describe('tree data aggregation', () => {
  const files = [
    { id: 1, path: ['src'], size: 1000 },
    { id: 2, path: ['src', 'a.ts'], size: 3 },
    { id: 3, path: ['src', 'b.ts'], size: 4 },
    { id: 4, path: ['docs', 'c.md'], size: 5 },
  ];
  const columns: GridColDef<(typeof files)[number]>[] = [{ field: 'size', headerName: 'Size', type: 'number' }];

  it('shows the total of the leaves on a parent row that has values of its own', () => {
    render(
      <DataGrid
        rows={files}
        columns={columns}
        treeData
        getTreeDataPath={(row) => row.path}
        aggregationModel={{ size: 'sum' }}
        defaultGroupingExpansionDepth={-1}
        disableVirtualization
      />,
    );
    const srcRow = screen.getByText('src').closest('[role="row"]') as HTMLElement;
    expect(within(srcRow).getByText('7 (sum)')).toBeTruthy();
    expect(within(screen.getByText('docs').closest('[role="row"]') as HTMLElement).getByText('5 (sum)')).toBeTruthy();
    // The grand total adds the leaves, not the parent's own 1000.
    expect(screen.getByText('12')).toBeTruthy();
  });
});

describe('detail panels', () => {
  it('sizes a panel to its content with "auto"', () => {
    const { container } = render(
      <DataGrid
        rows={sales}
        columns={saleColumns}
        getDetailPanelContent={({ row }) => <div style={{ height: 300 }}>Detail {row.id}</div>}
        getDetailPanelHeight={() => 'auto'}
        detailPanelExpandedRowIds={[1]}
        disableVirtualization
      />,
    );
    const panelRow = screen.getByText('Detail 1').closest('[role="row"]') as HTMLElement;
    expect(panelRow.style.height === '' || panelRow.style.height === 'auto').toBe(true);
    expect(container.querySelector('[role="row"]')).toBeTruthy();
  });
});

describe('autosizeOnMount', () => {
  it('fits the columns once the rows are in', () => {
    const onColumnAutosize = vi.fn();
    render(<DataGrid rows={sales} columns={saleColumns} autosizeOnMount autosizeOptions={{ columns: ['region'] }} onColumnAutosize={onColumnAutosize} />);
    expect(onColumnAutosize).toHaveBeenCalledTimes(1);
    expect(Object.keys(onColumnAutosize.mock.calls[0]?.[0] ?? {})).toEqual(['region']);
  });
});

describe('pivot derived columns and column overrides', () => {
  it('offers year and quarter fields for date columns', () => {
    const columns = withPivotDerivedColumns(saleColumns, getDefaultPivotDerivedColumns);
    expect(columns.map((column) => column.field)).toEqual(['region', 'amount', 'date', 'date-year', 'date-quarter']);
  });

  it('pivots by a derived year and applies pivotingColDef', () => {
    const columns = withPivotDerivedColumns(saleColumns, getDefaultPivotDerivedColumns);
    const result = computePivot({
      rows: sales,
      columns: new Map(columns.map((column) => [column.field, column])),
      model: { rows: [{ field: 'region' }], columns: [{ field: 'date-year' }], values: [{ field: 'amount', aggFunc: 'sum' }] },
      functions: GRID_AGGREGATION_FUNCTIONS,
      totalLabel: 'Total',
      pivotingColDef: ({ columnGroupPath }) => ({ width: 99, headerName: `Amount ${columnGroupPath.join('')}` }),
    });
    expect(result.columnGroupingModel?.map((group) => ('groupId' in group ? group.headerName : null))).toEqual(['2023', '2024']);
    expect(result.columns.map((column) => [column.headerName, column.width])).toEqual([
      ['Amount 2023', 99],
      ['Amount 2024', 99],
    ]);
  });

  it('lists derived fields in the pivot panel of the grid', () => {
    render(<DataGrid rows={sales} columns={saleColumns} showToolbar />);
    fireEvent.click(screen.getByRole('button', { name: 'Pivot' }));
    expect(screen.getByText('Date (Year)')).toBeTruthy();
    expect(screen.getByText('Date (Quarter)')).toBeTruthy();
  });
});

describe('pivot panel drag and drop', () => {
  const empty: GridPivotModel = { rows: [], columns: [], values: [] };

  it('moves fields between areas', () => {
    let model = movePivotField(empty, 'region', 'fields', 'rows', null, 'sum');
    expect(model.rows).toEqual([{ field: 'region' }]);
    model = movePivotField(model, 'region', 'rows', 'columns', null, 'sum');
    expect(model).toEqual({ rows: [], columns: [{ field: 'region' }], values: [] });
    model = movePivotField(model, 'amount', 'fields', 'values', null, 'sum');
    expect(model.values).toEqual([{ field: 'amount', aggFunc: 'sum' }]);
    model = movePivotField(model, 'region', 'columns', 'fields', null, 'sum');
    expect(model.columns).toEqual([]);
  });

  it('reorders within an area', () => {
    const model = { ...empty, rows: [{ field: 'a' }, { field: 'b' }, { field: 'c' }] };
    expect(movePivotField(model, 'c', 'rows', 'rows', 0, undefined).rows.map((item) => item.field)).toEqual(['c', 'a', 'b']);
    expect(movePivotField(model, 'a', 'rows', 'rows', 2, undefined).rows.map((item) => item.field)).toEqual(['b', 'a', 'c']);
  });

  it('drops a dragged field chip on a zone', () => {
    const onModelChange = vi.fn();
    const transfer = { setData: () => undefined, effectAllowed: '', dropEffect: '' };
    render(
      <GridPivotPanel
        columns={saleColumns}
        active
        onActiveChange={() => undefined}
        model={empty}
        onModelChange={onModelChange}
        getAvailableFunctions={() => ['sum']}
        getFunctionLabel={(fn) => fn}
        localeText={DEFAULT_LOCALE_TEXT}
      />,
    );
    const chip = document.querySelector('[data-pivot-field="region"]') as HTMLElement;
    fireEvent.dragStart(chip, { dataTransfer: transfer });
    const rowsZone = screen.getByRole('region', { name: 'Rows' });
    fireEvent.dragOver(rowsZone, { dataTransfer: transfer });
    fireEvent.drop(rowsZone, { dataTransfer: transfer });
    expect(onModelChange).toHaveBeenCalledWith({ rows: [{ field: 'region' }], columns: [], values: [] });
  });
});

describe('grouped Excel export', () => {
  it('writes groups as bold rows with aggregates and nests their rows', () => {
    const api = renderWithApi((apiRef) => (
      <DataGrid rows={sales} columns={saleColumns} apiRef={apiRef} rowGroupingModel={['region']} aggregationModel={{ amount: 'sum' }} />
    ));
    const sheet = unzip(api().getDataAsExcel())['xl/worksheets/sheet1.xml'] as string;
    expect(sheet).toContain('>Group<');
    expect(sheet).toMatch(/<row r="2"><c r="A2"[^>]*><is><t xml:space="preserve">North<\/t><\/is><\/c><c r="B2"[^>]*><v>30<\/v>/);
    expect(sheet).toContain('<row r="3" outlineLevel="1">');
    // Without groups the rows come flat.
    const flat = unzip(api().getDataAsExcel({ includeRowGroups: false }))['xl/worksheets/sheet1.xml'] as string;
    expect(flat).not.toContain('outlineLevel');
  });
});

describe('reordering grouped rows', () => {
  const tree = [
    { id: 1, path: ['a'], name: 'a' },
    { id: 2, path: ['a', 'x'], name: 'x' },
    { id: 3, path: ['a', 'y'], name: 'y' },
    { id: 4, path: ['b'], name: 'b' },
  ];
  const labels = () =>
    screen.getAllByRole('row').flatMap((row) => {
      const text = row.querySelector('[data-field="__tree_data_group__"]')?.textContent;
      return text ? [text] : [];
    });
  const handleOf = (label: string) =>
    within(
      screen.getAllByRole('row').find((row) => row.querySelector('[data-field="__tree_data_group__"]')?.textContent === label) as HTMLElement,
    ).getByRole('button', { name: 'Reorder row' });

  it('moves a tree row among its siblings with Alt+Arrow, taking its children along', () => {
    const onRowOrderChange = vi.fn();
    render(
      <DataGrid
        rows={tree}
        columns={[{ field: 'name' }]}
        treeData
        getTreeDataPath={(row) => row.path}
        defaultGroupingExpansionDepth={-1}
        rowReordering
        onRowOrderChange={onRowOrderChange}
        disableVirtualization
      />,
    );
    fireEvent.keyDown(handleOf('y'), { key: 'ArrowUp', altKey: true });
    expect(labels()).toEqual(['a', 'y', 'x', 'b']);
    // A row cannot leave its parent.
    fireEvent.keyDown(handleOf('y'), { key: 'ArrowUp', altKey: true });
    expect(labels()).toEqual(['a', 'y', 'x', 'b']);

    fireEvent.keyDown(handleOf('a'), { key: 'ArrowDown', altKey: true });
    expect(labels()).toEqual(['b', 'a', 'y', 'x']);
    expect(onRowOrderChange).toHaveBeenLastCalledWith(expect.objectContaining({ oldIndex: 0, targetIndex: 1 }));
  });

  it('has no handle on generated group rows', () => {
    const rows = [
      { id: 1, team: 'red', name: 'Ada' },
      { id: 2, team: 'red', name: 'Bob' },
    ];
    render(
      <DataGrid rows={rows} columns={[{ field: 'name' }, { field: 'team' }]} rowGroupingModel={['team']} defaultGroupingExpansionDepth={1} rowReordering disableVirtualization />,
    );
    expect(screen.getAllByRole('button', { name: 'Reorder row' })).toHaveLength(2);
    act(() => {
      fireEvent.keyDown(screen.getAllByRole('button', { name: 'Reorder row' })[1] as HTMLElement, { key: 'ArrowUp', altKey: true });
    });
    const names = screen.getAllByRole('gridcell').filter((cell) => cell.getAttribute('data-field') === 'name').map((cell) => cell.textContent);
    expect(names).toEqual(['', 'Bob', 'Ada']);
  });
});
