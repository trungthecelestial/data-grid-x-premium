import type { SxProps, Theme } from '@mui/material/styles';
import type { ComponentType, MutableRefObject, ReactNode } from 'react';

export type GridRowId = string | number;

export type GridValidRowModel = { [key: string]: any };

export type GridColType = 'string' | 'number' | 'date' | 'dateTime' | 'boolean' | 'singleSelect' | 'actions';

export type GridSortDirection = 'asc' | 'desc' | null | undefined;

export interface GridSortItem {
  field: string;
  sort: GridSortDirection;
}

export type GridSortModel = GridSortItem[];

export type GridLogicOperator = 'and' | 'or';

export interface GridFilterItem {
  id?: number | string;
  field: string;
  operator: string;
  value?: any;
}

export interface GridFilterModel {
  items: GridFilterItem[];
  logicOperator?: GridLogicOperator;
  quickFilterValues?: string[];
  quickFilterLogicOperator?: GridLogicOperator;
}

export interface GridPaginationModel {
  page: number;
  pageSize: number;
}

export type GridRowSelectionModel = readonly GridRowId[];

export type GridColumnVisibilityModel = Record<string, boolean>;

export type GridDensity = 'compact' | 'standard' | 'comfortable';

export type GridAggregationFunction = 'sum' | 'avg' | 'min' | 'max' | 'size';

export type GridAggregationModel = Record<string, GridAggregationFunction>;

export interface GridPinnedColumns {
  left?: string[];
  right?: string[];
}

export interface GridPinnedRows<R extends GridValidRowModel = GridValidRowModel> {
  top?: readonly R[];
  bottom?: readonly R[];
}

export type GridColumnGroupChild = { field: string } | GridColumnGroup;

export interface GridColumnGroup {
  groupId: string;
  headerName?: string;
  children: GridColumnGroupChild[];
}

export type GridColumnGroupingModel = GridColumnGroup[];

export interface GridValueOption {
  value: string | number;
  label: string;
}

export interface GridRenderCellParams<R extends GridValidRowModel = GridValidRowModel> {
  id: GridRowId;
  field: string;
  value: unknown;
  formattedValue: string;
  row: R;
  colDef: GridColDef<R>;
}

export interface GridRenderEditCellParams<R extends GridValidRowModel = GridValidRowModel> {
  id: GridRowId;
  field: string;
  value: unknown;
  row: R;
  colDef: GridColDef<R>;
  onChange: (value: unknown) => void;
  /** Saves the edit. */
  onCommit: () => void;
  /** Discards the edit. */
  onCancel: () => void;
}

export interface GridFilterOperator<R extends GridValidRowModel = GridValidRowModel> {
  value: string;
  label?: string;
  /** Returns the predicate for a filter item, or `null` when the item is incomplete and must be ignored. */
  getApplyFilterFn: (item: GridFilterItem, column: GridColDef<R>) => ((cellValue: unknown, row: R) => boolean) | null;
  /** Defaults to true. Operators such as `isEmpty` set it to false. */
  requiresFilterValue?: boolean;
  inputType?: 'text' | 'number' | 'date' | 'datetime-local' | 'singleSelect' | 'boolean' | 'multi';
}

export interface GridColDef<R extends GridValidRowModel = GridValidRowModel> {
  /** Key of the row field this column displays. */
  field: string;
  headerName?: string;
  type?: GridColType;
  /** Column width in px. Ignored when `flex` is set. Defaults to 100. */
  width?: number;
  /** Share of the remaining space this column takes. */
  flex?: number;
  minWidth?: number;
  maxWidth?: number;
  align?: 'left' | 'center' | 'right';
  headerAlign?: 'left' | 'center' | 'right';
  sortable?: boolean;
  filterable?: boolean;
  hideable?: boolean;
  resizable?: boolean;
  /** Prevents the column from being dragged to a new position. */
  disableReorder?: boolean;
  /** Hides the menu button in this column's header. */
  disableColumnMenu?: boolean;
  editable?: boolean;
  /** Options of a `singleSelect` column. */
  valueOptions?: readonly (string | number | GridValueOption)[];
  valueGetter?: (value: any, row: R) => unknown;
  valueFormatter?: (value: any, row: R) => string;
  /** Turns the editor output into the stored value. */
  valueParser?: (value: any, row: R) => unknown;
  /** Writes an edited value into a copy of the row. */
  valueSetter?: (value: any, row: R) => R;
  sortComparator?: (v1: any, v2: any, row1: R, row2: R) => number;
  filterOperators?: readonly GridFilterOperator<R>[];
  renderCell?: (params: GridRenderCellParams<R>) => ReactNode;
  renderHeader?: (params: { colDef: GridColDef<R> }) => ReactNode;
  renderEditCell?: (params: GridRenderEditCellParams<R>) => ReactNode;
  /** Actions shown in a `actions` column. */
  getActions?: (params: { id: GridRowId; row: R; field: string }) => ReactNode[];
}

