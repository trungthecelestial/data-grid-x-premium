import type { SxProps, Theme } from '@mui/material/styles';
import type { ComponentType, KeyboardEvent, MouseEvent, MutableRefObject, ReactNode } from 'react';

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

/** Selected cells as `{ [rowId]: { [field]: true } }`. */
export type GridCellSelectionModel = Record<GridRowId, Record<string, boolean>>;

export type GridDensity = 'compact' | 'standard' | 'comfortable';

export type GridBuiltInAggregationFunction = 'sum' | 'avg' | 'min' | 'max' | 'size';

/** Key of a function: a built-in one, or one registered through `aggregationFunctions`. */
export type GridAggregationFunction = GridBuiltInAggregationFunction | (string & {});

export interface GridAggregationParams<V = any> {
  /** One entry per row, empty cells included. */
  values: V[];
  field: string;
  /** The row or group being aggregated. `null` for the grand total. */
  groupId: GridRowId | null;
}

export interface GridAggregationFunctionDef<V = any, A = any> {
  apply: (params: GridAggregationParams<V>) => A;
  /** Name shown in the column menu and headers. Defaults to the locale text, then the function's key. */
  label?: string;
  /** Column types the function is offered for. Defaults to every type. */
  columnTypes?: readonly GridColType[];
  /** Formats the result. Defaults to the column's formatting. */
  valueFormatter?: (value: A) => string;
  /** Replaces the value passed to `apply`, for functions that need more of the row, such as a weighted average. */
  getCellValue?: (params: { field: string; row: any; value: any }) => V;
}

export type GridAggregationModel = Record<string, GridAggregationFunction>;

export interface GridPivotModel {
  /** Fields whose values become the rows, outermost level first. */
  rows: { field: string }[];
  /** Fields whose values become the columns, outermost level first. */
  columns: { field: string; sort?: 'asc' | 'desc' }[];
  /** Fields aggregated into the cells of the table. */
  values: { field: string; aggFunc: GridAggregationFunction }[];
}

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
  /** True while `preProcessEditCellProps` flags the value as invalid. */
  error?: boolean;
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
  /** Set to false to remove the column from aggregation. */
  aggregable?: boolean;
  /** Keys of the functions offered for this column. Defaults to every function that accepts its type. */
  availableAggregationFunctions?: readonly GridAggregationFunction[];
  /** Set to false to keep the column out of the pivot panel. */
  pivotable?: boolean;
  /** Set to false to keep the column out of the pin actions of its menu. */
  pinnable?: boolean;
  resizable?: boolean;
  /** Class name added to the column header cell. */
  headerClassName?: string;
  /** Class name added to every cell of the column. */
  cellClassName?: string | ((params: GridCellParams<R>) => string);
  /** Tooltip shown on the column header. */
  description?: string;
  /** Hides the sort arrow until the column is sorted. */
  hideSortIcons?: boolean;
  /** Leaves the column out of CSV, Excel, print and copy output. */
  disableExport?: boolean;
  /** Prevents the column from being dragged to a new position. */
  disableReorder?: boolean;
  /** Hides the menu button in this column's header. */
  disableColumnMenu?: boolean;
  editable?: boolean;
  /** Runs on every edit change. Return `{ value, error: true }` to reject the value, or change the value. May be async. */
  preProcessEditCellProps?: (params: GridPreProcessEditCellPropsParams<R>) => GridEditCellProps | Promise<GridEditCellProps>;
  /**
   * Merges this cell with the next columns of its row. Pass the number of columns or a function of the cell.
   * Spans stop at the border of the pinned areas. Column virtualization is off while any column has a `colSpan`.
   */
  colSpan?: number | ((value: any, row: R, column: GridColDef<R>) => number);
  /** Value compared between consecutive rows when `rowSpanning` is on. Defaults to the cell value. */
  rowSpanValueGetter?: (value: any, row: R) => unknown;
  /** Options of a `singleSelect` column. */
  valueOptions?: readonly (string | number | GridValueOption)[];
  valueGetter?: (value: any, row: R) => unknown;
  valueFormatter?: (value: any, row: R) => string;
  /** Turns the editor output into the stored value. */
  valueParser?: (value: any, row: R) => unknown;
  /** Writes an edited value into a copy of the row. */
  valueSetter?: (value: any, row: R) => R;
  sortComparator?: (v1: any, v2: any, row1: R, row2: R) => number;
  /** Builds the comparator for one direction. It must apply the direction itself, so it wins over `sortComparator`. */
  getSortComparator?: (direction: 'asc' | 'desc') => ((v1: any, v2: any, row1: R, row2: R) => number) | undefined;
  /** Order a header click cycles through for this column. Defaults to the grid's `sortingOrder`. */
  sortingOrder?: readonly GridSortDirection[];
  filterOperators?: readonly GridFilterOperator<R>[];
  renderCell?: (params: GridRenderCellParams<R>) => ReactNode;
  renderHeader?: (params: { colDef: GridColDef<R> }) => ReactNode;
  renderEditCell?: (params: GridRenderEditCellParams<R>) => ReactNode;
  /** Builds the quick-filter predicate for one search term, or `null` to skip this column for it. Defaults to a case-insensitive text match. */
  getApplyQuickFilterFn?: (value: string, column: GridColDef<R>) => ((cellValue: unknown, row: R) => boolean) | null;
  /** Actions shown in a `actions` column. */
  getActions?: (params: { id: GridRowId; row: R; field: string }) => ReactNode[];
}

