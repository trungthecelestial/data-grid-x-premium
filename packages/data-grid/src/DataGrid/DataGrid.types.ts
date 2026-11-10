import type { SxProps, Theme } from '@mui/material/styles';
import type { ComponentType, CSSProperties, KeyboardEvent, MouseEvent, MutableRefObject, ReactNode } from 'react';

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
  /** The value rows are grouped by when the column is in `rowGroupingModel`. Defaults to the cell value. */
  groupingValueGetter?: (value: any, row: R) => unknown;
  /**
   * Writes a group's value into a row that is dragged into that group. Needed with `groupingValueGetter`.
   * Without a getter, the grid copies the field from a row of the group.
   */
  groupingValueSetter?: (value: unknown, row: R) => R;
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
  /** The grid state changed. `useGridSelector` listens to this. */
  stateChange: [state: GridState];
  sortModelChange: [model: GridSortModel];
  filterModelChange: [model: GridFilterModel];
  paginationModelChange: [model: GridPaginationModel];
  rowSelectionChange: [model: GridRowSelectionModel];
  columnVisibilityModelChange: [model: GridColumnVisibilityModel];
  densityChange: [density: GridDensity];
  columnOrderChange: [params: { orderedFields: string[] }];
  columnWidthChange: [params: { field: string; width: number }];
  pinnedColumnsChange: [model: GridPinnedColumns];
  rowGroupingModelChange: [model: string[]];
  aggregationModelChange: [model: GridAggregationModel];
  detailPanelsExpandedRowIdsChange: [ids: GridRowId[]];
  rowExpansionChange: [params: { id: GridRowId; isExpanded: boolean }];
  cellFocusIn: [params: { id: GridRowId; field: string }];
  columnHeaderFocus: [params: { field: string }];
  /** An undo step was applied. `rows` holds each changed row as it is now. */
  undo: [params: GridHistoryEventParams];
  redo: [params: GridHistoryEventParams];
}

export type GridEventName = keyof GridEventMap;

/** A snapshot of the grid, rebuilt when something in it changes. Read it with the `grid*Selector` functions or `useGridSelector`. */
export interface GridState {
  rows: {
    /** Every row id, in the order of `rows`. */
    ids: GridRowId[];
    totalRowCount: number;
    lookup: Readonly<Record<string, GridValidRowModel>>;
  };
  sorting: { sortModel: GridSortModel; sortedRowIds: GridRowId[] };
  filter: { filterModel: GridFilterModel; filteredRowIds: GridRowId[] };
  pagination: { paginationModel: GridPaginationModel; rowCount: number };
  /** Ids of the rows on the current page, in display order, expanded children included. */
  visibleRowIds: GridRowId[];
  columns: {
    orderedFields: string[];
    columnVisibilityModel: GridColumnVisibilityModel;
    lookup: Readonly<Record<string, GridColDef<any>>>;
    /** Fields of the columns that show, generated ones such as the checkbox column included. */
    visibleFields: string[];
    dimensions: Readonly<Record<string, { width: number }>>;
  };
  pinnedColumns: GridPinnedColumns;
  density: GridDensity;
  rowSelection: GridRowSelectionModel;
  cellSelection: GridCellSelectionModel;
  aggregation: { model: GridAggregationModel };
  rowGrouping: { model: string[] };
  pivoting: { active: boolean; model: GridPivotModel };
  charts: { model: GridChartsModel };
  detailPanel: { expandedRowIds: GridRowId[] };
  editing: { id: GridRowId; field: string | null; values: Record<string, unknown> } | null;
  focus: { cell: { id: GridRowId; field: string } | null; columnHeader: { field: string } | null };
  preferencePanel: { open: boolean; openedPanelValue: 'filters' | 'columns' | 'pivot' | 'charts' | null };
  columnMenu: { open: boolean; field: string | null };
}

export interface GridHistoryEventParams {
  rows: { id: GridRowId; row: GridValidRowModel }[];
}

