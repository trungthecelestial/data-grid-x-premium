import { createContext, useCallback, useContext, useEffect, useRef, useSyncExternalStore } from 'react';
import type { DataGridProps, GridApiRef, GridEventMap, GridEventName, GridState } from './DataGrid.types';

/** The grid's api for the components inside it, such as custom slots. */
export const GridApiContext = createContext<GridApiRef | null>(null);
/** The props of the grid the components inside it belong to. */
export const GridRootPropsContext = createContext<DataGridProps<any> | null>(null);

/** The `apiRef` of the grid around the calling component. Use it in custom slots, as with MUI X. */
export function useGridApiContext(): GridApiRef {
  const apiRef = useContext(GridApiContext);
  if (!apiRef) {
    throw new Error('useGridApiContext must be called inside a DataGrid, for example in a custom slot.');
  }
  return apiRef;
}

/** The props of the grid around the calling component. */
export function useGridRootProps<R extends Record<string, any> = Record<string, any>>(): DataGridProps<R> {
  const props = useContext(GridRootPropsContext);
  if (!props) {
    throw new Error('useGridRootProps must be called inside a DataGrid.');
  }
  return props as DataGridProps<R>;
}

/** Reads the current state, or `undefined` before the grid rendered the first time. */
const readState = (apiRef: GridApiRef): GridState | undefined => (apiRef.current as { state?: GridState } | undefined)?.state;

/**
 * The value a selector picks from the grid state, kept up to date: the component renders again when it changes.
 * Selectors are plain functions of `apiRef`, so `useGridSelector(apiRef, (ref) => ref.current.state.density)` works too.
 */
export function useGridSelector<T>(apiRef: GridApiRef, selector: (apiRef: GridApiRef) => T): T {
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const subscribe = useCallback(
    (onChange: () => void) => {
      // The api object is replaced on every render, but its listeners live on, so one subscription is enough.
      const unsubscribe = apiRef.current?.subscribeEvent?.('stateChange', onChange);
      return () => unsubscribe?.();
    },
    [apiRef],
  );
  const getSnapshot = () => (readState(apiRef) ? selectorRef.current(apiRef) : (undefined as T));
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Calls `handler` on every `event` of the grid while the calling component is mounted. */
export function useGridApiEventHandler<E extends GridEventName>(
  apiRef: GridApiRef,
  event: E,
  handler: (...args: GridEventMap[E]) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => apiRef.current?.subscribeEvent?.(event, (...args) => handlerRef.current(...args)), [apiRef, event]);
}

const state = (apiRef: GridApiRef) => readState(apiRef) as GridState;

// Selectors with the names MUI X uses. Each takes the grid's `apiRef`.
export const gridSortModelSelector = (apiRef: GridApiRef) => state(apiRef).sorting.sortModel;
export const gridSortedRowIdsSelector = (apiRef: GridApiRef) => state(apiRef).sorting.sortedRowIds;
export const gridFilterModelSelector = (apiRef: GridApiRef) => state(apiRef).filter.filterModel;
export const gridQuickFilterValuesSelector = (apiRef: GridApiRef) => state(apiRef).filter.filterModel.quickFilterValues ?? [];
/** Rows that pass the filters, sorted, before pagination. */
export const gridFilteredSortedRowIdsSelector = (apiRef: GridApiRef) => state(apiRef).filter.filteredRowIds;
export const gridFilteredRowCountSelector = (apiRef: GridApiRef) => state(apiRef).filter.filteredRowIds.length;
/** Rows on the current page, in display order. */
export const gridPaginatedVisibleSortedGridRowIdsSelector = (apiRef: GridApiRef) => state(apiRef).visibleRowIds;
export const gridPaginationModelSelector = (apiRef: GridApiRef) => state(apiRef).pagination.paginationModel;
export const gridPageSelector = (apiRef: GridApiRef) => state(apiRef).pagination.paginationModel.page;
export const gridPageSizeSelector = (apiRef: GridApiRef) => state(apiRef).pagination.paginationModel.pageSize;
export const gridPaginationRowCountSelector = (apiRef: GridApiRef) => state(apiRef).pagination.rowCount;
export const gridPageCountSelector = (apiRef: GridApiRef) => {
  const { rowCount, paginationModel } = state(apiRef).pagination;
  return paginationModel.pageSize > 0 ? Math.max(1, Math.ceil(rowCount / paginationModel.pageSize)) : 1;
};
export const gridRowCountSelector = (apiRef: GridApiRef) => state(apiRef).rows.totalRowCount;
export const gridRowIdsSelector = (apiRef: GridApiRef) => state(apiRef).rows.ids;
export const gridRowsLookupSelector = (apiRef: GridApiRef) => state(apiRef).rows.lookup;
export const gridColumnLookupSelector = (apiRef: GridApiRef) => state(apiRef).columns.lookup;
export const gridColumnFieldsSelector = (apiRef: GridApiRef) => state(apiRef).columns.orderedFields;
export const gridColumnDefinitionsSelector = (apiRef: GridApiRef) => {
  const { orderedFields, lookup } = state(apiRef).columns;
  return orderedFields.flatMap((field) => lookup[field] ?? []);
};
export const gridVisibleColumnFieldsSelector = (apiRef: GridApiRef) => state(apiRef).columns.visibleFields;
export const gridColumnVisibilityModelSelector = (apiRef: GridApiRef) => state(apiRef).columns.columnVisibilityModel;
export const gridPinnedColumnsSelector = (apiRef: GridApiRef) => state(apiRef).pinnedColumns;
export const gridDensitySelector = (apiRef: GridApiRef) => state(apiRef).density;
export const gridRowSelectionStateSelector = (apiRef: GridApiRef) => state(apiRef).rowSelection;
export const gridCellSelectionStateSelector = (apiRef: GridApiRef) => state(apiRef).cellSelection;
export const gridAggregationModelSelector = (apiRef: GridApiRef) => state(apiRef).aggregation.model;
export const gridRowGroupingModelSelector = (apiRef: GridApiRef) => state(apiRef).rowGrouping.model;
export const gridPivotActiveSelector = (apiRef: GridApiRef) => state(apiRef).pivoting.active;
export const gridPivotModelSelector = (apiRef: GridApiRef) => state(apiRef).pivoting.model;
export const gridDetailPanelExpandedRowIdsSelector = (apiRef: GridApiRef) => state(apiRef).detailPanel.expandedRowIds;
export const gridEditRowsStateSelector = (apiRef: GridApiRef) => state(apiRef).editing;
export const gridFocusCellSelector = (apiRef: GridApiRef) => state(apiRef).focus.cell;
export const gridFocusColumnHeaderSelector = (apiRef: GridApiRef) => state(apiRef).focus.columnHeader;
export const gridPreferencePanelStateSelector = (apiRef: GridApiRef) => state(apiRef).preferencePanel;
export const gridColumnMenuSelector = (apiRef: GridApiRef) => state(apiRef).columnMenu;