export interface GridEditCellProps {
  value: unknown;
  /** Set to true to mark the value invalid. The edit then cannot be saved. */
  error?: boolean;
}

export interface GridPreProcessEditCellPropsParams<R extends GridValidRowModel = GridValidRowModel> {
  id: GridRowId;
  row: R;
  /** The value being edited and its error state so far. */
  props: GridEditCellProps;
  hasChanged: boolean;
}

export interface GridEditModeEntry {
  mode: 'view' | 'edit';
  /** With `view`: discard the pending edit instead of saving it. */
  ignoreModifications?: boolean;
  /** With `edit` in row mode: the field that gets the focus. */
  fieldToFocus?: string;
}

/** `{ [rowId]: { mode } }`, for `editMode="row"`. */
export type GridRowModesModel = Record<GridRowId, GridEditModeEntry>;

/** `{ [rowId]: { [field]: { mode } } }`, for `editMode="cell"`. */
export type GridCellModesModel = Record<GridRowId, Record<string, GridEditModeEntry>>;

export interface GridRowSelectionPropagation {
  /** Selecting a parent or group selects every row below it. */
  descendants?: boolean;
  /** A parent row is selected when all its children are, and unselected when one is not. */
  parents?: boolean;
}

export type GridLoadingVariant = 'linear-progress' | 'circular-progress' | 'skeleton';

export interface GridRowParams<R extends GridValidRowModel = GridValidRowModel> {
  id: GridRowId;
  row: R;
}

export interface GridCellParams<R extends GridValidRowModel = GridValidRowModel> extends GridRowParams<R> {
  field: string;
  value: unknown;
  formattedValue: string;
  colDef: GridColDef<R>;
}

export interface GridColumnHeaderParams<R extends GridValidRowModel = GridValidRowModel> {
  field: string;
  colDef: GridColDef<R>;
}

export type GridEditStopReason = 'enterKeyDown' | 'escapeKeyDown' | 'cellFocusOut' | 'api';

export interface GridCellEditParams {
  id: GridRowId;
  field: string;
}

export interface GridCellEditStopParams extends GridCellEditParams {
  reason: GridEditStopReason;
}

export interface GridRowClassNameParams<R extends GridValidRowModel = GridValidRowModel> extends GridRowParams<R> {
  /** Index of the row among the rows on the current page. */
  indexRelativeToCurrentPage: number;
}

export interface GridCellClassNameParams<R extends GridValidRowModel = GridValidRowModel> extends GridCellParams<R> {}