export interface GridInitialState {
  sorting?: { sortModel?: GridSortModel };
  filter?: { filterModel?: GridFilterModel };
  pagination?: { paginationModel?: GridPaginationModel };
  columns?: {
    columnVisibilityModel?: GridColumnVisibilityModel;
    orderedFields?: string[];
    dimensions?: Record<string, { width: number }>;
  };
  pinnedColumns?: GridPinnedColumns;
  density?: GridDensity;
  rowSelection?: GridRowSelectionModel;
  aggregation?: { model?: GridAggregationModel };
  rowGrouping?: { model?: string[] };
}

export interface GridLocaleText {
  noRowsLabel: string;
  loadingLabel: string;
  toolbarColumns: string;
  toolbarFilters: string;
  toolbarDensity: string;
  toolbarExport: string;
  toolbarQuickFilterPlaceholder: string;
  toolbarQuickFilterClear: string;
  densityCompact: string;
  densityStandard: string;
  densityComfortable: string;
  exportCsv: string;
  exportPrint: string;
  columnsPanelShowHideAll: string;
  columnsPanelReset: string;
  columnsPanelSearch: string;
  filterPanelAddFilter: string;
  filterPanelRemoveAll: string;
  filterPanelColumns: string;
  filterPanelOperator: string;
  filterPanelValue: string;
  filterPanelLogicAnd: string;
  filterPanelLogicOr: string;
  filterPanelNoFilters: string;
  filterOperators: Record<string, string>;
  aggregationFunctions: Record<GridAggregationFunction, string>;
  footerRowsSelected: (count: number) => string;
  checkboxSelectionHeader: string;
  checkboxSelectionRow: string;
  detailPanelToggle: string;
  expandCollapse: string;
  treeDataGroupHeader: string;
  rowGroupingHeader: string;
  booleanTrue: string;
  booleanFalse: string;
  paginationRowsPerPage: string;
  columnMenuLabel: string;
  columnMenuSortAsc: string;
  columnMenuSortDesc: string;
  columnMenuFilter: string;
  columnMenuAggregation: string;
  columnMenuAggregationNone: string;
  columnMenuGroupBy: (columnName: string) => string;
  columnMenuUngroupBy: (columnName: string) => string;
  columnMenuHideColumn: string;
  columnMenuManageColumns: string;
}

export interface GridToolbarProps<R extends GridValidRowModel = GridValidRowModel> {
  columns: readonly GridColDef<R>[];
  columnVisibilityModel: GridColumnVisibilityModel;
  onColumnVisibilityModelChange: (model: GridColumnVisibilityModel) => void;
  filterModel: GridFilterModel;
  onFilterModelChange: (model: GridFilterModel) => void;
  density: GridDensity;
  onDensityChange: (density: GridDensity) => void;
  localeText: GridLocaleText;
  exportDataAsCsv: () => void;
  print: () => void;
}

export interface GridSlots {
  toolbar?: ComponentType<GridToolbarProps<any>>;
}

export interface GridEditStopParams {
  ignoreModifications?: boolean;
}

export interface GridApi {
  exportDataAsCsv: (options?: { fileName?: string; delimiter?: string }) => void;
  getDataAsCsv: (options?: { delimiter?: string }) => string;
  print: () => void;
  startCellEditMode: (params: { id: GridRowId; field: string }) => void;
  startRowEditMode: (params: { id: GridRowId }) => void;
  stopEditMode: (params?: GridEditStopParams) => void;
  setRowSelectionModel: (model: GridRowSelectionModel) => void;
  setColumnVisibility: (field: string, visible: boolean) => void;
  getRowModels: () => Map<GridRowId, GridValidRowModel>;
}

export type GridApiRef = MutableRefObject<GridApi>;