/** Undo and redo of cell edits, row edits and pasted cells. */
export interface GridHistoryApi {
  /** Reverts the latest change. Resolves to false when there is nothing to undo, or the rows changed since. */
  undo: () => Promise<boolean>;
  /** Applies the latest undone change again. */
  redo: () => Promise<boolean>;
  canUndo: () => boolean;
  canRedo: () => boolean;
  /** Empties both stacks. */
  clear: () => void;
}

/** A group as `isGroupExpandedByDefault` and `getAggregationPosition` see it. The grand total is the root, with depth -1. */
export interface GridGroupNode {
  id: GridRowId;
  /** -1 for the root, 0 for top level groups. */
  depth: number;
  /** The column a row grouping group groups by. `null` for tree data and the root. */
  groupingField: string | null;
  /** The group's value, or its path segment in tree data. `null` for the root. */
  groupingKey: string | null;
  /** Number of data rows below the group. */
  childrenCount: number;
}

/** Where a group shows its aggregated values: on its own row, in a footer row under its children, or nowhere. */
export type GridAggregationPosition = 'inline' | 'footer' | null;

export type GridGroupingColDefOverride<R extends GridValidRowModel = GridValidRowModel> = Partial<GridColDef<R>> & {
  /** Leaves out the `(count)` after a group's label. */
  hideDescendantCount?: boolean;
  /** Field whose value the grouping column shows on data rows, which otherwise leave it empty. */
  leafField?: string;
};

/** The one column of the list view. It spans the grid's width and renders the whole row. */
export interface GridListViewColDef<R extends GridValidRowModel = GridValidRowModel>
  extends Omit<GridColDef<R>, 'renderCell' | 'width' | 'flex'> {
  renderCell: (params: GridRenderCellParams<R>) => ReactNode;
}

export type GridChartType = 'column' | 'bar' | 'line' | 'area' | 'pie' | 'scatter';

export interface GridChartsModel {
  type: GridChartType;
  /** The column whose values label the categories. Defaults to the first column that is not a number, or the group name when rows are grouped. */
  categoryField?: string;
  /** Number columns to draw, one series each. Scatter plots the first against the second. */
  series: string[];
}