/** Names of the events a consumer can subscribe to through `apiRef.subscribeEvent`. */
export interface GridEventMap {
  rowClick: [params: GridRowParams<any>, event: unknown];
  rowDoubleClick: [params: GridRowParams<any>, event: unknown];
  cellClick: [params: GridCellParams<any>, event: unknown];
  cellDoubleClick: [params: GridCellParams<any>, event: unknown];
  cellKeyDown: [params: GridCellParams<any>, event: unknown];
  columnHeaderClick: [params: GridColumnHeaderParams<any>, event: unknown];
  cellEditStart: [params: GridCellEditParams];
  cellEditStop: [params: GridCellEditStopParams];
  rowEditStart: [params: { id: GridRowId }];
  rowEditStop: [params: { id: GridRowId; reason: GridEditStopReason }];
  rowsScrollEnd: [params: { visibleRowsCount: number; viewportPageSize: number }];
}

export type GridEventName = keyof GridEventMap;

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
  pivoting?: { enabled?: boolean; model?: GridPivotModel };
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
  exportExcel: string;
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
  aggregationFunctions: Record<GridBuiltInAggregationFunction, string> & Record<string, string>;
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
  rowReorderHandle: string;
  columnMenuPinLeft: string;
  columnMenuPinRight: string;
  columnMenuUnpin: string;
  headerFilterOperator: string;
  toolbarPivot: string;
  pivotPanelActive: string;
  pivotRows: string;
  pivotColumns: string;
  pivotValues: string;
  pivotAddField: string;
  pivotMoveUp: string;
  pivotMoveDown: string;
  pivotRemove: string;
  pivotTotal: string;
}

export interface GridToolbarProps<R extends GridValidRowModel = GridValidRowModel> {
  columns: readonly GridColDef<R>[];
  /** Columns the filter panel offers. Defaults to `columns`. While pivoting these are the source columns. */
  filterColumns?: readonly GridColDef<R>[];
  columnVisibilityModel: GridColumnVisibilityModel;
  onColumnVisibilityModelChange: (model: GridColumnVisibilityModel) => void;
  filterModel: GridFilterModel;
  onFilterModelChange: (model: GridFilterModel) => void;
  density: GridDensity;
  onDensityChange: (density: GridDensity) => void;
  localeText: GridLocaleText;
  exportDataAsCsv: () => void;
  /** Omitted when `disableExcelExport` is set. */
  exportDataAsExcel?: () => void;
  print: () => void;
  /** Hides the "Columns" button. */
  disableColumnSelector?: boolean;
  /** Hides the "Density" button. */
  disableDensitySelector?: boolean;
  /** Hides the "Filters" button. */
  disableFilterSelector?: boolean;
  /** Hides the quick filter input. */
  disableQuickFilter?: boolean;
  /** Hides the "Export" button. */
  disableExport?: boolean;
  /** Opens the pivot panel under the given element. Omitted when pivoting is not available. */
  onOpenPivotPanel?: (anchor: HTMLElement) => void;
  pivotActive?: boolean;
}

export interface GridOverlayProps {
  localeText: GridLocaleText;
}

export interface GridFooterProps {
  selectedRowCount: number;
  rowCount: number;
  localeText: GridLocaleText;
}

export interface GridPaginationSlotProps {
  count: number;
  page: number;
  pageSize: number;
  pageSizeOptions: readonly (number | GridPageSizeOption)[];
  onPaginationModelChange: (model: GridPaginationModel) => void;
  localeText: GridLocaleText;
}

export interface GridFilterPanelSlotProps<R extends GridValidRowModel = GridValidRowModel> {
  columns: readonly GridColDef<R>[];
  filterModel: GridFilterModel;
  onFilterModelChange: (model: GridFilterModel) => void;
  localeText: GridLocaleText;
}

export interface GridColumnsPanelSlotProps<R extends GridValidRowModel = GridValidRowModel> {
  columns: readonly GridColDef<R>[];
  columnVisibilityModel: GridColumnVisibilityModel;
  onColumnVisibilityModelChange: (model: GridColumnVisibilityModel) => void;
  localeText: GridLocaleText;
}

