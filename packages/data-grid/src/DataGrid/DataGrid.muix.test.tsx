import type {} from '../themeAugmentation';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DataGrid, useGridApiRef } from './DataGrid';
import type { GridApi, GridColDef, GridToolbarProps } from './DataGrid.types';
import { gridClasses } from './gridClasses';
import {
  gridDensitySelector,
  gridFilteredSortedRowIdsSelector,
  gridPageCountSelector,
  gridPaginatedVisibleSortedGridRowIdsSelector,
  gridRowSelectionStateSelector,
  gridSortModelSelector,
  gridVisibleColumnFieldsSelector,
  useGridApiContext,
  useGridApiEventHandler,
  useGridRootProps,
  useGridSelector,
} from './gridState';

type Person = { id: number; name: string; age: number };

const people: Person[] = [
  { id: 1, name: 'Ada', age: 36 },
  { id: 2, name: 'Bob', age: 40 },
  { id: 3, name: 'Cy', age: 20 },
];

const columns: GridColDef<Person>[] = [
  { field: 'name', headerName: 'Name' },
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
  return { ...view, apiRef: () => holder.ref as { current: GridApi } };
}

describe('MUI X class names and theme styling', () => {
  it('puts MUI X class names on the parts of the grid', () => {
    const { container } = render(
      <DataGrid rows={people} columns={columns} className="mine" initialState={{ sorting: { sortModel: [{ field: 'age', sort: 'asc' }] } }} />,
    );
    const root = container.querySelector(`.${gridClasses.root}`) as HTMLElement;
    expect(root.classList.contains('mine')).toBe(true);
    expect(root.querySelectorAll(`.${gridClasses.row}`)).toHaveLength(3);
    expect(root.querySelectorAll(`.${gridClasses.cell}`)).toHaveLength(6);
    expect(root.querySelector(`.${gridClasses['cell--textRight']}`)?.textContent).toBe('20');
    expect(root.querySelector(`.${gridClasses['columnHeader--sorted']}`)?.textContent).toContain('Age');
    expect(root.querySelector(`.${gridClasses.footerContainer}`)).toBeTruthy();
  });

  it('applies styleOverrides from the theme to the root and to slots', () => {
    const theme = createTheme({
      components: {
        MuiDataGrid: {
          defaultProps: { density: 'compact' },
          styleOverrides: { root: { outline: '3px solid red' }, cell: ({ theme: t }) => ({ color: t.palette.secondary.main }) },
        },
      },
    });
    const { container } = render(
      <ThemeProvider theme={theme}>
        <DataGrid rows={people} columns={columns} />
      </ThemeProvider>,
    );
    const root = container.querySelector(`.${gridClasses.root}`) as HTMLElement;
    expect(getComputedStyle(root).outline).toBe('3px solid red');
    const cell = container.querySelector(`.${gridClasses.cell}`) as HTMLElement;
    expect(getComputedStyle(cell).color).toBe('rgb(156, 39, 176)');
    // `defaultProps` typed through the augmentation reach the grid: compact rows are 36px high.
    expect(getComputedStyle(container.querySelector(`.${gridClasses.row}`) as HTMLElement).height).toBe('36px');
  });
});

describe('state and selectors', () => {
  it('exposes the state through selectors with MUI X names', () => {
    const { apiRef } = renderWithApi({ pageSizeOptions: [2], checkboxSelection: true });
    act(() => apiRef().current.setSortModel([{ field: 'age', sort: 'desc' }]));
    act(() => apiRef().current.setRowSelectionModel([1]));
    expect(gridSortModelSelector(apiRef())).toEqual([{ field: 'age', sort: 'desc' }]);
    expect(gridFilteredSortedRowIdsSelector(apiRef())).toEqual([2, 1, 3]);
    expect(gridPaginatedVisibleSortedGridRowIdsSelector(apiRef())).toEqual([2, 1]);
    expect(gridPageCountSelector(apiRef())).toBe(2);
    expect(gridRowSelectionStateSelector(apiRef())).toEqual([1]);
    expect(gridVisibleColumnFieldsSelector(apiRef())).toEqual(['__check__', 'name', 'age']);
    expect(apiRef().current.rootElementRef.current?.classList.contains(gridClasses.root)).toBe(true);
  });

  it('keeps state parts stable across renders that do not change them', () => {
    const { apiRef, rerender } = renderWithApi();
    const before = apiRef().current.state;
    rerender(<DataGrid rows={people} columns={columns} disableVirtualization apiRef={apiRef()} />);
    act(() => apiRef().current.setDensity('compact'));
    const after = apiRef().current.state;
    expect(after).not.toBe(before);
    expect(after.sorting).toEqual(before.sorting);
    expect(after.density).toBe('compact');
  });

  it('publishes model change events and the state change', () => {
    const { apiRef } = renderWithApi();
    const onSort = vi.fn();
    const onState = vi.fn();
    const onDensity = vi.fn();
    act(() => {
      apiRef().current.subscribeEvent('sortModelChange', onSort);
      apiRef().current.subscribeEvent('stateChange', onState);
      apiRef().current.subscribeEvent('densityChange', onDensity);
    });
    act(() => apiRef().current.setSortModel([{ field: 'name', sort: 'asc' }]));
    expect(onSort).toHaveBeenCalledWith([{ field: 'name', sort: 'asc' }]);
    expect(onState).toHaveBeenCalled();
    expect(onDensity).not.toHaveBeenCalled();
    act(() => apiRef().current.setDensity('comfortable'));
    expect(onDensity).toHaveBeenCalledWith('comfortable');
  });
});

describe('custom slots with the api context', () => {
  function CustomToolbar(_props: GridToolbarProps) {
    const apiRef = useGridApiContext();
    const rootProps = useGridRootProps();
    const density = useGridSelector(apiRef, gridDensitySelector);
    const sortModel = useGridSelector(apiRef, gridSortModelSelector);
    const events = useGridApiEventHandlerCount(apiRef);
    return (
      <div role="toolbar">
        <span>density: {density}</span>
        <span>sorted: {sortModel.map((item) => `${item.field} ${item.sort}`).join(',') || 'none'}</span>
        <span>rows prop: {rootProps.rows.length}</span>
        <span>clicks: {events}</span>
        <button type="button" onClick={() => apiRef.current.setDensity('compact')}>
          compact
        </button>
      </div>
    );
  }

  function useGridApiEventHandlerCount(apiRef: ReturnType<typeof useGridApiContext>) {
    const [count, setCount] = useState(0);
    useGridApiEventHandler(apiRef, 'cellClick', () => setCount((value) => value + 1));
    return count;
  }

  it('reads and drives the grid from a custom toolbar', () => {
    render(<DataGrid rows={people} columns={columns} showToolbar slots={{ toolbar: CustomToolbar }} />);
    expect(screen.getByText('density: standard')).toBeTruthy();
    expect(screen.getByText('rows prop: 3')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'compact' }));
    expect(screen.getByText('density: compact')).toBeTruthy();

    fireEvent.click(screen.getByRole('columnheader', { name: 'Name' }));
    expect(screen.getByText('sorted: name asc')).toBeTruthy();

    fireEvent.click(screen.getByRole('gridcell', { name: 'Bob' }));
    expect(screen.getByText('clicks: 1')).toBeTruthy();
  });

  it('throws a clear error outside a grid', () => {
    function Outside() {
      useGridApiContext();
      return null;
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Outside />)).toThrow('useGridApiContext must be called inside a DataGrid');
    spy.mockRestore();
  });
});