export interface GridChartData {
  categories: string[];
  series: { field: string; label: string; values: (number | null)[] }[];
  /** True when more categories existed than the chart draws. */
  truncated: boolean;
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
  pivoting?: { enabled?: boolean; model?: GridPivotModel };
  charts?: { model?: GridChartsModel };
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
  filterPanelDeleteFilter: string;
  filterPanelLogicOperator: string;
  /** Example shown in the input of the "is any of" operator. */
  filterPanelMultiValuePlaceholder: string;
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
  toolbarCharts: string;
  chartsPanelTitle: string;
  chartsType: string;
  chartsCategory: string;
  chartsSeries: string;
  chartsNoSeries: string;
  chartsNoData: string;
  chartsTruncated: (count: number) => string;
  chartsDownload: string;
  chartsAutoCategory: string;
  chartsScatterNeedsTwo: string;
  chartTypeLabel: (type: GridChartType) => string;
  pivotPanelActive: string;
  pivotRows: string;
  pivotColumns: string;
  pivotValues: string;
  pivotAddField: string;
  pivotMoveUp: string;
  pivotMoveDown: string;
  pivotRemove: string;
  pivotTotal: string;
  /** Heading of the pivot panel's unused fields, which can be dragged into rows, columns or values. */
  pivotFields: string;
  toolbarUndo: string;
  toolbarRedo: string;
  /** Label of a group's aggregation footer row. */
  groupFooterLabel: (groupLabel: string) => string;
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
  /** Opens the charts panel under the given element. Omitted when charts are not available. */
  onOpenChartsPanel?: (anchor: HTMLElement) => void;
  /** Present when undo is available. */
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  /** Keeps the filter panel to one filter at a time. */
  disableMultipleColumnsFiltering?: boolean;
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
  /** Hides "Add filter" once there is a filter. */
  disableMultipleFilters?: boolean;
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

export interface GridChartsPanelSlotProps<R extends GridValidRowModel = GridValidRowModel> {
  /** The columns a series can draw. */
  seriesColumns: readonly GridColDef<R>[];
  /** The columns that can label categories. */
  categoryColumns: readonly GridColDef<R>[];
  /** Set when the rows are grouped: categories are the groups, so `categoryField` has no effect. */
  grouped: boolean;
  model: GridChartsModel;
  onModelChange: (model: GridChartsModel) => void;
  data: GridChartData;
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
  chartsPanel?: ComponentType<GridChartsPanelSlotProps<any>>;
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
  chartsPanel?: Record<string, unknown>;
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
  /** Prefixes text starting with `=`, `+`, `-`, `@`, tab or carriage return with `'`, so spreadsheets do not run it as a formula. Defaults to true. */
  escapeFormulas?: boolean;
  /** Picks the rows to export. Defaults to every filtered row. */
  getRowsToExport?: (params: { apiRef: GridApi }) => GridRowId[];
}

/** A subset of the exceljs cell style, so styles written for MUI X carry over. Colors are ARGB (`FF1976D2`) or RGB hex. */
export interface GridExcelCellStyle {
  /** Excel number format, such as `'#,##0.00'` or `'yyyy-mm-dd'`. */
  numFmt?: string;
  font?: { bold?: boolean; italic?: boolean; underline?: boolean; size?: number; color?: { argb: string } };
  fill?: { type?: 'pattern'; pattern?: 'solid'; fgColor?: { argb: string } };
  alignment?: { horizontal?: 'left' | 'center' | 'right'; vertical?: 'top' | 'middle' | 'bottom'; wrapText?: boolean };
}

export interface GridExcelExportOptions {
  /** Styles for the cells of each column, by field. */
  columnsStyles?: Record<string, GridExcelCellStyle>;
  /**
   * With row grouping or tree data, writes the groups as rows of their own with their aggregates, and nests the rows below them
   * in Excel outline levels that can be collapsed. Defaults to true.
   */
  includeRowGroups?: boolean;
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
  getChartsModel: () => GridChartsModel;
  /** Does nothing unless `chartsIntegration` is on. */
  setChartsModel: (model: GridChartsModel) => void;
  /** The data the chart draws for the current rows and model. */
  getChartData: () => GridChartData;
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
  /** Undo and redo of edits and pastes. */
  history: GridHistoryApi;
  /** The current state. Read it through selectors such as `gridSortModelSelector(apiRef)`. */
  state: GridState;
  /** The grid's root element. */
  rootElementRef: { current: HTMLDivElement | null };