export interface GridPivotPanelSlotProps<R extends GridValidRowModel = GridValidRowModel> {
  /** The source columns. */
  columns: readonly GridColDef<R>[];
  active: boolean;
  onActiveChange: (active: boolean) => void;
  model: GridPivotModel;
  onModelChange: (model: GridPivotModel) => void;
  getAvailableFunctions: (column: GridColDef<R>) => GridAggregationFunction[];
  getFunctionLabel: (fn: GridAggregationFunction) => string;
  localeText: GridLocaleText;
}

export interface GridSlots {
  toolbar?: ComponentType<GridToolbarProps<any>>;
  /** Replaces the column header menu. Receives the props of the built-in `GridColumnMenu`. */
  columnMenu?: ComponentType<any>;
  noRowsOverlay?: ComponentType<GridOverlayProps>;
  loadingOverlay?: ComponentType<GridOverlayProps>;
  /** Replaces the whole footer, including pagination. */
  footer?: ComponentType<GridFooterProps>;
  /** Replaces the pagination control inside the default footer. */
  pagination?: ComponentType<GridPaginationSlotProps>;
  filterPanel?: ComponentType<GridFilterPanelSlotProps<any>>;
  columnsPanel?: ComponentType<GridColumnsPanelSlotProps<any>>;
  pivotPanel?: ComponentType<GridPivotPanelSlotProps<any>>;
}

/** Extra props merged into the props each slot receives. */
export interface GridSlotProps {
  toolbar?: Partial<GridToolbarProps<any>> & Record<string, unknown>;
  columnMenu?: Record<string, unknown>;
  noRowsOverlay?: Record<string, unknown>;
  loadingOverlay?: Record<string, unknown>;
  footer?: Record<string, unknown>;
  pagination?: Record<string, unknown>;
  filterPanel?: Record<string, unknown>;
  columnsPanel?: Record<string, unknown>;
  pivotPanel?: Record<string, unknown>;
}

export interface GridEditStopParams {
  ignoreModifications?: boolean;
}

export interface GridCsvExportOptions {
  fileName?: string;
  delimiter?: string;
  /** Exports only these fields, in this order. Hidden columns are included when listed. */
  fields?: string[];
  /** Exports hidden columns too. */
  allColumns?: boolean;
  includeHeaders?: boolean;
  /** Prepends a byte order mark so Excel reads the file as UTF-8. Defaults to false. */
  utf8WithBom?: boolean;
  /** Picks the rows to export. Defaults to every filtered row. */
  getRowsToExport?: (params: { apiRef: GridApi }) => GridRowId[];
}

export interface GridExcelExportOptions {
  fileName?: string;
  /** Worksheet name. Defaults to `Sheet1`. */
  sheetName?: string;
  fields?: string[];
  allColumns?: boolean;
  /** Writes a bold, frozen header row. Defaults to true. */
  includeHeaders?: boolean;
  getRowsToExport?: (params: { apiRef: GridApi }) => GridRowId[];
}

/** A page size choice with its own label. A value of `-1` shows every row on one page. */
export interface GridPageSizeOption {
  value: number;
  label: string;
}

export interface GridRowSpacing {
  top?: number;
  bottom?: number;
}

export interface GridRowSpacingParams<R extends GridValidRowModel = GridValidRowModel> extends GridRowParams<R> {
  isFirstVisible: boolean;
  isLastVisible: boolean;
  /** Index among the rows on the current page. */
  indexRelativeToCurrentPage: number;
}

export interface GridPrintExportOptions {
  /** Document title. */
  fileName?: string;
  fields?: string[];
  allColumns?: boolean;
  /** Extra CSS appended to the printed document. */
  pageStyle?: string;
  getRowsToExport?: (params: { apiRef: GridApi }) => GridRowId[];
}

export interface GridScrollParams {
  left?: number;
  top?: number;
}

export interface GridScrollToIndexesParams {
  rowIndex?: number;
  colIndex?: number;
}

export interface GridRowUpdate {
  /** The row's id, or the field `getRowId` reads it from. */
  id?: GridRowId;
  [key: string]: any;
  /** Set to `delete` to remove the row. */
  _action?: 'delete';
}