export interface DataGridProps<R extends GridValidRowModel = GridValidRowModel> {
  rows: readonly R[];
  columns: readonly GridColDef<R>[];
  /** Returns the unique id of a row. Defaults to `row.id`. */
  getRowId?: (row: R) => GridRowId;
  apiRef?: GridApiRef;
  initialState?: GridInitialState;
  loading?: boolean;
  localeText?: Partial<GridLocaleText>;
  sx?: SxProps<Theme>;

  /** Height of the scrolling area in px. Defaults to 400. Ignored with `autoHeight`. */
  height?: number | string;
  autoHeight?: boolean;
  density?: GridDensity;
  onDensityChange?: (density: GridDensity) => void;
  rowHeight?: number;
  columnHeaderHeight?: number;
  /** Renders every row instead of only the ones in view. */
  disableVirtualization?: boolean;
  /** Extra rows rendered above and below the viewport. Defaults to 3. */
  rowBufferCount?: number;

  sortModel?: GridSortModel;
  onSortModelChange?: (model: GridSortModel) => void;
  sortingMode?: 'client' | 'server';
  sortingOrder?: readonly GridSortDirection[];
  disableMultipleColumnsSorting?: boolean;

  filterModel?: GridFilterModel;
  onFilterModelChange?: (model: GridFilterModel) => void;
  filterMode?: 'client' | 'server';

  /** Defaults to true. */
  pagination?: boolean;
  paginationModel?: GridPaginationModel;
  onPaginationModelChange?: (model: GridPaginationModel) => void;
  paginationMode?: 'client' | 'server';
  /** Total row count when `paginationMode` is `server`. */
  rowCount?: number;
  pageSizeOptions?: readonly number[];
  hideFooter?: boolean;

  checkboxSelection?: boolean;
  /** Defaults to true. */
  rowSelection?: boolean;
  disableRowSelectionOnClick?: boolean;
  rowSelectionModel?: GridRowSelectionModel;
  onRowSelectionModelChange?: (model: GridRowSelectionModel) => void;
  isRowSelectable?: (params: { id: GridRowId; row: R }) => boolean;

  columnVisibilityModel?: GridColumnVisibilityModel;
  onColumnVisibilityModelChange?: (model: GridColumnVisibilityModel) => void;
  pinnedColumns?: GridPinnedColumns;
  onPinnedColumnsChange?: (pinned: GridPinnedColumns) => void;
  columnGroupingModel?: GridColumnGroupingModel;
  onColumnWidthChange?: (params: { field: string; width: number }) => void;
  onColumnOrderChange?: (fields: string[]) => void;
  disableColumnSorting?: boolean;
  disableColumnFilter?: boolean;
  disableColumnResize?: boolean;
  disableColumnReorder?: boolean;
  /** Hides the menu button in each column header. */
  disableColumnMenu?: boolean;

  editMode?: 'cell' | 'row';
  /** Called with the edited row before it is committed. Return the row to keep, or throw to reject. */
  processRowUpdate?: (newRow: R, oldRow: R) => R | Promise<R>;
  onProcessRowUpdateError?: (error: unknown) => void;

  /** Shows the built-in toolbar. */
  showToolbar?: boolean;
  slots?: GridSlots;

  treeData?: boolean;
  getTreeDataPath?: (row: R) => string[];
  /** Expansion depth of groups on first render. `-1` expands everything. Defaults to 0. */
  defaultGroupingExpansionDepth?: number;
  groupingColDef?: Partial<GridColDef<R>>;
  rowGroupingModel?: string[];
  onRowGroupingModelChange?: (model: string[]) => void;
  /** Turns off grouping by a column from the column menu. */
  disableRowGrouping?: boolean;
  aggregationModel?: GridAggregationModel;
  onAggregationModelChange?: (model: GridAggregationModel) => void;
  /** Turns off choosing an aggregation from the column menu. */
  disableAggregation?: boolean;

  getDetailPanelContent?: (params: { id: GridRowId; row: R }) => ReactNode;
  /** Height of an open detail panel in px. Defaults to 200. */
  getDetailPanelHeight?: (params: { id: GridRowId; row: R }) => number;
  detailPanelExpandedRowIds?: readonly GridRowId[];
  onDetailPanelExpandedRowIdsChange?: (ids: GridRowId[]) => void;

  pinnedRows?: GridPinnedRows<R>;
}