  /** Opens the filter panel. With a field, adds a filter for that column when it has none. */
  showFilterPanel: (field?: string) => void;
  hideFilterPanel: () => void;
  /** Opens the filter or the columns panel. */
  showPreferences: (panel: 'filters' | 'columns') => void;
  hidePreferences: () => void;
  showColumnMenu: (field: string) => void;
  hideColumnMenu: () => void;
  toggleColumnMenu: (field: string) => void;
  /** Adds a filter item, or replaces the one with the same `id`. */
  upsertFilterItem: (item: GridFilterItem) => void;
  upsertFilterItems: (items: GridFilterItem[]) => void;
  /** Removes the filter item with the same `id`, or the same field when it has no id. */
  deleteFilterItem: (item: GridFilterItem) => void;
  setFilterLogicOperator: (operator: GridLogicOperator) => void;
  /** Sorts by one column. `allowMultipleSorting` keeps the other sorted columns. A `null` direction removes the column from the sort. */
  sortColumn: (field: string, direction: GridSortDirection, allowMultipleSorting?: boolean) => void;
  /** Rows in sorted order, ignoring filters and pagination. */
  getSortedRowIds: () => GridRowId[];
  getSortedRows: () => GridValidRowModel[];
  /** The id of the row at an index of the rows on the current page. */
  getRowIdFromRowIndex: (index: number) => GridRowId | undefined;
  setColumnVisibilityModel: (model: GridColumnVisibilityModel) => void;
  /** Changes the value in an open editor, as if the user typed it. Resolves to false when the cell is not being edited. */
  setEditCellValue: (params: { id: GridRowId; field: string; value: unknown }) => Promise<boolean>;
  getCellMode: (id: GridRowId, field: string) => 'view' | 'edit';
  getRowMode: (id: GridRowId) => 'view' | 'edit';
  getRowParams: (id: GridRowId) => GridRowParams | null;
  getCellParams: (id: GridRowId, field: string) => GridCellParams | null;
  getColumnHeaderParams: (field: string) => GridColumnHeaderParams | null;
  /** The node of a row or group in the row tree, or `null` for an unknown id. */
  getRowNode: (id: GridRowId) => GridRowNode | null;
  /** Ids of the data rows below a group. Filtering and sorting apply only when asked for. */
  getRowGroupChildren: (params: { groupId: GridRowId; applyFiltering?: boolean; applySorting?: boolean }) => GridRowId[];
  /** Adds a field to the row grouping model, at `index` or at the end. */
  addRowGroupingCriteria: (field: string, index?: number) => void;
  removeRowGroupingCriteria: (field: string) => void;
  setRowGroupingCriteriaIndex: (field: string, index: number) => void;
  /** Moves the keyboard focus to a column header. */
  setColumnHeaderFocus: (field: string) => void;
  /** Replaces the rows until the `rows` prop changes. Edits and row order made since are dropped. */
  setRows: (rows: GridValidRowModel[]) => void;
  /** Changes columns by field, and adds the ones with a new field, until the `columns` prop changes. */
  updateColumns: (columns: GridColDef<any>[]) => void;
  /** Selects the rows between two rows of the current page, both included. */
  selectRowRange: (range: { startId: GridRowId; endId: GridRowId }, isSelected?: boolean, resetSelection?: boolean) => void;
  /** Selects the rectangle of cells between two cells of the current page. Needs `cellSelection`. */
  selectCellRange: (start: { id: GridRowId; field: string }, end: { id: GridRowId; field: string }, keepOtherSelected?: boolean) => void;
  setExpandedDetailPanels: (ids: GridRowId[]) => void;
  isColumnPinned: (field: string) => 'left' | 'right' | false;
  /** Distance in px from the start of the row to the start of the column. */
  getColumnPosition: (field: string) => number;
  getRootDimensions: () => GridDimensions;
  getLocaleText: <K extends keyof GridLocaleText>(key: K) => GridLocaleText[K];
  getRowElement: (id: GridRowId) => HTMLElement | null;
  getCellElement: (id: GridRowId, field: string) => HTMLElement | null;
  getColumnHeaderElement: (field: string) => HTMLElement | null;
  /** The value a column shows for a row, through its `valueGetter`. */
  getRowValue: (row: GridValidRowModel, column: GridColDef<any>) => unknown;
  /** The text a column shows for a row, through its `valueFormatter`. */
  getRowFormattedValue: (row: GridValidRowModel, column: GridColDef<any>) => string;
  isRowSelectable: (id: GridRowId) => boolean;
  /** Calls the matching `on*` prop and every `subscribeEvent` listener, as if the grid fired the event. */
  publishEvent: <E extends GridEventName>(event: E, ...args: GridEventMap[E]) => void;
  getAggregationModel: () => GridAggregationModel;
  getRowGroupingModel: () => string[];
  getColumnVisibilityModel: () => GridColumnVisibilityModel;
  /** Expands or collapses every group. */
  setAllRowChildrenExpansion: (isExpanded: boolean) => void;
  subscribeEvent: <E extends GridEventName>(event: E, handler: (...args: GridEventMap[E]) => void) => () => void;
}

export type GridApiRef = MutableRefObject<GridApi>;

export interface GridDimensions {
  /** Size of the scrolling area, without its scrollbars. */
  viewportWidth: number;
  viewportHeight: number;
  /** Width of all columns and height of all rows on the page. */
  contentWidth: number;
  contentHeight: number;
  rowHeight: number;
  columnHeaderHeight: number;
}

/** A row or a group in the row tree. */
export interface GridRowNode {
  id: GridRowId;
  type: 'leaf' | 'group';
  depth: number;
  parent: GridRowId | null;
  /** Ids of the nodes directly below. */
  children: GridRowId[];
  groupingField: string | null;
  groupingKey: string | null;
  childrenExpanded: boolean;
  /** Generated by the grid, without a row of the data. */
  isAutoGenerated: boolean;
}

export interface GridDataSourceGetRowsParams {
  sortModel: GridSortModel;
  filterModel: GridFilterModel;
  paginationModel: GridPaginationModel;
  /** Index of the first requested row. */
  start: number;
  /** Index of the last requested row, inclusive. */
  end: number;
  /** Keys from the top level down to the parent whose children are wanted. Empty for the top level, which is the only paginated level. */
  groupKeys: string[];
  /** Columns the rows are grouped by. With `groupKeys.length < groupFields.length` the response holds group rows. */
  groupFields: string[];
  aggregationModel: GridAggregationModel;
  /**
   * Set while a pivot table shows, with a `dataSource` that has `supportsPivoting`.
   * Group by `pivotModel.rows` (they are also in `groupFields`), return the values of each column path in the fields that
   * `getPivotColumnField` names, and describe the column paths in `pivotColumns`.
   */
  pivotModel?: GridPivotModel;
}

/** One value of a pivot column field, with the values of the next column field below it. */
export interface GridPivotColumnNode {
  key: string;
  /** Header text. Defaults to `key`. */
  label?: string;
  children?: GridPivotColumnNode[];
}

export interface GridDataSourceGetRowsResult<R extends GridValidRowModel = GridValidRowModel> {
  rows: R[];
  /** Total number of rows on the server, across all pages. Leave it out when counting is too costly. */
  rowCount?: number;
  /** Says whether more rows follow when `rowCount` is left out. Defaults to whether the page came back full. */
  pageInfo?: { hasNextPage?: boolean };
  /** A row holding the grand totals, read through `getAggregatedValue`. */
  aggregateRow?: R;
  /** The values of the pivot column fields, as a tree in `pivotModel.columns` order. Needed when pivoting by columns. */
  pivotColumns?: GridPivotColumnNode[];
}

export interface GridDataSourceCache {
  get: (params: GridDataSourceGetRowsParams) => GridDataSourceGetRowsResult<any> | undefined;
  set: (params: GridDataSourceGetRowsParams, response: GridDataSourceGetRowsResult<any>) => void;
  clear: () => void;
}

/** Loads rows from a server. Sorting, filtering and pagination then run on the server, and so do grouping, tree data and aggregation where the callbacks below are given. */
export interface GridDataSource<R extends GridValidRowModel = GridValidRowModel> {
  getRows: (params: GridDataSourceGetRowsParams) => Promise<GridDataSourceGetRowsResult<R>>;
  /** Called when `getRows` rejects. */
  onError?: (error: unknown, params: GridDataSourceGetRowsParams) => void;
  /** Key of a group or tree row among its siblings. Needed, with `getChildrenCount`, for the server to nest rows. */
  getGroupKey?: (row: R) => string | number;
  /** Number of children of a group or tree row. Rows with children get an expander that loads them on demand. */
  getChildrenCount?: (row: R) => number;
  /** Reads a server-calculated aggregate from a row. Without it, aggregation runs over the loaded rows only. */
  getAggregatedValue?: (row: R, field: string) => unknown;
  /** Saves an edited row. Return the stored row, or nothing to keep the edit as it is. Reject to refuse the edit. */
  updateRow?: (params: { rowId: GridRowId; updatedRow: R; previousRow: R }) => Promise<R | void>;
  /** Turns on the pivot table for this data source. `getRows` then receives `pivotModel` and does the pivoting. */
  supportsPivoting?: boolean;
  /**
   * The row field that holds the value of `field` aggregated with `aggFunc` under one column path.
   * Defaults to the path and the field joined with `>->`, as in `2024>->North>->salary`.
   */
  getPivotColumnField?: (params: { columnPath: string[]; field: string; aggFunc: GridAggregationFunction }) => string;
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
  /** Stores `dataSource` responses, for five minutes by default. Pass `null` to always ask the server. `apiRef.refetch` and saved edits clear it. */
  dataSourceCache?: GridDataSourceCache | null;
  /**
   * With `dataSource`: replaces the pages with one long list that loads rows as they scroll into view, in batches of the page size.
   * Unavailable while the server nests rows through grouping or tree data.
   */
  lazyLoading?: boolean;
  /** Time in ms between lazy loading requests while scrolling. Defaults to 300. */
  lazyLoadingRequestThrottleMs?: number;
  /** Returns the unique id of a row. Defaults to `row.id`. */
  getRowId?: (row: R) => GridRowId;
  apiRef?: GridApiRef;
  initialState?: GridInitialState;
  loading?: boolean;
  localeText?: Partial<GridLocaleText>;
  sx?: SxProps<Theme>;
  /** Added to the root next to `MuiDataGrid-root`. */
  className?: string;
  style?: CSSProperties;

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
  /** `'withModifierKey'` (default) adds a column to the sort with Shift or Ctrl/Cmd+click. `'always'` adds it on any click. */
  multipleColumnsSortingMode?: 'withModifierKey' | 'always';