export interface GridAutosizeOptions {
  /** Fields to resize. Defaults to every visible column. */
  columns?: string[];
  /** Counts header text when measuring. Defaults to true. */
  includeHeaders?: boolean;
  /** Extra width added to each measured column in px. Defaults to 0. */
  extraWidth?: number;
  /** Rows sampled when measuring. Defaults to 1000. */
  maxRows?: number;
}

export interface GridApi {
  exportDataAsCsv: (options?: GridCsvExportOptions) => void;
  getDataAsCsv: (options?: Omit<GridCsvExportOptions, 'fileName'>) => string;
  print: (options?: GridPrintExportOptions) => void;
  /** Downloads the rows as an .xlsx workbook. */
  exportDataAsExcel: (options?: GridExcelExportOptions) => void;
  /** The bytes of the .xlsx workbook, for saving or uploading it yourself. */
  getDataAsExcel: (options?: Omit<GridExcelExportOptions, 'fileName'>) => Uint8Array;
  startCellEditMode: (params: { id: GridRowId; field: string }) => void;
  startRowEditMode: (params: { id: GridRowId }) => void;
  stopEditMode: (params?: GridEditStopParams) => void;
  setRowSelectionModel: (model: GridRowSelectionModel) => void;
  setColumnVisibility: (field: string, visible: boolean) => void;
  getRowModels: () => Map<GridRowId, GridValidRowModel>;
  /** Moves a row to a position among all rows. Works without `rowReordering`. */
  setRowIndex: (id: GridRowId, targetIndex: number) => void;
  getCellSelectionModel: () => GridCellSelectionModel;
  setCellSelectionModel: (model: GridCellSelectionModel) => void;
  isCellSelected: (id: GridRowId, field: string) => boolean;
  getSelectedCellsAsArray: () => { id: GridRowId; field: string }[];

  getRow: (id: GridRowId) => GridValidRowModel | null;
  getRowId: (row: GridValidRowModel) => GridRowId;
  /** Ids of every row, after filtering and sorting. */
  getAllRowIds: () => GridRowId[];
  getRowsCount: () => number;
  /** Position of a row among the filtered and sorted rows, or -1. */
  getRowIndexRelativeToVisibleRows: (id: GridRowId) => number;
  /** Adds, merges into, or (with `_action: 'delete'`) removes rows without changing the `rows` prop. */
  updateRows: (updates: GridRowUpdate[]) => void;
  getCellValue: (id: GridRowId, field: string) => unknown;

  getSortModel: () => GridSortModel;
  setSortModel: (model: GridSortModel) => void;
  getFilterModel: () => GridFilterModel;
  setFilterModel: (model: GridFilterModel) => void;
  setQuickFilterValues: (values: string[]) => void;
  getPaginationModel: () => GridPaginationModel;
  setPaginationModel: (model: GridPaginationModel) => void;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  getDensity: () => GridDensity;
  setDensity: (density: GridDensity) => void;

  selectRow: (id: GridRowId, isSelected?: boolean, resetSelection?: boolean) => void;
  selectRows: (ids: readonly GridRowId[], isSelected?: boolean, resetSelection?: boolean) => void;
  isRowSelected: (id: GridRowId) => boolean;
  getSelectedRows: () => Map<GridRowId, GridValidRowModel>;

  getAllColumns: () => GridColDef<any>[];
  getVisibleColumns: () => GridColDef<any>[];
  getColumn: (field: string) => GridColDef<any> | undefined;
  getColumnIndex: (field: string, useVisibleColumns?: boolean) => number;
  setColumnWidth: (field: string, width: number) => void;
  setColumnIndex: (field: string, targetIndex: number) => void;
  /** Resizes columns to fit their content. */
  autosizeColumns: (options?: GridAutosizeOptions) => void;
  getPinnedColumns: () => GridPinnedColumns;
  setPinnedColumns: (pinned: GridPinnedColumns) => void;
  pinColumn: (field: string, side: 'left' | 'right') => void;
  unpinColumn: (field: string) => void;

  setAggregationModel: (model: GridAggregationModel) => void;
  setRowGroupingModel: (model: string[]) => void;
  isPivotActive: () => boolean;
  /** Does nothing where pivoting is not available. */
  setPivotActive: (active: boolean) => void;
  getPivotModel: () => GridPivotModel;
  /** Does nothing where pivoting is not available. */
  setPivotModel: (model: GridPivotModel) => void;
  toggleDetailPanel: (id: GridRowId) => void;
  getExpandedDetailPanels: () => GridRowId[];
  setRowChildrenExpansion: (id: GridRowId, isExpanded: boolean) => void;

  /** Forgets every measured row height. Rows on screen are measured again right away. */
  resetRowHeights: () => void;

  /** Scrolls the grid to a pixel offset. */
  scroll: (params: GridScrollParams) => void;
  getScrollPosition: () => { top: number; left: number };
  /** Scrolls so the cell at the given row and column is in view. */
  scrollToIndexes: (params: GridScrollToIndexesParams) => void;
  setCellFocus: (id: GridRowId, field: string) => void;

  /** Fetches the rows again through `dataSource`. */
  refetch: () => void;

  /** Snapshot of the sorting, filter, pagination, column, density, selection, aggregation, grouping and pivot state. */
  exportState: () => GridInitialState;
  restoreState: (state: GridInitialState) => void;
  /** Listens to a grid event. Returns the function that stops listening. */
  subscribeEvent: <E extends GridEventName>(event: E, handler: (...args: GridEventMap[E]) => void) => () => void;
}

export type GridApiRef = MutableRefObject<GridApi>;

export interface GridDataSourceGetRowsParams {
  sortModel: GridSortModel;
  filterModel: GridFilterModel;
  paginationModel: GridPaginationModel;
}

export interface GridDataSourceGetRowsResult<R extends GridValidRowModel = GridValidRowModel> {
  rows: R[];
  /** Total number of rows on the server, across all pages. */
  rowCount: number;
}

/** Loads rows from a server. Sorting, filtering and pagination then run on the server. */
export interface GridDataSource<R extends GridValidRowModel = GridValidRowModel> {
  getRows: (params: GridDataSourceGetRowsParams) => Promise<GridDataSourceGetRowsResult<R>>;
  /** Called when `getRows` rejects. */
  onError?: (error: unknown, params: GridDataSourceGetRowsParams) => void;
}

export interface DataGridProps<R extends GridValidRowModel = GridValidRowModel> {
  /** Ignored when `dataSource` is set. */
  rows: readonly R[];
  columns: readonly GridColDef<R>[];
  /**
   * Fetches `rows` and `rowCount` for the current sort, filter and page, and again whenever one of them changes.
   * Turns sorting, filtering and pagination to `server` mode. Results of stale requests are dropped.
   */
  dataSource?: GridDataSource<R>;
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
  /** Height of the column group header rows in px. Defaults to `columnHeaderHeight`. */
  columnGroupHeaderHeight?: number;
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
  /** Page sizes to offer. Use `{ value: -1, label: 'All' }` for an option that shows every row. */
  pageSizeOptions?: readonly (number | GridPageSizeOption)[];
  hideFooter?: boolean;

  checkboxSelection?: boolean;
  /** How selection moves through tree data and row groups. Off by default. */
  rowSelectionPropagation?: GridRowSelectionPropagation;
  /** Allows one selected row at a time: no header checkbox, no Shift/Ctrl multi-select. */
  disableMultipleRowSelection?: boolean;
  /** Look of the default loading indicator. Defaults to `linear-progress`. */
  loadingVariant?: GridLoadingVariant;
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
  /** Called with the exported state whenever sorting, filtering, pagination, columns, density, selection, aggregation or grouping change. */
  onStateChange?: (state: GridInitialState) => void;
  disableColumnSorting?: boolean;
  disableColumnFilter?: boolean;
  disableColumnResize?: boolean;
  disableColumnReorder?: boolean;
  /** Hides the menu button in each column header. */
  disableColumnMenu?: boolean;
  /** Removes the pin actions from the column menu. Pinning through `pinnedColumns` and the api still works. */
  disableColumnPinning?: boolean;
  /** Renders every column instead of only the ones in view. Row virtualization is separate. */
  disableColumnVirtualization?: boolean;
  /** Extra columns rendered on each side of the viewport. Defaults to 3. */
  columnBuffer?: number;
  /** Shows a filter row under the column headers. Each cell edits the filter item of its column. */
  headerFilters?: boolean;