  filterModel?: GridFilterModel;
  onFilterModelChange?: (model: GridFilterModel) => void;
  filterMode?: 'client' | 'server';
  /** Waits this long after the last filter change before filtering the rows. Defaults to 0. */
  filterDebounceMs?: number;
  /** Matches text regardless of accents, so `cafe` finds `Café`. */
  ignoreDiacritics?: boolean;
  /** Allows one filter at a time. A new filter replaces the current one. */
  disableMultipleColumnsFiltering?: boolean;

  /** Defaults to true. */
  pagination?: boolean;
  paginationModel?: GridPaginationModel;
  onPaginationModelChange?: (model: GridPaginationModel) => void;
  paginationMode?: 'client' | 'server';
  /** Total row count when `paginationMode` is `server`. */
  rowCount?: number;
  /** Page sizes to offer. Use `{ value: -1, label: 'All' }` for an option that shows every row. */
  pageSizeOptions?: readonly (number | GridPageSizeOption)[];
  /** Sets the page size to the number of rows that fit the grid's height, and hides the page size choice. */
  autoPageSize?: boolean;
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
  /** Height of the header filter row. Defaults to the column header height. */
  headerFilterHeight?: number;

  /**
   * Adds a drag handle column so rows can be dragged into a new position, or moved with Alt+Arrow keys from the handle.
   * Reordering is off while sorting or filtering is active, since the rows then show in another order. With tree data or row grouping a row moves among the rows of its own parent.
   */
  rowReordering?: boolean;
  /** Turns off the drag handle of single rows. */
  isRowReorderable?: (params: { id: GridRowId; row: R }) => boolean;

  /**
   * Lets the user select cells: click, Shift+click or drag for a range, Ctrl/Cmd+click to toggle one cell, Shift+Arrow to extend.
   * Clicking a cell then no longer selects its row. Use the checkbox column for rows.
   */
  cellSelection?: boolean;
  cellSelectionModel?: GridCellSelectionModel;
  onCellSelectionModelChange?: (model: GridCellSelectionModel) => void;
  /** Turns off pasting tab separated text into editable cells with Ctrl/Cmd+V. */
  disableClipboardPaste?: boolean;
  /** Splits pasted text into rows and cells. Return `null` to ignore the paste. Defaults to a tab separated parser that understands quoted cells. */
  splitClipboardPastedText?: (text: string, delimiter: string) => string[][] | null;
  /** Separates the cells of copied rows, and of pasted text with the default parser. Defaults to a tab. */
  clipboardCopyCellDelimiter?: string;
  /**
   * Number of edits, row edits and pastes that Ctrl/Cmd+Z can undo. Ctrl/Cmd+Shift+Z and Ctrl+Y redo.
   * Undoing calls `processRowUpdate` with the earlier row. `0` turns history off. Defaults to 30.
   */
  historyStackSize?: number;
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
  /** Writes a new path into a row, so tree rows can be dragged to another parent. The row's descendants get theirs too. */
  setTreeDataPath?: (path: string[], row: R) => R;
  /** Expansion depth of groups on first render. `-1` expands everything. Defaults to 0. */
  defaultGroupingExpansionDepth?: number;
  /** Decides whether a group starts expanded. Takes over from `defaultGroupingExpansionDepth`. */
  isGroupExpandedByDefault?: (node: GridGroupNode) => boolean;
  /** Overrides for the grouping column. The function form receives the field of the column in `'multiple'` mode. */
  groupingColDef?:
    | GridGroupingColDefOverride<R>
    | ((params: { groupingField: string | null; fields: readonly string[] }) => GridGroupingColDefOverride<R> | undefined);
  /** `'single'` (default) shows every row grouping level in one column, `'multiple'` gives each grouped field its own column. */
  rowGroupingColumnMode?: 'single' | 'multiple';
  /** Tree data: filters only the top level rows, and keeps every child of a matching row. */
  disableChildrenFiltering?: boolean;
  /** Tree data: sorts only the top level rows, and keeps children in their order. */
  disableChildrenSorting?: boolean;
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
  /** Aggregates the rows that pass the filters (`'filtered'`, the default) or every row (`'all'`). */
  aggregationRowsScope?: 'filtered' | 'all';
  /**
   * Where each group shows its aggregates. The root (depth -1) is the grand total in the footer: anything but `null` shows it.
   * Defaults to `'footer'` for the root and `'inline'` for groups.
   */
  getAggregationPosition?: (node: GridGroupNode) => GridAggregationPosition;