  /**
   * Adds a drag handle column so rows can be dragged into a new position, or moved with Alt+Arrow keys from the handle.
   * Reordering is off while sorting, filtering or grouping is active, since the rows then show in another order.
   */
  rowReordering?: boolean;

  /**
   * Lets the user select cells: click, Shift+click or drag for a range, Ctrl/Cmd+click to toggle one cell, Shift+Arrow to extend.
   * Clicking a cell then no longer selects its row. Use the checkbox column for rows.
   */
  cellSelection?: boolean;
  cellSelectionModel?: GridCellSelectionModel;
  onCellSelectionModelChange?: (model: GridCellSelectionModel) => void;
  /** Turns off pasting tab separated text into editable cells with Ctrl/Cmd+V. */
  disableClipboardPaste?: boolean;
  /** Called with the text the user pasted, before it is applied. */
  onClipboardPaste?: (text: string) => void;
  /** Called after a row moved. Indexes count every row in the current order, not only the rows on the page. */
  onRowOrderChange?: (params: { row: R; oldIndex: number; targetIndex: number }) => void;

  editMode?: 'cell' | 'row';
  /** Controls which rows are in edit mode with `editMode="row"`. */
  rowModesModel?: GridRowModesModel;
  onRowModesModelChange?: (model: GridRowModesModel) => void;
  /** Controls which cells are in edit mode with `editMode="cell"`. */
  cellModesModel?: GridCellModesModel;
  onCellModesModelChange?: (model: GridCellModesModel) => void;
  /** Merges cells that hold the same value in consecutive rows into one tall cell. Rows with an open detail panel end a merge. */
  rowSpanning?: boolean;
  /** Called with the edited row before it is committed. Return the row to keep, or throw to reject. */
  processRowUpdate?: (newRow: R, oldRow: R) => R | Promise<R>;
  onProcessRowUpdateError?: (error: unknown) => void;

  /** Shows the built-in toolbar. */
  showToolbar?: boolean;
  slots?: GridSlots;

  treeData?: boolean;
  /**
   * Total number of children of a tree data row. A row with more children than are loaded shows an expander,
   * and `onFetchChildren` is called when it is expanded.
   */
  getChildrenCount?: (row: R) => number;
  /** Called once per row when it is expanded and `getChildrenCount` says children are missing. Add them to `rows` when they arrive. */
  onFetchChildren?: (params: { id: GridRowId; row: R }) => void | Promise<void>;
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
  /** Functions the grid can aggregate with, by key. Replaces the built-in ones, so spread `GRID_AGGREGATION_FUNCTIONS` to keep them. */
  aggregationFunctions?: Readonly<Record<string, GridAggregationFunctionDef>>;

  /**
   * Shows a pivot table of the rows according to `pivotModel`.
   * Filters apply to the source rows first, and sorting applies to the generated rows.
   * While the table shows, row selection, editing, row-based callbacks and props such as `getRowClassName` are off because the rows are generated.
   * Needs client-side rows: it is unavailable with `dataSource` or a server mode.
   */
  pivotActive?: boolean;
  onPivotActiveChange?: (active: boolean) => void;
  pivotModel?: GridPivotModel;
  onPivotModelChange?: (model: GridPivotModel) => void;
  /** Removes the pivot button from the toolbar and ignores `pivotActive`. */
  disablePivoting?: boolean;

  getDetailPanelContent?: (params: { id: GridRowId; row: R }) => ReactNode;
  /** Height of an open detail panel in px. Defaults to 200. */
  getDetailPanelHeight?: (params: { id: GridRowId; row: R }) => number;
  detailPanelExpandedRowIds?: readonly GridRowId[];
  onDetailPanelExpandedRowIdsChange?: (ids: GridRowId[]) => void;

  pinnedRows?: GridPinnedRows<R>;

  onRowClick?: (params: GridRowParams<R>, event: MouseEvent) => void;
  onRowDoubleClick?: (params: GridRowParams<R>, event: MouseEvent) => void;
  onCellClick?: (params: GridCellParams<R>, event: MouseEvent) => void;
  onCellDoubleClick?: (params: GridCellParams<R>, event: MouseEvent) => void;
  onCellKeyDown?: (params: GridCellParams<R>, event: KeyboardEvent) => void;
  onColumnHeaderClick?: (params: GridColumnHeaderParams<R>, event: MouseEvent) => void;
  onCellEditStart?: (params: GridCellEditParams) => void;
  onCellEditStop?: (params: GridCellEditStopParams) => void;
  onRowEditStart?: (params: { id: GridRowId }) => void;
  onRowEditStop?: (params: { id: GridRowId; reason: GridEditStopReason }) => void;
  /** Called once each time the scroll position reaches the bottom. Use it to load the next batch of rows. */
  onRowsScrollEnd?: (params: { visibleRowsCount: number; viewportPageSize: number }) => void;
  /** Distance from the bottom in px at which `onRowsScrollEnd` fires. Defaults to 80. */
  scrollEndThreshold?: number;

  /** Class name added to each row. */
  getRowClassName?: (params: GridRowClassNameParams<R>) => string;
  /** Class name added to each cell. */
  getCellClassName?: (params: GridCellClassNameParams<R>) => string;
  /** Space in px added above and below a row, for example to separate rows into cards. */
  getRowSpacing?: (params: GridRowSpacingParams<R>) => GridRowSpacing;
  /**
   * Height of one row in px. Return `null` to use `rowHeight`, or `'auto'` to size the row to its content, with `rowHeight` as the minimum.
   * Text in auto rows wraps. Column virtualization is off while any row on the page is `'auto'`, and such rows do not merge cells under `rowSpanning`.
   */
  getRowHeight?: (params: GridRowParams<R>) => number | null | undefined | 'auto';
  /** Height assumed for an `'auto'` row until it has been rendered. Close estimates keep the scrollbar steady. Defaults to `rowHeight`. */
  getEstimatedRowHeight?: (params: GridRowParams<R>) => number | null | undefined;
  /** Decides per cell whether it can be edited, on top of the column's `editable`. */
  isCellEditable?: (params: GridCellParams<R>) => boolean;

  slotProps?: GridSlotProps;
  hideFooterPagination?: boolean;
  hideFooterSelectedRowCount?: boolean;
  /** Hides the "Columns" button of the toolbar. */
  disableColumnSelector?: boolean;
  /** Hides the "Density" button of the toolbar. */
  disableDensitySelector?: boolean;
  /** Keeps selected ids that are no longer in `rows`. Defaults to false. */
  keepNonExistentRowsSelected?: boolean;
  /** The header checkbox then selects only the rows on the current page. */
  checkboxSelectionVisibleOnly?: boolean;
  showCellVerticalBorder?: boolean;
  showColumnVerticalBorder?: boolean;
  /** Exports raw cell values instead of the formatted ones. */
  ignoreValueFormatterDuringExport?: boolean;
  /** Called after Ctrl/Cmd+C with the text put on the clipboard. */
  onClipboardCopy?: (text: string) => void;
  /** Turns off copying the selected rows, or the focused cell, with Ctrl/Cmd+C. */
  disableClipboardCopy?: boolean;
  /** Called after a column is auto-sized. */
  onColumnAutosize?: (widths: Record<string, number>) => void;
  /** Turns off double-click on a column border to fit the column to its content. */
  disableAutosize?: boolean;
  /** Options applied to the toolbar's CSV export. */
  csvOptions?: Omit<GridCsvExportOptions, 'getRowsToExport'>;
  /** Options applied to the toolbar's Excel export. */
  excelOptions?: Omit<GridExcelExportOptions, 'getRowsToExport'>;
  /** Hides the Excel export from the toolbar. The api methods still work. */
  disableExcelExport?: boolean;
  /** Options applied to the toolbar's print export. */
  printOptions?: GridPrintExportOptions;
}