  /** Shows each row as one full-width cell rendered by `listViewColumn`, without column headers. Suits narrow screens. */
  listView?: boolean;
  listViewColumn?: GridListViewColDef<R>;

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
  /**
   * Adds a Charts button to the toolbar. Its panel plots the rows as they show: filtered, sorted, grouped with their aggregates, or pivoted.
   * Charts are drawn as SVG by the grid, with no chart library needed.
   */
  chartsIntegration?: boolean;
  chartsModel?: GridChartsModel;
  onChartsModelChange?: (model: GridChartsModel) => void;
  /** Removes the pivot button from the toolbar and ignores `pivotActive`. */
  disablePivoting?: boolean;
  /**
   * Extra fields a column offers to the pivot panel, such as the year of a date.
   * Defaults to a year and a quarter field for date columns. Return `undefined` or `[]` for none.
   */
  getPivotDerivedColumns?: (column: GridColDef<R>) => GridColDef<R>[] | undefined;
  /** Overrides for the generated value columns of the pivot table. */
  pivotingColDef?:
    | Partial<GridColDef<R>>
    | ((params: { field: string; aggFunc: GridAggregationFunction; columnGroupPath: string[] }) => Partial<GridColDef<R>> | undefined);

  getDetailPanelContent?: (params: { id: GridRowId; row: R }) => ReactNode;
  /** Height of an open detail panel in px. Defaults to 200. */
  /** `'auto'` sizes the panel to its content. */
  getDetailPanelHeight?: (params: { id: GridRowId; row: R }) => number | 'auto';
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
  /** Fits the columns to their content once the grid mounts. */
  autosizeOnMount?: boolean;
  /** Options for `autosizeOnMount` and for double-clicking a column border. */
  autosizeOptions?: GridAutosizeOptions;
  /** Options applied to the toolbar's CSV export. */
  csvOptions?: Omit<GridCsvExportOptions, 'getRowsToExport'>;
  /** Options applied to the toolbar's Excel export. */
  excelOptions?: Omit<GridExcelExportOptions, 'getRowsToExport'>;
  /** Hides the Excel export from the toolbar. The api methods still work. */
  disableExcelExport?: boolean;
  /** Options applied to the toolbar's print export. */
  printOptions?: GridPrintExportOptions;
}
