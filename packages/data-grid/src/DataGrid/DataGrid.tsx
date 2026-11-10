import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import Skeleton from '@mui/material/Skeleton';
import Paper from '@mui/material/Paper';
import Popover from '@mui/material/Popover';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableFooter from '@mui/material/TableFooter';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import { alpha, darken, lighten, useTheme, type Theme } from '@mui/material/styles';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ComponentType,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type MutableRefObject,
  type PointerEvent,
  type ReactNode,
  type ClipboardEvent,
  type UIEvent,
} from 'react';
import { GridCellEditor } from './components/GridCellEditor';
import { GridColumnMenu } from './components/GridColumnMenu';
import { GridPivotPanel } from './components/GridPivotPanel';
import { GridChartsPanel } from './components/GridChartsPanel';
import {
  EMPTY_CHARTS_MODEL,
  buildChartData,
  getChartCategoryColumns,
  getChartSeriesColumns,
  getRowChartPoints,
  sanitizeChartsModel,
  type GridChartPoint,
} from './features/charts';
import { GridColumnsPanel } from './components/GridColumnsPanel';
import { GridFilterPanel } from './components/GridFilterPanel';
import { GridHeaderFilterCell } from './components/GridHeaderFilterCell';
import { GridToolbar } from './components/GridToolbar';
import type {
  DataGridProps,
  GridAggregationModel,
  GridApi,
  GridApiRef,
  GridAutosizeOptions,
  GridCellParams,
  GridColumnHeaderParams,
  GridCellSelectionModel,
  GridColDef,
  GridColumnsPanelSlotProps,
  GridCsvExportOptions,
  GridEditStopReason,
  GridExcelExportOptions,
  GridEventMap,
  GridEventName,
  GridFilterItem,
  GridFilterModel,
  GridGroupingColDefOverride,
  GridFilterPanelSlotProps,
  GridPivotModel,
  GridPivotPanelSlotProps,
  GridChartsPanelSlotProps,
  GridChartData,
  GridChartsModel,
  GridInitialState,
  GridPaginationModel,
  GridPinnedColumns,
  GridPrintExportOptions,
  GridCellModesModel,
  GridDataSource,
  GridEditCellProps,
  GridLoadingVariant,
  GridRowModesModel,
  GridRowId,
  GridRowSelectionModel,
  GridRowSpacing,
  GridRowUpdate,
  GridSortDirection,
  GridState,
  GridToolbarProps,
  GridValidRowModel,
} from './DataGrid.types';
import {
  computeAggregates,
  formatAggregate,
  getAggregationLabel,
  getAvailableAggregationFunctions,
  GRID_AGGREGATION_FUNCTIONS,
} from './features/aggregation';
import {
  computePivot,
  getDefaultPivotDerivedColumns,
  withPivotDerivedColumns,
  EMPTY_PIVOT_MODEL,
  isPivotModelEmpty,
  PIVOT_ROW_ID,
  PIVOT_ROW_PATH,
  type GridPivotResult,
} from './features/pivot';
import { computeAutosizeWidths } from './features/autosize';
import {
  buildGroupHeaderRows,
  DEFAULT_MIN_WIDTH,
  getCellValue,
  getDefaultAlign,
  getFormattedValue,
  moveField,
  reconcileOrder,
  resolveColumnWidths,
} from './features/columns';
import { parseClipboardText, parsePastedValue, SKIP_PASTE } from './features/clipboard';
import { buildCsv, buildPrintHtml, downloadFile, printHtml } from './features/export';
import { buildXlsx, XLSX_MIME_TYPE, type XlsxEntry } from './features/xlsx';
import { countActiveFilters, getColumnFilterOperators, getFilterPredicate, getInitialFilterValue, isFilterable } from './features/filtering';
import { applySortClick, DEFAULT_SORTING_ORDER, getRowComparator } from './features/sorting';
import { toChartNumber } from './features/charts';
import { collectLeafRows, collectRows, flattenTree, type GridTreeNode } from './features/tree';
import { useElementSize } from './hooks/useElementSize';
import { useGridRows } from './hooks/useGridRows';
import { useGridDataSource, type GridServerRows } from './hooks/useGridDataSource';
import { useGridState } from './hooks/useGridState';
import { useMeasuredRowHeights } from './hooks/useMeasuredRowHeights';
import { getOffsets, getVirtualRange } from './hooks/virtualization';
import { DEFAULT_LOCALE_TEXT } from './localeText';
import { cx, gridClasses, resolveStyleOverrides } from './gridClasses';
import { GridApiContext, GridRootPropsContext } from './gridState';

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
const NO_SPACING: Readonly<Required<GridRowSpacing>> = { top: 0, bottom: 0 };
const pageSizeValue = (option: number | { value: number }) => (typeof option === 'number' ? option : option.value);
const DEFAULT_HEIGHT = 400;
const DEFAULT_DETAIL_HEIGHT = 200;
/** Operator icon (26px), gap, cell padding and about 66px of input. */
const HEADER_FILTER_MIN_WIDTH = 116;
const CHECKBOX_FIELD = '__check__';
const DETAIL_FIELD = '__detail_panel_toggle__';
const TREE_GROUP_FIELD = '__tree_data_group__';
const ROW_GROUP_FIELD = '__row_group_by_columns_group__';
const REORDER_FIELD = '__reorder__';
/** In `'multiple'` grouping column mode each grouped field gets a column named after it. */
const ROW_GROUP_FIELD_PREFIX = '__row_group_by_columns_group_field_';
const SPECIAL_FIELDS = new Set([REORDER_FIELD, CHECKBOX_FIELD, DETAIL_FIELD, TREE_GROUP_FIELD, ROW_GROUP_FIELD]);
const isRowGroupField = (field: string) => field === ROW_GROUP_FIELD || field.startsWith(ROW_GROUP_FIELD_PREFIX);
const isSpecialField = (field: string) => SPECIAL_FIELDS.has(field) || field.startsWith(ROW_GROUP_FIELD_PREFIX);
const LIST_VIEW_FIELD = '__list_view__';
/** The first column of a grouped Excel export, which holds the group labels. */
const EXPORT_GROUP_FIELD = '__export_group__';
/** Key of a detail panel in the measured heights, which share their map with rows. */
const detailKey = (id: GridRowId) => `\u0000detail\u0000${String(id)}`;
const DEFAULT_HISTORY_STACK_SIZE = 30;

/** True when both rows hold the same values, so a history step still matches what the grid shows. */
const sameRow = (a: GridValidRowModel, b: GridValidRowModel) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const left = a[key];
    const right = b[key];
    if (left !== right && !(left instanceof Date && right instanceof Date && left.getTime() === right.getTime())) {
      return false;
    }
  }
  return true;
};

/** Lags a value by `delay` milliseconds. A delay of 0 passes it straight through. */
function useDebouncedValue<V>(value: V, delay: number): V {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    if (delay <= 0) {
      return undefined;
    }
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return delay <= 0 ? value : debounced;
}

const DENSITY_HEIGHTS = {
  compact: { row: 36, header: 40 },
  standard: { row: 52, header: 56 },
  comfortable: { row: 68, header: 64 },
} as const;

const EMPTY_ARRAY: readonly never[] = [];
const EMPTY_STRINGS: readonly string[] = [];
const EMPTY_OBJECT: Readonly<Record<string, never>> = {};
const EMPTY_MAP = new Map<never, never>();
const EMPTY_SET: ReadonlySet<never> = new Set<never>();
const DEFAULT_FONT = '14px Roboto, Helvetica, Arial, sans-serif';
const DEFAULT_FILTER_MODEL: GridFilterModel = { items: [] };

// Same derivation MUI X uses for its grid borders, so the lines match the divider colour of any theme.
// Themes with CSS variables keep `palette.mode` on the default scheme, so the dark value goes through `applyStyles`.
const getBorderVariables = (theme: Theme) => {
  const schemes = (theme as { colorSchemes?: Record<string, { palette?: { divider?: string } } | undefined> }).colorSchemes;
  const lightDivider = schemes?.light?.palette?.divider ?? theme.palette.divider;
  const darkDivider = schemes?.dark?.palette?.divider ?? theme.palette.divider;
  return {
    '--TstackDataGrid-border': lighten(alpha(lightDivider, 1), 0.88),
    ...theme.applyStyles('dark', { '--TstackDataGrid-border': darken(alpha(darkDivider, 1), 0.68) }),
  };
};

const defaultGetRowId =(row: GridValidRowModel): GridRowId => row.id;

const ellipsisSx = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;
const wrappingTextSx = { whiteSpace: 'normal', overflowWrap: 'anywhere' } as const;

const JUSTIFY = { left: 'flex-start', center: 'center', right: 'flex-end' } as const;
const capitalize = <S extends string>(value: S) => (value.charAt(0).toUpperCase() + value.slice(1)) as Capitalize<S>;

const menuButtonShownSx = { width: 24, p: 0.25, opacity: 1, mx: 0.25 } as const;

type Entry<R extends GridValidRowModel> =
  | { kind: 'row'; node: GridTreeNode<R> }
  /** `auto` panels are measured, and `height` is the last measured height. */
  | { kind: 'detail'; node: GridTreeNode<R>; height: number; auto?: boolean }
  /** The aggregates of an expanded group whose position is `'footer'`, under its last descendant. */
  | { kind: 'groupFooter'; node: GridTreeNode<R>; height: number };

interface HistoryEntry<R extends GridValidRowModel> {
  changes: { id: GridRowId; before: R; after: R }[];
}

/** Row changes made at runtime (cell edits and `apiRef.updateRows`). They apply on top of `rows` until `rows` changes. */
interface RowUpdates<R extends GridValidRowModel> {
  source: readonly R[];
  map: ReadonlyMap<GridRowId, R>;
  added: readonly R[];
  deleted: ReadonlySet<GridRowId>;
}

type EventListener = (...args: any[]) => void;

interface EditState {
  id: GridRowId;
  /** Set in cell edit mode. Row edit mode edits every editable cell of the row. */
  field?: string;
  values: Record<string, unknown>;
  /** Fields whose `preProcessEditCellProps` flagged the value as invalid. */
  errors?: Record<string, boolean>;
  /** Row edit mode: the field that gets the focus. Defaults to the first editable one. */
  focusField?: string;
}

export function useGridApiRef(): GridApiRef {
  return useRef({} as GridApi);
}

function GridLoadingIndicator({ variant, label }: { variant: GridLoadingVariant; label: string }) {
  if (variant === 'circular-progress') {
    return (
      <Box sx={{ position: 'absolute', inset: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <CircularProgress aria-label={label} />
      </Box>
    );
  }
  if (variant === 'skeleton') {
    return (
      <Box
        role="progressbar"
        aria-label={label}
        sx={{ position: 'absolute', inset: 0, zIndex: 5, p: 2, bgcolor: 'background.paper', opacity: 0.9, overflow: 'hidden' }}
      >
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} variant="text" sx={{ height: 36 }} />
        ))}
      </Box>
    );
  }
  return <LinearProgress aria-label={label} sx={{ position: 'absolute', left: 0, right: 0, top: 0, zIndex: 5 }} />;
}

/** What the pivot layer above the grid hands down. Only present where pivoting is available. */
interface GridPivoting<R extends GridValidRowModel> {
  /** The user's on/off choice. */
  enabled: boolean;
  /** True while the grid is showing generated rows and columns. */
  applied: boolean;
  model: GridPivotModel;
  setEnabled: (enabled: boolean) => void;
  setModel: (model: GridPivotModel) => void;
  sourceColumns: readonly GridColDef<R>[];
  /** The source columns and their derived fields, offered by the pivot panel. */
  pivotColumns: readonly GridColDef<R>[];
  totals: Record<string, unknown> | null;
  rowLabelColumn: GridColDef<R> | null;
  /** Receives the rows with runtime edits applied, so pivoting starts from what the user sees. */
  sourceRowsRef: MutableRefObject<{ source: readonly R[]; rows: readonly R[] } | null>;
}

type DataGridBaseProps<R extends GridValidRowModel> = DataGridProps<R> & { onRefetchRequest?: () => void; pivoting?: GridPivoting<R>; serverRows?: GridServerRows<R> };

function DataGridBase<R extends GridValidRowModel = GridValidRowModel>(props: DataGridBaseProps<R>) {
  const {
    rows,
    columns: columnsProp,
    getRowId = defaultGetRowId as (row: R) => GridRowId,
    apiRef,
    initialState,
    loading = false,
    sx,
    height = DEFAULT_HEIGHT,
    autoHeight = false,
    disableVirtualization = false,
    rowBufferCount = 3,
    sortingMode = 'client',
    sortingOrder = DEFAULT_SORTING_ORDER,
    disableMultipleColumnsSorting = false,
    filterMode = 'client',
    pagination = true,
    paginationMode = 'client',
    rowCount,
    pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
    hideFooter = false,
    checkboxSelection = false,
    disableMultipleRowSelection = false,
    rowSelectionPropagation,
    getChildrenCount,
    onFetchChildren,
    rowSpanning = false,
    loadingVariant = 'linear-progress',
    rowSelection = true,
    disableRowSelectionOnClick = false,
    isRowSelectable,
    columnGroupingModel,
    disableColumnSorting = false,
    disableColumnFilter = false,
    disableColumnResize = false,
    disableColumnReorder = false,
    disableColumnMenu = false,
    disableRowGrouping = false,
    disableAggregation = false,
    editMode = 'cell',
    processRowUpdate,
    onProcessRowUpdateError,
    showToolbar = false,
    slots,
    treeData = false,
    getTreeDataPath,
    defaultGroupingExpansionDepth = 0,
    groupingColDef,
    getDetailPanelContent,
    getDetailPanelHeight,
    pinnedRows,
    getRowClassName,
    getCellClassName,
    getRowHeight,
    getEstimatedRowHeight,
    pivoting,
    serverRows,
    aggregationFunctions = GRID_AGGREGATION_FUNCTIONS,
    isCellEditable,
    slotProps,
    hideFooterPagination = false,
    hideFooterSelectedRowCount = false,
    disableColumnSelector = false,
    disableDensitySelector = false,
    keepNonExistentRowsSelected = false,
    checkboxSelectionVisibleOnly = false,
    showCellVerticalBorder = false,
    showColumnVerticalBorder = false,
    ignoreValueFormatterDuringExport = false,
    disableClipboardCopy = false,
    disableAutosize = false,
    disableColumnPinning = false,
    disableColumnVirtualization = false,
    columnBuffer = 3,
    headerFilters = false,
    rowReordering = false,
    cellSelection: cellSelectionEnabled = false,
    disableClipboardPaste = false,
    getRowSpacing,
    excelOptions,
    disableExcelExport = false,
    scrollEndThreshold = 80,
    csvOptions,
    printOptions,
    multipleColumnsSortingMode = 'withModifierKey',
    filterDebounceMs = 0,
    ignoreDiacritics = false,
    disableMultipleColumnsFiltering = false,
    autoPageSize = false,
    headerFilterHeight,
    isRowReorderable,
    splitClipboardPastedText,
    clipboardCopyCellDelimiter = '\t',
    historyStackSize = DEFAULT_HISTORY_STACK_SIZE,
    isGroupExpandedByDefault,
    rowGroupingColumnMode = 'single',
    disableChildrenFiltering = false,
    disableChildrenSorting = false,
    aggregationRowsScope = 'filtered',
    getAggregationPosition,
    listView = false,
    listViewColumn,
    autosizeOnMount = false,
    autosizeOptions,
  } = props;

  const localeText = useMemo(() => ({ ...DEFAULT_LOCALE_TEXT, ...props.localeText }), [props.localeText]);

  // `apiRef.updateColumns` and `apiRef.setRows` change what the props gave, until the props themselves change.
  const [columnUpdates, setColumnUpdates] = useState<{ source: readonly GridColDef<R>[]; columns: readonly GridColDef<R>[] } | null>(null);
  const userColumns = columnUpdates?.source === columnsProp ? columnUpdates.columns : columnsProp;
  const [replacedRows, setReplacedRows] = useState<{ source: readonly R[]; rows: readonly R[] } | null>(null);
  /** The rows edits apply to: `rows`, or what `apiRef.setRows` put in their place. */
  const baseRows = replacedRows?.source === rows ? replacedRows.rows : rows;

  const [sortModel, setSortModel] = useGridState(
    props.sortModel,
    initialState?.sorting?.sortModel ?? [],
    props.onSortModelChange,
  );
  const [filterModel, setFilterModel] = useGridState(
    props.filterModel,
    initialState?.filter?.filterModel ?? DEFAULT_FILTER_MODEL,
    props.onFilterModelChange,
  );
  const [paginationModel, setPaginationModel] = useGridState<GridPaginationModel>(
    props.paginationModel,
    initialState?.pagination?.paginationModel ?? { page: 0, pageSize: pageSizeValue(pageSizeOptions[0] ?? 10) },
    props.onPaginationModelChange,
  );
  const [selection, setSelectionRaw] = useGridState(
    props.rowSelectionModel,
    initialState?.rowSelection ?? EMPTY_ARRAY,
    props.onRowSelectionModelChange,
  );
  // With `disableMultipleRowSelection` only the most recently selected row is kept.
  const setSelection = useCallback(
    (next: GridRowSelectionModel | ((previous: GridRowSelectionModel) => GridRowSelectionModel)) =>
      setSelectionRaw((previous) => {
        const resolved = typeof next === 'function' ? next(previous) : next;
        return disableMultipleRowSelection && resolved.length > 1 ? resolved.slice(-1) : resolved;
      }),
    [setSelectionRaw, disableMultipleRowSelection],
  );
  const [cellSelection, setCellSelection] = useGridState<GridCellSelectionModel>(
    props.cellSelectionModel,
    EMPTY_OBJECT as GridCellSelectionModel,
    props.onCellSelectionModelChange,
  );
  const [visibilityModel, setVisibilityModel] = useGridState(
    props.columnVisibilityModel,
    initialState?.columns?.columnVisibilityModel ?? EMPTY_OBJECT,
    props.onColumnVisibilityModelChange,
  );
  const [density, setDensity] = useGridState(props.density, initialState?.density ?? 'standard', props.onDensityChange);
  const [pinned, setPinned] = useGridState(props.pinnedColumns, initialState?.pinnedColumns ?? EMPTY_OBJECT, props.onPinnedColumnsChange);
  const [detailIds, setDetailIds] = useGridState<readonly GridRowId[]>(
    props.detailPanelExpandedRowIds,
    EMPTY_ARRAY,
    props.onDetailPanelExpandedRowIdsChange as ((ids: readonly GridRowId[]) => void) | undefined,
  );

  const [storedAggregationModel, setAggregationModel] = useGridState<GridAggregationModel>(
    props.aggregationModel,
    initialState?.aggregation?.model ?? EMPTY_OBJECT,
    props.onAggregationModelChange,
  );
  const [rowGroupingModel, setRowGroupingModel] = useGridState<readonly string[]>(
    props.rowGroupingModel,
    initialState?.rowGrouping?.model ?? EMPTY_STRINGS,
    props.onRowGroupingModelChange as ((model: readonly string[]) => void) | undefined,
  );
  const [storedChartsModel, setChartsModel] = useGridState<GridChartsModel>(
    props.chartsModel,
    initialState?.charts?.model ?? EMPTY_CHARTS_MODEL,
    props.onChartsModelChange,
  );
  const chartsEnabled = Boolean(props.chartsIntegration);
  const [columnMenu, setColumnMenu] = useState<{ field: string; anchor: HTMLElement } | null>(null);
  const [menuPanel, setMenuPanel] = useState<{ kind: 'filter' | 'columns' | 'pivot' | 'charts'; anchor: HTMLElement } | null>(null);

  const [columnOrder, setColumnOrder] = useState<string[]>(
    () => initialState?.columns?.orderedFields ?? userColumns.map((column) => column.field),
  );
  const [widthOverrides, setWidthOverrides] = useState<Record<string, number>>(() =>
    Object.fromEntries(Object.entries(initialState?.columns?.dimensions ?? {}).map(([field, { width }]) => [field, width])),
  );
  const [expansion, setExpansion] = useState<ReadonlyMap<GridRowId, boolean>>(EMPTY_MAP);
  const [rowUpdates, setRowUpdates] = useState<RowUpdates<R>>({
    source: rows,
    map: EMPTY_MAP,
    added: EMPTY_ARRAY,
    deleted: EMPTY_SET,
  });
  const [rowOrder, setRowOrder] = useState<{ source: readonly R[]; ids: readonly GridRowId[] } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: GridRowId; after: boolean } | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const validationTokensRef = useRef<Record<string, number>>({});
  const [focusPosition, setFocusPosition] = useState<{ row: number; col: number } | null>(null);
  /** The column header that holds the grid's tab stop, while the focus is in the header row. */
  const [headerFocusCol, setHeaderFocusCol] = useState<number | null>(null);
  const shouldFocusHeaderRef = useRef(false);
  const theme = useTheme();
  const isRtl = theme.direction === 'rtl';
  // Styles from `theme.components.MuiDataGrid.styleOverrides`, keyed by the slots of `gridClasses`.
  const themeOverrides = (theme.components as Record<string, { styleOverrides?: Record<string, unknown> } | undefined> | undefined)?.MuiDataGrid
    ?.styleOverrides;
  // An arrow pointing at the content flips with the reading direction.
  const collapsedIconSx = useMemo(() => (isRtl ? { transform: 'scaleX(-1)' } : undefined), [isRtl]);
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const rootElementRef = useRef<HTMLDivElement>(null);
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const committingRef = useRef(false);
  const shouldFocusRef = useRef(false);
  const lastSelectedRef = useRef<GridRowId | null>(null);
  const dragFieldRef = useRef<string | null>(null);
  const dragRowRef = useRef<GridRowId | null>(null);
  // The reorder handle lives in a memoized column, so it calls the latest move through this ref.
  const moveRowByRef = useRef<(id: GridRowId, step: number) => void>(() => undefined);
  const moveRowAcrossRef = useRef<(id: GridRowId, key: 'up' | 'down' | 'indent' | 'outdent') => void>(() => undefined);
  const cellAnchorRef = useRef<{ row: number; col: number } | null>(null);
  const draggingCellsRef = useRef(false);
  const pendingFocusRowRef = useRef<GridRowId | null>(null);
  const listenersRef = useRef(new Map<GridEventName, Set<EventListener>>());
  const eventPropsRef = useRef<Partial<Record<GridEventName, EventListener | undefined>>>({});
  eventPropsRef.current = {
    rowClick: props.onRowClick,
    rowDoubleClick: props.onRowDoubleClick,
    cellClick: props.onCellClick,
    cellDoubleClick: props.onCellDoubleClick,
    cellKeyDown: props.onCellKeyDown,
    columnHeaderClick: props.onColumnHeaderClick,
    cellEditStart: props.onCellEditStart,
    cellEditStop: props.onCellEditStop,
    rowEditStart: props.onRowEditStart,
    rowEditStop: props.onRowEditStop,
    rowsScrollEnd: props.onRowsScrollEnd,
  };
  const atScrollEndRef = useRef(false);

  // Calls the matching `on*` prop first, then every `apiRef.subscribeEvent` listener.
  const emit = useCallback(<E extends GridEventName>(name: E, ...args: GridEventMap[E]) => {
    eventPropsRef.current[name]?.(...args);
    listenersRef.current.get(name)?.forEach((listener) => listener(...args));
  }, []);

  const { width: containerWidth, height: containerHeight } = useElementSize(scrollerRef);

  const heights = DENSITY_HEIGHTS[density];
  const rowHeight = props.rowHeight ?? heights.row;
  const headerHeight = props.columnHeaderHeight ?? heights.header;
  const filterRowHeight = headerFilterHeight ?? headerHeight;

  const mergedRows = useMemo(() => {
    let result: readonly R[] = baseRows;
    if (rowUpdates.source === rows) {
      const { map, added, deleted } = rowUpdates;
      if (map.size > 0 || added.length > 0 || deleted.size > 0) {
        const all = added.length > 0 ? [...baseRows, ...added] : baseRows;
        result = all.flatMap((row) => {
          const id = getRowId(row);
          return deleted.has(id) ? [] : [map.get(id) ?? row];
        });
      }
    }
    if (rowOrder && rowOrder.source === rows) {
      // Rows the order does not know, such as ones added later, keep their place after the ordered ones.
      const position = new Map(rowOrder.ids.map((id, index) => [id, index]));
      result = [...result].sort((a, b) => (position.get(getRowId(a)) ?? Infinity) - (position.get(getRowId(b)) ?? Infinity) || 0);
    }
    return result;
  }, [rows, baseRows, rowUpdates, rowOrder, getRowId]);

  const isPivoted = pivoting?.applied ?? false;
  const serverAggregated = Boolean(serverRows?.getAggregatedValue);
  if (pivoting && !isPivoted) {
    pivoting.sourceRowsRef.current = { source: rows, rows: mergedRows };
  }

  const rowsById = useMemo(() => new Map(mergedRows.map((row) => [getRowId(row), row])), [mergedRows, getRowId]);

  // Grouped rows and tree data move among the rows of their own parent. Server-side groups load per parent, so they stay put.
  const canReorder =
    rowReordering &&
    sortModel.length === 0 &&
    countActiveFilters(filterModel) === 0 &&
    !serverRows?.groupsByColumns &&
    !(treeData && serverRows) &&
    paginationMode === 'client';

  const moveRow = useCallback(
    (id: GridRowId, targetIndex: number) => {
      const ids = mergedRows.map(getRowId);
      const oldIndex = ids.indexOf(id);
      const newIndex = Math.max(0, Math.min(ids.length - 1, targetIndex));
      const row = rowsById.get(id);
      if (oldIndex === -1 || oldIndex === newIndex || !row) {
        return;
      }
      const next = [...ids];
      next.splice(oldIndex, 1);
      next.splice(newIndex, 0, id);
      setRowOrder({ source: rows, ids: next });
      props.onRowOrderChange?.({ row, oldIndex, targetIndex: newIndex });
    },
    [mergedRows, getRowId, rowsById, rows, props.onRowOrderChange],
  );

  const userColumnMap = useMemo(
    () => new Map<string, GridColDef<R>>(userColumns.map((column) => [column.field, column])),
    [userColumns],
  );

  // Models can name functions that are not registered or columns that opted out, and those simply do not aggregate.
  const aggregationModel = useMemo<GridAggregationModel>(
    () =>
      Object.fromEntries(
        Object.entries(storedAggregationModel).filter(([field, fn]) => aggregationFunctions[fn] && userColumnMap.get(field)?.aggregable !== false),
      ),
    [storedAggregationModel, aggregationFunctions, userColumnMap],
  );

  const effectiveVisibility = useMemo(
    () => ({ ...Object.fromEntries(rowGroupingModel.map((field) => [field, false])), ...visibilityModel }),
    [rowGroupingModel, visibilityModel],
  );

  // Generated columns follow the pivot model. The order the user chose for the source columns waits for when pivoting ends.
  const orderedFields = useMemo(
    () => (isPivoted ? userColumns.map((column) => column.field) : reconcileOrder(columnOrder, userColumns)),
    [isPivoted, columnOrder, userColumns],
  );

  const visibleUserColumns = useMemo(
    () =>
      orderedFields.flatMap((field) => {
        const column = userColumnMap.get(field);
        return column && effectiveVisibility[field] !== false ? [column] : [];
      }),
    [orderedFields, userColumnMap, effectiveVisibility],
  );

  const appliedFilterModel = useDebouncedValue(filterModel, filterDebounceMs);

  const { pageNodes, roots, allRoots, rootCount, page, filteredRows, nodeAggregates, aggregationPositions, footerAggregates, isExpanded, isGroup } = useGridRows(
    {
      rows: mergedRows,
      getRowId,
      columnsByField: userColumnMap,
      quickFilterColumns: visibleUserColumns,
      sortModel,
      filterModel: appliedFilterModel,
      sortingMode,
      filterMode,
      treeData,
      getTreeDataPath,
      rowGroupingModel,
      expansion,
      ignoreDiacritics,
      disableChildrenFiltering,
      disableChildrenSorting,
      aggregationRowsScope,
      getAggregationPosition,
      isGroupExpandedByDefault,
      defaultExpansionDepth: defaultGroupingExpansionDepth,
      pagination,
      paginationMode,
      page: paginationModel.page,
      pageSize: paginationModel.pageSize,
      // Pivot cells and server aggregates arrive calculated. Aggregating the loaded rows again would give wrong totals.
      aggregationModel: isPivoted || serverAggregated ? EMPTY_OBJECT : aggregationModel,
      aggregationFunctions,
      isGroupRow: serverRows?.groupsByColumns ? serverRows.isGroupRow : undefined,
      isPlaceholderRow: serverRows?.isPlaceholderRow,
    },
  );

  const nodeById = useMemo(() => new Map(pageNodes.map((node) => [node.id, node])), [pageNodes]);

  // For reordering grouped rows: the sibling list each node sits in, and its parent.
  const siblingIndex = useMemo(() => {
    const index = new Map<GridRowId, { parent: GridRowId | null; siblings: readonly GridTreeNode<R>[]; node: GridTreeNode<R> }>();
    if (rowReordering && isGroup) {
      const visit = (nodes: readonly GridTreeNode<R>[], parent: GridRowId | null) => {
        for (const node of nodes) {
          index.set(node.id, { parent, siblings: nodes, node });
          visit(node.children, node.id);
        }
      };
      visit(roots, null);
    }
    return index;
  }, [rowReordering, isGroup, roots]);

  /** Moves a grouped row to the place of `targetId`, which must share its parent. The rows below it move along. */
  const moveRowAmongSiblings = useCallback(
    (id: GridRowId, targetId: GridRowId) => {
      const entry = siblingIndex.get(id);
      const target = siblingIndex.get(targetId);
      const row = rowsById.get(id);
      if (!entry || !target || entry.parent !== target.parent || id === targetId || !row) {
        return;
      }
      const siblings = [...entry.siblings];
      const oldIndex = siblings.findIndex((node) => node.id === id);
      const targetIndex = siblings.findIndex((node) => node.id === targetId);
      const [moved] = siblings.splice(oldIndex, 1);
      siblings.splice(targetIndex, 0, moved as GridTreeNode<R>);
      // The new row order is the tree read top to bottom, with this one sibling list replaced.
      const ids: GridRowId[] = [];
      const visit = (nodes: readonly GridTreeNode<R>[]) => {
        for (const node of nodes === entry.siblings ? siblings : nodes) {
          if (node.row) {
            ids.push(node.id);
          }
          visit(node.children);
        }
      };
      visit(roots);
      setRowOrder({ source: rows, ids });
      props.onRowOrderChange?.({ row, oldIndex, targetIndex });
    },
    [siblingIndex, rowsById, roots, rows, props.onRowOrderChange],
  );

  /** Moves a row by `step` places: in `rows` for flat rows, among its siblings for grouped ones. */
  const moveRowBy = (id: GridRowId, step: number) => {
    if (isGroup) {
      const entry = siblingIndex.get(id);
      const position = entry ? entry.siblings.findIndex((node) => node.id === id) : -1;
      const target = entry?.siblings[position + step];
      if (target) {
        moveRowAmongSiblings(id, target.id);
      } else {
        moveRowAcrossRef.current(id, step < 0 ? 'up' : 'down');
      }
      return;
    }
    moveRow(id, mergedRows.findIndex((row) => getRowId(row) === id) + step);
  };
  moveRowByRef.current = moveRowBy;
  const isTreeReorder = isGroup && treeData && Boolean(getTreeDataPath);
  /** Whether a dragged row can leave its parent: tree rows need `setTreeDataPath`, grouped rows a way to write each group value. */
  const canChangeParent = isTreeReorder
    ? Boolean(props.setTreeDataPath)
    : isGroup &&
      rowGroupingModel.every((field) => {
        const column = userColumnMap.get(field);
        return column !== undefined && (Boolean(column.groupingValueSetter) || !column.groupingValueGetter);
      });
  const isInSubtree = (ancestorId: GridRowId, id: GridRowId) => {
    for (let current: GridRowId | null | undefined = id; current !== null && current !== undefined; current = siblingIndex.get(current)?.parent) {
      if (current === ancestorId) {
        return true;
      }
    }
    return false;
  };
  /**
   * Whether a dragged row may land on another: always for flat rows, among siblings for grouped ones,
   * and in another group or parent when `canChangeParent`. Grouped rows can be dropped on a group row too, to join that group.
   */
  const canDropRowOn = (id: GridRowId, targetId: GridRowId) => {
    if (!isGroup) {
      return true;
    }
    const entry = siblingIndex.get(id);
    const target = siblingIndex.get(targetId);
    if (!entry || !target) {
      return false;
    }
    if (entry.parent === target.parent && (target.node.row || isTreeReorder)) {
      return true;
    }
    if (!canChangeParent || isInSubtree(id, targetId)) {
      return false;
    }
    // A grouped row moves between leaves, or onto a group of the last level, the one rows sit in.
    return isTreeReorder ? Boolean(target.node.row) : target.node.row ? true : target.node.depth === rowGroupingModel.length - 1;
  };
  /** Position used to tell whether a drop lands above or below the target. */
  const rowOrderPosition = (id: GridRowId) =>
    isGroup ? (siblingIndex.get(id)?.siblings.findIndex((node) => node.id === id) ?? -1) : mergedRows.findIndex((row) => getRowId(row) === id);

  const isAutoHeightRow = useCallback(
    (node: GridTreeNode<R>) => Boolean(node.row && getRowHeight?.({ id: node.id, row: node.row }) === 'auto'),
    [getRowHeight],
  );
  const hasAutoHeightRows = useMemo(() => pageNodes.some(isAutoHeightRow), [pageNodes, isAutoHeightRow]);

  const selectedSet = useMemo(() => new Set(selection), [selection]);
  const isSelectable = useCallback(
    (id: GridRowId, row: R | undefined) =>
      rowSelection && row !== undefined && (isRowSelectable ? isRowSelectable({ id, row }) : true),
    [rowSelection, isRowSelectable],
  );
  const selectableIds = useMemo(() => {
    if (!rowSelection) {
      return [];
    }
    const candidates = checkboxSelectionVisibleOnly
      ? pageNodes.flatMap((node) => (node.row ? [node.row] : []))
      : filteredRows;
    return candidates.flatMap((row) => {
      const id = getRowId(row);
      return isSelectable(id, row) ? [id] : [];
    });
  }, [rowSelection, checkboxSelectionVisibleOnly, pageNodes, filteredRows, getRowId, isSelectable]);

  // Selected ids whose row left `rows` are dropped, unless the consumer keeps them on purpose (for example across server pages).
  useEffect(() => {
    if (!keepNonExistentRowsSelected && selection.some((id) => !rowsById.has(id))) {
      setSelection(selection.filter((id) => rowsById.has(id)));
    }
  }, [rowsById, selection, keepNonExistentRowsSelected, setSelection]);

  const toggleDetail = useCallback(
    (id: GridRowId) => setDetailIds((previous) => (previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id])),
    [setDetailIds],
  );

  const toggleExpansion = useCallback(
    (node: GridTreeNode<R>) => setExpansion((previous) => new Map(previous).set(node.id, !isExpanded(node))),
    [isExpanded],
  );

  const propagateDescendants = Boolean(isGroup && rowSelectionPropagation?.descendants);
  const propagateParents = Boolean(isGroup && rowSelectionPropagation?.parents);

  // Parent links of the whole tree, for selection that moves through it.
  const treeIndex = useMemo(() => {
    const index = new Map<GridRowId, { node: GridTreeNode<R>; parent: GridTreeNode<R> | null }>();
    if (propagateDescendants || propagateParents) {
      const visit = (nodes: readonly GridTreeNode<R>[], parent: GridTreeNode<R> | null) => {
        for (const node of nodes) {
          index.set(node.id, { node, parent });
          visit(node.children, node);
        }
      };
      visit(roots, null);
    }
    return index;
  }, [roots, propagateDescendants, propagateParents]);

  /** Ids of the selectable data rows in a node's subtree, the node's own row included. */
  const subtreeRowIds = useCallback(
    (node: GridTreeNode<R>): GridRowId[] =>
      collectRows(node).flatMap((row) => {
        const rowId = getRowId(row);
        return isSelectable(rowId, row) ? [rowId] : [];
      }),
    [getRowId, isSelectable],
  );

  const toggleSelection = useCallback(
    (id: GridRowId, selected: boolean) => {
      lastSelectedRef.current = id;
      const entry = treeIndex.get(id);
      if (!entry) {
        setSelection((previous) => (selected ? [...previous.filter((item) => item !== id), id] : previous.filter((item) => item !== id)));
        return;
      }
      setSelection((previous) => {
        const next = new Set(previous);
        const change = (rowId: GridRowId) => {
          next.delete(rowId);
          if (selected) {
            next.add(rowId);
          }
        };
        if (propagateDescendants) {
          subtreeRowIds(entry.node).forEach(change);
        } else if (entry.node.row) {
          change(id);
        }
        if (propagateParents) {
          const isNodeSelected = (node: GridTreeNode<R>): boolean =>
            node.children.length === 0 ? next.has(node.id) : node.row ? next.has(node.id) : node.children.every(isNodeSelected);
          for (let parent = entry.parent; parent; parent = treeIndex.get(parent.id)?.parent ?? null) {
            if (parent.row && isSelectable(parent.id, parent.row)) {
              next.delete(parent.id);
              if (parent.children.every(isNodeSelected)) {
                next.add(parent.id);
              }
            }
          }
        }
        return [...next];
      });
    },
    [setSelection, treeIndex, propagateDescendants, propagateParents, subtreeRowIds, isSelectable],
  );

  // Lazy tree children: a row that reports more children than are loaded gets an expander, and expanding it asks the consumer for them once.
  const needsChildren = useCallback(
    (node: GridTreeNode<R>) =>
      treeData && Boolean(getChildrenCount) && node.row !== undefined && getChildrenCount!(node.row) > node.children.length,
    [treeData, getChildrenCount],
  );
  const [fetchingIds, setFetchingIds] = useState<ReadonlySet<GridRowId>>(EMPTY_SET);
  const requestedChildrenRef = useRef(new Set<GridRowId>());
  const serverChildrenKey = serverRows?.childrenKey;
  useEffect(() => requestedChildrenRef.current.clear(), [serverChildrenKey]);
  useEffect(() => {
    if (!onFetchChildren) {
      return;
    }
    for (const node of pageNodes) {
      if (!node.row || requestedChildrenRef.current.has(node.id) || !isExpanded(node) || !needsChildren(node)) {
        continue;
      }
      requestedChildrenRef.current.add(node.id);
      const done = () =>
        setFetchingIds((previous) => {
          const next = new Set(previous);
          next.delete(node.id);
          return next;
        });
      setFetchingIds((previous) => new Set(previous).add(node.id));
      try {
        Promise.resolve(onFetchChildren({ id: node.id, row: node.row })).then(done, done);
      } catch {
        done();
      }
    }
  }, [pageNodes, isExpanded, needsChildren, onFetchChildren]);

  const specialColumns = useMemo<GridColDef<R>[]>(() => {
    const result: GridColDef<R>[] = [];

    if (rowReordering) {
      result.push({
        field: REORDER_FIELD,
        width: 52,
        sortable: false,
        filterable: false,
        hideable: false,
        resizable: false,
        disableReorder: true,
        align: 'center',
        renderHeader: () => null,
        renderCell: ({ id, row }) => {
          // Groups the grid generated have no row to move.
          if (!rowsById.has(id)) {
            return null;
          }
          const movable = canReorder && (!isRowReorderable || isRowReorderable({ id, row }));
          return (
          <IconButton
            size="small"
            tabIndex={-1}
            disabled={!movable}
            draggable={movable}
            aria-label={localeText.rowReorderHandle}
            onClick={(event) => event.stopPropagation()}
            onDragStart={(event) => {
              dragRowRef.current = id;
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', String(id));
              const rowElement = event.currentTarget.closest('tr');
              if (rowElement) {
                event.dataTransfer.setDragImage(rowElement, 0, 0);
              }
            }}
            onDragEnd={() => {
              dragRowRef.current = null;
              setDropTarget(null);
            }}
            onKeyDown={(event) => {
              const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
              // Alt+Shift+Right indents a tree row under the row above, Alt+Shift+Left outdents it. Mirrored right to left.
              const sideways = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
              if (event.altKey && event.shiftKey && sideways !== 0 && movable) {
                event.preventDefault();
                event.stopPropagation();
                pendingFocusRowRef.current = id;
                moveRowAcrossRef.current(id, (isRtl ? -sideways : sideways) > 0 ? 'indent' : 'outdent');
                return;
              }
              if (event.altKey && step !== 0 && movable) {
                event.preventDefault();
                event.stopPropagation();
                pendingFocusRowRef.current = id;
                moveRowByRef.current(id, step);
              }
            }}
            sx={{ cursor: movable ? 'grab' : 'default', '&:active': { cursor: 'grabbing' } }}
          >
            <DragIndicatorIcon fontSize="small" />
          </IconButton>
          );
        },
      });
    }

    if (checkboxSelection) {
      const selectedCount = selectableIds.filter((id) => selectedSet.has(id)).length;
      result.push({
        field: CHECKBOX_FIELD,
        width: 52,
        sortable: false,
        filterable: false,
        hideable: false,
        resizable: false,
        disableReorder: true,
        align: 'center',
        renderHeader: () =>
          disableMultipleRowSelection ? null : (
          <Checkbox
            size="small"
            checked={selectableIds.length > 0 && selectedCount === selectableIds.length}
            indeterminate={selectedCount > 0 && selectedCount < selectableIds.length}
            disabled={selectableIds.length === 0}
            inputProps={{ 'aria-label': localeText.checkboxSelectionHeader }}
            onChange={(event) => setSelection(event.target.checked ? selectableIds : EMPTY_ARRAY)}
          />
          ),
        renderCell: ({ id, row }) => {
          const node = treeIndex.get(id)?.node;
          // With descendant propagation a group shows how many of its rows are selected, and a group without a row of its own is just that.
          const below = propagateDescendants && node && node.children.length > 0 ? subtreeRowIds(node) : null;
          const selectedBelow = below ? below.filter((rowId) => selectedSet.has(rowId)).length : 0;
          return (
            <Checkbox
              size="small"
              checked={below ? below.length > 0 && selectedBelow === below.length : selectedSet.has(id)}
              indeterminate={below ? selectedBelow > 0 && selectedBelow < below.length : false}
              disabled={below ? below.length === 0 : !isSelectable(id, row)}
              tabIndex={-1}
              inputProps={{ 'aria-label': localeText.checkboxSelectionRow }}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => toggleSelection(id, event.target.checked)}
            />
          );
        },
      });
    }

    if (getDetailPanelContent) {
      result.push({
        field: DETAIL_FIELD,
        width: 52,
        sortable: false,
        filterable: false,
        hideable: false,
        resizable: false,
        disableReorder: true,
        align: 'center',
        renderHeader: () => null,
        renderCell: ({ id, row }) => (
          <IconButton
            size="small"
            tabIndex={-1}
            aria-label={localeText.detailPanelToggle}
            aria-expanded={detailIds.includes(id)}
            onClick={(event) => {
              event.stopPropagation();
              toggleDetail(id);
            }}
          >
            {detailIds.includes(id) && getDetailPanelContent({ id, row }) !== undefined ? (
              <KeyboardArrowDownIcon fontSize="small" />
            ) : (
              <KeyboardArrowRightIcon fontSize="small" sx={collapsedIconSx} />
            )}
          </IconButton>
        ),
      });
    }

    if (isGroup) {
      const byRowGrouping = rowGroupingModel.length > 0 && (!treeData || Boolean(serverRows?.groupsByColumns));
      // Server-side groups come as rows, so they keep the single column.
      const multiple = byRowGrouping && rowGroupingColumnMode === 'multiple' && !serverRows?.groupsByColumns;
      const resolveOverride = (groupingField: string | null): GridGroupingColDefOverride<R> =>
        (typeof groupingColDef === 'function' ? groupingColDef({ groupingField, fields: rowGroupingModel }) : groupingColDef) ?? {};

      /** One grouping cell. `forField` limits it to the groups of one field in `'multiple'` mode. */
      const renderGroupingCell = (id: GridRowId, override: GridGroupingColDefOverride<R>, forField: string | null, showLeaf: boolean) => {
        const node = nodeById.get(id);
        if (!node) {
          return null;
        }
        const leafColumn = override.leafField ? userColumnMap.get(override.leafField) : undefined;
        if (forField !== null && node.groupField !== forField) {
          return showLeaf && node.row && !node.groupField && leafColumn ? (
            <Box component="span" sx={ellipsisSx}>
              {getFormattedValue(node.row, leafColumn)}
            </Box>
          ) : null;
        }
        const expandable = node.children.length > 0 || needsChildren(node);
        const serverGroup = node.row && serverRows?.isGroupRow(node.row);
        const descendantCount = serverGroup ? (getChildrenCount?.(node.row as R) ?? 0) : node.rowCount;
        // A server group without children, such as a row of a pivot table, has nothing to count.
        const count = override.hideDescendantCount || (serverGroup && descendantCount === 0) ? '' : ` (${descendantCount})`;
        const label = serverGroup
          ? `${node.label}${count}`
          : byRowGrouping
            ? node.groupField
              ? `${node.label}${count}`
              : node.row && leafColumn
                ? getFormattedValue(node.row, leafColumn)
                : ''
            : node.label;
        return (
          <Box
            className={byRowGrouping ? gridClasses.groupingCriteriaCell : gridClasses.treeDataGroupingCell}
            sx={{ display: 'flex', alignItems: 'center', minWidth: 0, paddingInlineStart: `${forField === null ? node.depth * 20 : 0}px` }}>
            {expandable ? (
              <IconButton
                size="small"
                tabIndex={-1}
                aria-label={localeText.expandCollapse}
                aria-expanded={isExpanded(node)}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleExpansion(node);
                }}
              >
                {fetchingIds.has(node.id) ? (
                  <CircularProgress size={16} aria-label={localeText.loadingLabel} />
                ) : isExpanded(node) ? (
                  <KeyboardArrowDownIcon fontSize="small" />
                ) : (
                  <KeyboardArrowRightIcon fontSize="small" sx={collapsedIconSx} />
                )}
              </IconButton>
            ) : (
              <Box sx={{ width: 30, flexShrink: 0 }} />
            )}
            <Box component="span" sx={ellipsisSx}>
              {label}
            </Box>
          </Box>
        );
      };

      const groupingColumnBase = {
        width: 220,
        sortable: false,
        filterable: false,
        hideable: false,
        disableReorder: true,
      } as const;

      if (multiple) {
        rowGroupingModel.forEach((field, index) => {
          const fullOverride = resolveOverride(field);
          const { hideDescendantCount: _hide, leafField: _leaf, ...override } = fullOverride;
          result.push({
            field: `${ROW_GROUP_FIELD_PREFIX}${field}__`,
            headerName: userColumnMap.get(field)?.headerName ?? field,
            ...groupingColumnBase,
            ...override,
            renderCell: ({ id }) => renderGroupingCell(id, fullOverride, field, index === 0),
          });
        });
      } else {
        const fullOverride = resolveOverride(null);
        const { hideDescendantCount: _hide, leafField: _leaf, ...override } = fullOverride;
        result.push({
          field: byRowGrouping ? ROW_GROUP_FIELD : TREE_GROUP_FIELD,
          headerName: byRowGrouping ? localeText.rowGroupingHeader : localeText.treeDataGroupHeader,
          ...groupingColumnBase,
          ...override,
          renderCell: ({ id }) => renderGroupingCell(id, fullOverride, null, false),
        });
      }
    }

    return result;
  }, [
    rowReordering,
    canReorder,
    isRowReorderable,
    isRtl,
    rowsById,
    moveRow,
    mergedRows,
    getRowId,
    checkboxSelection,
    selectableIds,
    selectedSet,
    localeText,
    setSelection,
    isSelectable,
    toggleSelection,
    getDetailPanelContent,
    detailIds,
    toggleDetail,
    isGroup,
    rowGroupingModel,
    treeData,
    groupingColDef,
    nodeById,
    isExpanded,
    toggleExpansion,
    treeIndex,
    propagateDescendants,
    subtreeRowIds,
    needsChildren,
    fetchingIds,
    serverRows,
    getChildrenCount,
    rowGroupingColumnMode,
    userColumnMap,
    collapsedIconSx,
  ]);

  const showListView = listView && listViewColumn !== undefined;

  const { columns, leftCount, rightStart } = useMemo(() => {
    if (showListView && listViewColumn) {
      // One column as wide as the grid, which renders the whole row.
      const listColumn: GridColDef<R> = {
        sortable: false,
        filterable: false,
        resizable: false,
        disableReorder: true,
        disableColumnMenu: true,
        ...listViewColumn,
        field: listViewColumn.field || LIST_VIEW_FIELD,
        flex: 1,
      };
      return { columns: [listColumn], leftCount: 0, rightStart: 1 };
    }
    const pinnedLeft = (pinned.left ?? []).flatMap((field) => {
      const column = visibleUserColumns.find((candidate) => candidate.field === field);
      return column ? [column] : [];
    });
    const pinnedRight = (pinned.right ?? []).flatMap((field) => {
      const column = visibleUserColumns.find((candidate) => candidate.field === field);
      return column ? [column] : [];
    });
    const middle = visibleUserColumns.filter((column) => !pinnedLeft.includes(column) && !pinnedRight.includes(column));
    // A header filter needs room for its operator icon and a usable input, so filterable columns keep a minimum width while the row shows.
    const withFilterRoom = (column: GridColDef<R>): GridColDef<R> =>
      headerFilters && !disableColumnFilter && isFilterable(column) && (column.minWidth ?? DEFAULT_MIN_WIDTH) < HEADER_FILTER_MIN_WIDTH
        ? { ...column, minWidth: HEADER_FILTER_MIN_WIDTH }
        : column;
    const all = [...specialColumns, ...pinnedLeft.map(withFilterRoom), ...middle.map(withFilterRoom), ...pinnedRight.map(withFilterRoom)];
    return { columns: all, leftCount: specialColumns.length + pinnedLeft.length, rightStart: all.length - pinnedRight.length };
  }, [specialColumns, visibleUserColumns, pinned, headerFilters, disableColumnFilter, showListView, listViewColumn]);

  const widths = useMemo(
    () => resolveColumnWidths(columns, containerWidth, widthOverrides),
    [columns, containerWidth, widthOverrides],
  );
  const totalWidth = widths.reduce((total, width) => total + width, 0);

  const leftOffsets = useMemo(() => {
    let offset = 0;
    return widths.map((width, index) => {
      const current = offset;
      if (index < leftCount) {
        offset += width;
      }
      return current;
    });
  }, [widths, leftCount]);

  const rightOffsets = useMemo(() => {
    let offset = 0;
    const result = new Array<number>(widths.length).fill(0);
    for (let index = widths.length - 1; index >= rightStart; index -= 1) {
      result[index] = offset;
      offset += widths[index] ?? 0;
    }
    return result;
  }, [widths, rightStart]);

  // A spanning cell needs the columns it covers to be rendered with it.
  const hasColSpan = useMemo(() => columns.some((column) => column.colSpan !== undefined), [columns]);

  // Columns scrolled out of view are not rendered. Pinned columns always are, and spacers stand in for the skipped middle columns.
  // Rows sized by their content need every cell rendered, or scrolling sideways would change their height.
  const colWindow = useMemo(() => {
    if (disableVirtualization || disableColumnVirtualization || hasColSpan || hasAutoHeightRows || containerWidth === 0 || rightStart <= leftCount) {
      return { start: leftCount, end: rightStart, leftSpacer: 0, rightSpacer: 0 };
    }
    const pinnedLeftWidth = widths.slice(0, leftCount).reduce((total, width) => total + width, 0);
    const range = getVirtualRange(
      getOffsets(widths.slice(leftCount, rightStart)),
      Math.max(0, scrollLeft - pinnedLeftWidth),
      containerWidth,
      columnBuffer,
    );
    return {
      start: leftCount + range.start,
      end: leftCount + range.end,
      leftSpacer: range.offsetTop,
      rightSpacer: range.offsetBottom,
    };
  }, [disableVirtualization, disableColumnVirtualization, hasColSpan, hasAutoHeightRows, containerWidth, widths, leftCount, rightStart, scrollLeft, columnBuffer]);

  const groupHeaderRows = useMemo(
    () =>
      buildGroupHeaderRows(
        columnGroupingModel,
        columns.map((column) => column.field),
      ),
    [columnGroupingModel, columns],
  );

  const rowSpacings = useMemo(() => {
    const map = new Map<GridRowId, Readonly<Required<GridRowSpacing>>>();
    if (getRowSpacing) {
      const dataNodes = pageNodes.filter((node) => node.row);
      dataNodes.forEach((node, index) => {
        const spacing = getRowSpacing({
          id: node.id,
          row: node.row as R,
          indexRelativeToCurrentPage: index,
          isFirstVisible: index === 0,
          isLastVisible: index === dataNodes.length - 1,
        });
        map.set(node.id, { top: spacing.top ?? 0, bottom: spacing.bottom ?? 0 });
      });
    }
    return map;
  }, [getRowSpacing, pageNodes]);

  const slotHeightRef = useRef<(id: GridRowId) => number | undefined>(() => undefined);
  const { measuredHeights, getRowRef, measureRows, resetHeights } = useMeasuredRowHeights(scrollerRef, slotHeightRef, setScrollTop);

  // The height of a row's slot: the row itself plus the space above and below it.
  const rowHeightFor = useCallback(
    (node: GridTreeNode<R>) => {
      const requested = node.row && getRowHeight ? getRowHeight({ id: node.id, row: node.row }) : null;
      const spacing = rowSpacings.get(node.id) ?? NO_SPACING;
      if (requested === 'auto') {
        // A measured row was measured with its spacing, which is part of the row element.
        const measured = measuredHeights.get(node.id);
        if (measured !== undefined) {
          return measured;
        }
        const estimate = node.row ? getEstimatedRowHeight?.({ id: node.id, row: node.row }) : null;
        return (estimate ?? rowHeight) + spacing.top + spacing.bottom;
      }
      return (requested ?? rowHeight) + spacing.top + spacing.bottom;
    },
    [getRowHeight, getEstimatedRowHeight, measuredHeights, rowHeight, rowSpacings],
  );
  slotHeightRef.current = (id) => {
    const node = nodeById.get(id);
    if (node) {
      return rowHeightFor(node);
    }
    const detail = detailEntriesRef.current.get(id);
    return detail?.height;
  };

  const entries = useMemo(() => {
    const result: Entry<R>[] = [];
    // Expanded groups with a footer, innermost last. A footer goes in once the rows below its group end.
    const openFooters: GridTreeNode<R>[] = [];
    const closeFooters = (depth: number) => {
      while (openFooters.length > 0 && (openFooters[openFooters.length - 1] as GridTreeNode<R>).depth >= depth) {
        result.push({ kind: 'groupFooter', node: openFooters.pop() as GridTreeNode<R>, height: rowHeight });
      }
    };
    for (const node of pageNodes) {
      closeFooters(node.depth);
      result.push({ kind: 'row', node });
      if (node.row && getDetailPanelContent && detailIds.includes(node.id)) {
        const params = { id: node.id, row: node.row };
        const requested = getDetailPanelHeight?.(params) ?? DEFAULT_DETAIL_HEIGHT;
        result.push(
          requested === 'auto'
            ? { kind: 'detail', node, height: measuredHeights.get(detailKey(node.id)) ?? DEFAULT_DETAIL_HEIGHT, auto: true }
            : { kind: 'detail', node, height: requested },
        );
      }
      if (aggregationPositions.get(node.id) === 'footer' && isExpanded(node)) {
        openFooters.push(node);
      }
    }
    closeFooters(0);
    return result;
  }, [pageNodes, getDetailPanelContent, getDetailPanelHeight, detailIds, aggregationPositions, isExpanded, rowHeight, measuredHeights]);

  const detailEntriesRef = useRef(new Map<GridRowId, { height: number }>());
  detailEntriesRef.current = new Map(
    entries.flatMap((entry) => (entry.kind === 'detail' && entry.auto ? [[detailKey(entry.node.id), entry] as const] : [])),
  );

  const offsets = useMemo(
    () => getOffsets(entries.map((entry) => (entry.kind === 'row' ? rowHeightFor(entry.node) : entry.height))),
    [entries, rowHeightFor],
  );

  const virtualize = !disableVirtualization && !autoHeight;
  const viewportHeight = containerHeight || (typeof height === 'number' ? height : DEFAULT_HEIGHT);
  const range = useMemo(
    () =>
      virtualize
        ? getVirtualRange(offsets, scrollTop, viewportHeight, rowBufferCount)
        : { start: 0, end: entries.length, offsetTop: 0, offsetBottom: 0 },
    [virtualize, offsets, scrollTop, viewportHeight, rowBufferCount, entries.length],
  );

  useLayoutEffect(measureRows, [measureRows, range.start, range.end, entries, widths, measuredHeights]);

  const onRenderedRangeChange = serverRows?.onRenderedRangeChange;
  useEffect(() => onRenderedRangeChange?.(range.start, range.end), [onRenderedRangeChange, range.start, range.end]);

  const rowEntryIndexes = useMemo(
    () => entries.flatMap((entry, index) => (entry.kind === 'row' ? [index] : [])),
    [entries],
  );

  const pivotLabelColumn = pivoting?.rowLabelColumn;
  const exportColumns = useMemo(
    () => [...(pivotLabelColumn ? [pivotLabelColumn] : []), ...visibleUserColumns.filter((column) => column.type !== 'actions' && !column.disableExport)],
    [visibleUserColumns, pivotLabelColumn],
  );

  const chartSeriesColumns = useMemo(() => getChartSeriesColumns(userColumns), [userColumns]);
  const chartCategoryColumns = useMemo(() => getChartCategoryColumns(userColumns), [userColumns]);
  const chartsModel = useMemo(
    () =>
      sanitizeChartsModel(
        storedChartsModel,
        new Set(chartSeriesColumns.map((column) => column.field)),
        new Set(chartCategoryColumns.map((column) => column.field)),
      ),
    [storedChartsModel, chartSeriesColumns, chartCategoryColumns],
  );
  // Computed while the panel shows or when the api asks, because it walks every row.
  const computeChartData = (): GridChartData => {
    const labelOf = (field: string) => userColumnMap.get(field)?.headerName ?? field;
    if (isGroup && !isPivoted) {
      const points: GridChartPoint[] = roots
        .filter((node) => !node.placeholder)
        .map((node) => {
          const aggregates = nodeAggregates.get(node.id);
          return {
            label: node.label,
            get: (field) => {
              const aggregated = aggregates?.[field];
              if (aggregated !== undefined && aggregated !== null) {
                return aggregated;
              }
              const column = userColumnMap.get(field);
              return column ? collectLeafRows(node).reduce((sum, row) => sum + (toChartNumber(getCellValue(row, column)) ?? 0), 0) : undefined;
            },
          };
        });
      return buildChartData(points, chartsModel, labelOf, { merge: false });
    }
    const category = chartsModel.categoryField ? userColumnMap.get(chartsModel.categoryField) : chartCategoryColumns[0];
    return buildChartData(getRowChartPoints(filteredRows, userColumnMap, category), chartsModel, labelOf, { merge: category !== undefined });
  };
  const chartsPanelOpen = chartsEnabled && menuPanel?.kind === 'charts';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const chartData = useMemo(() => (chartsPanelOpen ? computeChartData() : null), [chartsPanelOpen, chartsModel, filteredRows, roots, nodeAggregates, userColumnMap, isGroup, isPivoted, chartCategoryColumns]);

  const apiObjectRef = useRef<GridApi | null>(null);
  const internalApiRef = useRef({} as GridApi);

  const resolveExport = useCallback(
    (options?: { fields?: string[]; allColumns?: boolean; getRowsToExport?: GridCsvExportOptions['getRowsToExport'] }) => {
      const exportedColumns = options?.fields
        ? options.fields.flatMap((field) => userColumnMap.get(field) ?? [])
        : options?.allColumns
          ? orderedFields.flatMap((field) => userColumnMap.get(field) ?? []).filter((column) => column.type !== 'actions')
          : exportColumns;
      const exportedRows = options?.getRowsToExport
        ? options.getRowsToExport({ apiRef: apiObjectRef.current as GridApi }).flatMap((id) => rowsById.get(id) ?? [])
        : filteredRows;
      return { exportedColumns, exportedRows };
    },
    [userColumnMap, orderedFields, exportColumns, rowsById, filteredRows],
  );

  const getDataAsCsv = useCallback(
    (options?: Omit<GridCsvExportOptions, 'fileName'>) => {
      const merged = { ...csvOptions, ...options };
      const { exportedColumns, exportedRows } = resolveExport(merged);
      return buildCsv(exportedRows, exportedColumns, {
        delimiter: merged.delimiter,
        includeHeaders: merged.includeHeaders,
        utf8WithBom: merged.utf8WithBom,
        escapeFormulas: merged.escapeFormulas ?? true,
        raw: ignoreValueFormatterDuringExport,
      });
    },
    [csvOptions, resolveExport, ignoreValueFormatterDuringExport],
  );
  const exportDataAsCsv = useCallback(
    (options?: GridCsvExportOptions) =>
      downloadFile(
        `${options?.fileName ?? csvOptions?.fileName ?? 'data'}.csv`,
        getDataAsCsv(options),
        'text/csv;charset=utf-8',
      ),
    [getDataAsCsv, csvOptions],
  );
  const getDataAsExcel = useCallback(
    (options?: Omit<GridExcelExportOptions, 'fileName'>) => {
      const merged = { ...excelOptions, ...options };
      const { exportedColumns, exportedRows } = resolveExport(merged);
      const columnWidths = Object.fromEntries(columns.map((column, index) => [column.field, widths[index] ?? 0]));
      // Groups become rows of their own, with the rows below them in Excel outline levels.
      const nested = isGroup && !isPivoted && !serverRows && !merged.getRowsToExport && merged.includeRowGroups !== false;
      if (!nested) {
        return buildXlsx(exportedRows, exportedColumns, {
          sheetName: merged.sheetName,
          includeHeaders: merged.includeHeaders,
          columnWidths,
          columnsStyles: merged.columnsStyles,
        });
      }
      const groupingColumn = columns.find((column) => column.field === ROW_GROUP_FIELD || column.field === TREE_GROUP_FIELD || column.field.startsWith(ROW_GROUP_FIELD_PREFIX));
      const labelColumn: GridColDef<R> = {
        field: EXPORT_GROUP_FIELD,
        headerName: groupingColumn?.headerName ?? (treeData ? localeText.treeDataGroupHeader : localeText.rowGroupingHeader),
        width: groupingColumn ? (columnWidths[groupingColumn.field] ?? 220) : 220,
      };
      const exportEntries: XlsxEntry<R>[] = [];
      const visit = (nodes: readonly GridTreeNode<R>[]) => {
        for (const node of nodes) {
          if (node.placeholder) {
            continue;
          }
          if (node.row) {
            exportEntries.push({ kind: 'row', row: node.row, level: node.depth, label: node.groupField === undefined ? node.label : '' });
          } else {
            const values =
              Object.keys(aggregationModel).length > 0
                ? computeAggregates(collectLeafRows(node), aggregationModel, userColumnMap, aggregationFunctions, node.id)
                : {};
            exportEntries.push({ kind: 'group', label: node.label, level: node.depth, values });
          }
          visit(node.children);
        }
      };
      visit(roots);
      return buildXlsx(EMPTY_ARRAY, [labelColumn, ...exportedColumns], {
        sheetName: merged.sheetName,
        includeHeaders: merged.includeHeaders,
        columnWidths: { ...columnWidths, [EXPORT_GROUP_FIELD]: labelColumn.width ?? 220 },
        columnsStyles: merged.columnsStyles,
        entries: exportEntries,
      });
    },
    [excelOptions, resolveExport, columns, widths, isGroup, isPivoted, serverRows, treeData, localeText, roots, aggregationModel, userColumnMap, aggregationFunctions],
  );
  const exportDataAsExcel = useCallback(
    (options?: GridExcelExportOptions) =>
      downloadFile(`${options?.fileName ?? excelOptions?.fileName ?? 'data'}.xlsx`, getDataAsExcel(options), XLSX_MIME_TYPE),
    [getDataAsExcel, excelOptions],
  );
  const print = useCallback(
    (options?: GridPrintExportOptions) => {
      const merged = { ...printOptions, ...options };
      const { exportedColumns, exportedRows } = resolveExport(merged);
      printHtml(buildPrintHtml(exportedRows, exportedColumns, merged.fileName, merged.pageStyle, ignoreValueFormatterDuringExport));
    },
    [printOptions, resolveExport, ignoreValueFormatterDuringExport],
  );

  const getCellParams = useCallback(
    (id: GridRowId, row: R, column: GridColDef<R>): GridCellParams<R> => {
      const value = getCellValue(row, column);
      return { id, row, field: column.field, value, formattedValue: getFormattedValue(row, column, value), colDef: column };
    },
    [],
  );

  const canEditCell = useCallback(
    (id: GridRowId, row: R | undefined, column: GridColDef<R>) =>
      Boolean(column.editable) &&
      row !== undefined &&
      column.type !== 'actions' &&
      !isSpecialField(column.field) &&
      (isCellEditable ? isCellEditable(getCellParams(id, row, column)) : true),
    [isCellEditable, getCellParams],
  );

  const isEditable = useCallback(
    (column: GridColDef<R>, node: GridTreeNode<R>) => canEditCell(node.id, node.row, column),
    [canEditCell],
  );

  const startCellEdit = useCallback(
    (id: GridRowId, field: string) => {
      const row = rowsById.get(id);
      const column = userColumnMap.get(field);
      if (row && column && canEditCell(id, row, column)) {
        setEditing({ id, field, values: { [field]: getCellValue(row, column) } });
        emit('cellEditStart', { id, field });
      }
    },
    [rowsById, userColumnMap, canEditCell, emit],
  );

  const startRowEdit = useCallback(
    (id: GridRowId, focusField?: string) => {
      const row = rowsById.get(id);
      if (!row) {
        return;
      }
      const values: Record<string, unknown> = {};
      for (const column of visibleUserColumns) {
        if (canEditCell(id, row, column)) {
          values[column.field] = getCellValue(row, column);
        }
      }
      setEditing({ id, values, focusField });
      emit('rowEditStart', { id });
    },
    [rowsById, visibleUserColumns, canEditCell, emit],
  );

  /** Stores rows changed by edits, pastes and history steps on top of `rows`. */
  const applyRowResults = useCallback(
    (results: ReadonlyMap<GridRowId, R>) => {
      if (results.size === 0) {
        return;
      }
      setRowUpdates((previous) => {
        const base: RowUpdates<R> =
          previous.source === rows ? previous : { source: rows, map: EMPTY_MAP, added: EMPTY_ARRAY, deleted: EMPTY_SET };
        const map = new Map(base.map);
        for (const [id, row] of results) {
          map.set(id, row);
        }
        return { ...base, map };
      });
    },
    [rows],
  );

  const historyRef = useRef<{ undo: HistoryEntry<R>[]; redo: HistoryEntry<R>[] }>({ undo: [], redo: [] });
  // Bumped when a stack changes, so the toolbar buttons follow.
  const [, setHistoryVersion] = useState(0);
  const historyStackSizeRef = useRef(historyStackSize);
  historyStackSizeRef.current = historyStackSize;
  const pushHistory = useCallback((changes: HistoryEntry<R>['changes']) => {
    const size = historyStackSizeRef.current;
    if (size <= 0 || changes.length === 0) {
      return;
    }
    const history = historyRef.current;
    history.undo = [...history.undo, { changes }].slice(-size);
    history.redo = [];
    setHistoryVersion((version) => version + 1);
  }, []);
  const clearHistory = useCallback(() => {
    historyRef.current = { undo: [], redo: [] };
    setHistoryVersion((version) => version + 1);
  }, []);

  const stopEdit = useCallback(async (options?: { ignoreModifications?: boolean; reason?: GridEditStopReason }) => {
    const edit = editingRef.current;
    if (!edit || committingRef.current) {
      return;
    }
    const reason = options?.reason ?? (options?.ignoreModifications ? 'escapeKeyDown' : 'api');
    const finish = () => {
      setEditing(null);
      if (edit.field !== undefined) {
        emit('cellEditStop', { id: edit.id, field: edit.field, reason });
      } else {
        emit('rowEditStop', { id: edit.id, reason });
      }
    };
    if (options?.ignoreModifications) {
      finish();
      return;
    }
    // An invalid value keeps the editor open until it is fixed or cancelled.
    if (edit.errors && Object.values(edit.errors).some(Boolean)) {
      return;
    }
    const oldRow = rowsById.get(edit.id);
    if (!oldRow) {
      finish();
      return;
    }
    let newRow = oldRow;
    for (const [field, value] of Object.entries(edit.values)) {
      const column = userColumnMap.get(field);
      if (column) {
        const parsed = column.valueParser ? column.valueParser(value, newRow) : value;
        newRow = column.valueSetter ? column.valueSetter(parsed, newRow) : { ...newRow, [field]: parsed };
      }
    }
    const changed = Object.keys({ ...oldRow, ...newRow }).some((key) => oldRow[key] !== newRow[key]);
    if (!changed) {
      finish();
      return;
    }
    committingRef.current = true;
    try {
      const result = processRowUpdate ? await processRowUpdate(newRow, oldRow) : newRow;
      applyRowResults(new Map([[edit.id, result]]));
      pushHistory([{ id: edit.id, before: oldRow, after: result }]);
      finish();
    } catch (error) {
      onProcessRowUpdateError?.(error);
    } finally {
      committingRef.current = false;
    }
  }, [rowsById, userColumnMap, processRowUpdate, onProcessRowUpdateError, applyRowResults, pushHistory, emit]);

  /** Moves one step through the history. A step whose rows changed since (for example new `rows`) empties the history instead. */
  const applyHistory = async (direction: 'undo' | 'redo'): Promise<boolean> => {
    const history = historyRef.current;
    const stack = direction === 'undo' ? history.undo : history.redo;
    const entry = stack[stack.length - 1];
    if (!entry || editingRef.current || committingRef.current) {
      return false;
    }
    const matches = entry.changes.every(({ id, before, after }) => {
      const current = rowsById.get(id);
      return current !== undefined && sameRow(current, direction === 'undo' ? after : before);
    });
    if (!matches) {
      clearHistory();
      return false;
    }
    if (direction === 'undo') {
      history.undo = history.undo.slice(0, -1);
    } else {
      history.redo = history.redo.slice(0, -1);
    }
    committingRef.current = true;
    const results = new Map<GridRowId, R>();
    const applied: HistoryEntry<R>['changes'] = [];
    try {
      for (const change of entry.changes) {
        const target = direction === 'undo' ? change.before : change.after;
        const current = rowsById.get(change.id) as R;
        try {
          const result = processRowUpdate ? await processRowUpdate(target, current) : target;
          results.set(change.id, result);
          applied.push(direction === 'undo' ? { ...change, before: result } : { ...change, after: result });
        } catch (error) {
          onProcessRowUpdateError?.(error);
        }
      }
    } finally {
      committingRef.current = false;
    }
    applyRowResults(results);
    if (applied.length > 0) {
      if (direction === 'undo') {
        history.redo = [...history.redo, { changes: applied }];
      } else {
        history.undo = [...history.undo, { changes: applied }];
      }
    }
    setHistoryVersion((version) => version + 1);
    emit(direction, { rows: [...results].map(([id, row]) => ({ id, row })) });
    return results.size > 0;
  };
  /**
   * Saves the rows a move into another group or parent changed, through `processRowUpdate`, then puts the moved rows in place.
   * `moved` are the ids that travel together (a tree row and its descendants), and `place` picks their index among the other rows.
   */
  const relocateRows = async (id: GridRowId, updates: ReadonlyMap<GridRowId, R>, moved: readonly GridRowId[], place: (ids: GridRowId[]) => number) => {
    const results = new Map<GridRowId, R>();
    for (const [rowId, newRow] of updates) {
      const oldRow = rowsById.get(rowId) as R;
      try {
        results.set(rowId, processRowUpdate ? await processRowUpdate(newRow, oldRow) : newRow);
      } catch (error) {
        onProcessRowUpdateError?.(error);
      }
    }
    if (!results.has(id)) {
      return;
    }
    applyRowResults(results);
    pushHistory([...results].map(([rowId, after]) => ({ id: rowId, before: rowsById.get(rowId) as R, after })));
    const movedSet = new Set(moved);
    const ids = mergedRows.map(getRowId).filter((rowId) => !movedSet.has(rowId));
    const anchor = place(ids);
    ids.splice(anchor < 0 ? ids.length : anchor, 0, ...moved);
    setRowOrder({ source: rows, ids });
    props.onRowOrderChange?.({ row: results.get(id) as R, oldIndex: mergedRows.findIndex((candidate) => getRowId(candidate) === id), targetIndex: ids.indexOf(id) });
  };

  /** The path of a tree node. A generated node has no row, so it borrows the start of a descendant's path. */
  const treePathOf = (node: GridTreeNode<R>): string[] => {
    if (!getTreeDataPath) {
      return [];
    }
    if (node.row) {
      return getTreeDataPath(node.row);
    }
    const descendant = collectRows(node)[0];
    return descendant ? getTreeDataPath(descendant).slice(0, node.depth + 1) : [node.label];
  };

  /** Index just after the last row of a node's subtree, among `ids`. */
  const afterSubtree = (node: GridTreeNode<R>, ids: GridRowId[]) =>
    Math.max(-1, ...collectRows(node).map((row) => ids.indexOf(getRowId(row)))) + 1;

  /** Moves a tree row, with its descendants, under the node at `parentPath`, placed by `place`. */
  const moveTreeRow = (id: GridRowId, parentPath: string[], place: (ids: GridRowId[]) => number) => {
    const entry = siblingIndex.get(id);
    const row = rowsById.get(id);
    if (!entry || !row || !props.setTreeDataPath || !getTreeDataPath) {
      return Promise.resolve();
    }
    const oldPath = getTreeDataPath(row);
    const newPath = [...parentPath, oldPath[oldPath.length - 1] as string];
    const updates = new Map<GridRowId, R>();
    // The descendants keep their place under the moved row, so their paths change the same way.
    const subtree = collectRows(entry.node);
    for (const descendant of subtree) {
      const path = getTreeDataPath(descendant);
      updates.set(getRowId(descendant), props.setTreeDataPath([...newPath, ...path.slice(oldPath.length)], descendant));
    }
    return relocateRows(id, updates, subtree.map(getRowId), place);
  };

  /**
   * Moves a dragged row onto the place of another. Into another group or parent, the row first gets that group's values or
   * the new path, saved through `processRowUpdate`, and then takes the target's place. On a group it goes after the group's last row.
   */
  const dropRowOn = async (id: GridRowId, targetId: GridRowId) => {
    if (!isGroup) {
      moveRow(id, mergedRows.findIndex((row) => getRowId(row) === targetId));
      return;
    }
    const entry = siblingIndex.get(id);
    const target = siblingIndex.get(targetId);
    const row = rowsById.get(id);
    if (!entry || !target || !row) {
      return;
    }
    if (entry.parent === target.parent) {
      moveRowAmongSiblings(id, targetId);
      return;
    }
    if (isTreeReorder) {
      if (target.node.row) {
        await moveTreeRow(id, treePathOf(target.node).slice(0, -1), (ids) => ids.indexOf(targetId));
      }
      return;
    }
    // Any row of the target group carries the group values to copy.
    const sample = target.node.row ?? collectLeafRows(target.node)[0];
    if (!sample) {
      return;
    }
    let next = row;
    for (const field of rowGroupingModel) {
      const column = userColumnMap.get(field);
      if (!column) {
        continue;
      }
      const value = getCellValue(sample, column);
      if (column.groupingValueSetter) {
        next = column.groupingValueSetter(column.groupingValueGetter ? column.groupingValueGetter(value, sample) : value, next);
      } else {
        next = column.valueSetter ? column.valueSetter(value, next) : { ...next, [field]: sample[field] };
      }
    }
    await relocateRows(id, new Map([[id, next]]), [id], (ids) => (target.node.row ? ids.indexOf(targetId) : afterSubtree(target.node, ids)));
  };

  /**
   * Keyboard moves past the edge of a sibling list. Alt+Up/Down at the first or last row of a group moves a grouped row
   * into the group before or after. Alt+Shift+Right makes a tree row the last child of the row above it, and Alt+Shift+Left
   * moves it out of its parent, right after the parent. Both need the same props as dragging there.
   */
  const moveRowAcross = (id: GridRowId, key: 'up' | 'down' | 'indent' | 'outdent') => {
    const entry = siblingIndex.get(id);
    if (!entry || !canChangeParent) {
      return;
    }
    if (isTreeReorder) {
      const position = entry.siblings.findIndex((node) => node.id === id);
      if (key === 'indent') {
        const above = entry.siblings[position - 1];
        if (above) {
          void moveTreeRow(id, treePathOf(above), (ids) => afterSubtree(above, ids));
        }
      } else if (key === 'outdent' && entry.parent !== null) {
        const parent = siblingIndex.get(entry.parent)?.node;
        if (parent) {
          void moveTreeRow(id, treePathOf(parent).slice(0, -1), (ids) => afterSubtree(parent, ids));
        }
      }
      return;
    }
    if (key !== 'up' && key !== 'down') {
      return;
    }
    // The groups rows sit in, in the order they show, across all higher levels.
    const lastLevel = rowGroupingModel.length - 1;
    const groups = flattenTree(roots, () => true).filter((node) => !node.row && node.depth === lastLevel);
    const index = groups.findIndex((node) => node.id === entry.parent);
    const neighbor = groups[index + (key === 'up' ? -1 : 1)];
    if (index === -1 || !neighbor) {
      return;
    }
    // Going up it joins the end of the group above, going down the start of the group below.
    const first = neighbor.children[0];
    void dropRowOn(id, key === 'up' || !first ? neighbor.id : first.id);
  };

  moveRowAcrossRef.current = moveRowAcross;

  const canUndo = historyStackSize > 0 && historyRef.current.undo.length > 0;
  const canRedo = historyStackSize > 0 && historyRef.current.redo.length > 0;

  // Controlled edit modes: a changed `rowModesModel` / `cellModesModel` starts or stops edits, and edits started by the user are reported back.
  const resolveRowId = (key: string): GridRowId | undefined => {
    for (const id of rowsById.keys()) {
      if (String(id) === key) {
        return id;
      }
    }
    return undefined;
  };
  useEffect(() => {
    const model = props.rowModesModel;
    if (!model) {
      return;
    }
    const current = editingRef.current;
    for (const [key, entry] of Object.entries(model)) {
      const id = resolveRowId(key);
      if (entry.mode === 'edit' && id !== undefined && !(current && current.id === id && current.field === undefined)) {
        startRowEdit(id, entry.fieldToFocus);
      }
    }
    if (current && current.field === undefined) {
      const entry = model[current.id];
      if (entry?.mode === 'view') {
        void stopEdit({ ignoreModifications: entry.ignoreModifications, reason: 'api' });
      }
    }
    // Only a changed model should act, so an edit the user just started is not undone before the parent catches up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.rowModesModel]);
  useEffect(() => {
    const model = props.cellModesModel;
    if (!model) {
      return;
    }
    const current = editingRef.current;
    for (const [key, fields] of Object.entries(model)) {
      const id = resolveRowId(key);
      for (const [field, entry] of Object.entries(fields)) {
        if (entry.mode === 'edit' && id !== undefined && !(current && current.id === id && current.field === field)) {
          startCellEdit(id, field);
        }
      }
    }
    if (current && current.field !== undefined) {
      const entry = model[current.id]?.[current.field];
      if (entry?.mode === 'view') {
        void stopEdit({ ignoreModifications: entry.ignoreModifications, reason: 'api' });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.cellModesModel]);
  const previousEditRef = useRef<EditState | null>(null);
  useEffect(() => {
    const previous = previousEditRef.current;
    previousEditRef.current = editing;
    if (previous?.id === editing?.id && previous?.field === editing?.field) {
      return;
    }
    const changes: { edit: EditState; mode: 'view' | 'edit' }[] = [];
    if (previous) {
      changes.push({ edit: previous, mode: 'view' });
    }
    if (editing) {
      changes.push({ edit: editing, mode: 'edit' });
    }
    const rowModel: GridRowModesModel = { ...props.rowModesModel };
    const cellModel: GridCellModesModel = { ...props.cellModesModel };
    let rowChanged = false;
    let cellChanged = false;
    for (const { edit, mode } of changes) {
      if (edit.field === undefined) {
        rowModel[edit.id] = { mode };
        rowChanged = true;
      } else {
        cellModel[edit.id] = { ...cellModel[edit.id], [edit.field]: { mode } };
        cellChanged = true;
      }
    }
    if (rowChanged) {
      props.onRowModesModelChange?.(rowModel);
    }
    if (cellChanged) {
      props.onCellModesModelChange?.(cellModel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const applyColumnOrder = (next: string[]) => {
    setColumnOrder(next);
    props.onColumnOrderChange?.(next);
  };

  const applyColumnWidth = (field: string, width: number) => {
    setWidthOverrides((previous) => ({ ...previous, [field]: width }));
    props.onColumnWidthChange?.({ field, width });
  };

  const autosizeColumns = (requested?: GridAutosizeOptions) => {
    const options = { ...autosizeOptions, ...requested };
    const targets = (
      options?.columns ? visibleUserColumns.filter((column) => options.columns?.includes(column.field)) : visibleUserColumns
    ).filter((column) => column.type !== 'actions');
    const scroller = scrollerRef.current;
    const sample = scroller?.querySelector('[role="gridcell"]') ?? scroller;
    const style = sample ? getComputedStyle(sample) : null;
    const font = style?.fontSize && style.fontFamily ? `${style.fontSize} ${style.fontFamily}` : DEFAULT_FONT;
    const result = computeAutosizeWidths({
      columns: targets,
      rows: filteredRows,
      font,
      includeHeaders: options?.includeHeaders ?? true,
      extraWidth: options?.extraWidth ?? 0,
      maxRows: options?.maxRows ?? 1000,
    });
    setWidthOverrides((previous) => ({ ...previous, ...result }));
    for (const [field, width] of Object.entries(result)) {
      props.onColumnWidthChange?.({ field, width });
    }
    props.onColumnAutosize?.(result);
  };

  const pageRowIds = rowEntryIndexes.map((index) => (entries[index] as Entry<R>).node.id);

  const focusCell = (row: number, col: number) => {
    shouldFocusRef.current = true;
    setFocusPosition({ row: Math.max(0, Math.min(rowEntryIndexes.length - 1, row)), col: Math.max(0, Math.min(columns.length - 1, col)) });
  };

  const selectedCells = useMemo(
    () =>
      Object.entries(cellSelection).flatMap(([id, fields]) =>
        Object.entries(fields).flatMap(([field, selected]) => {
          const rowId = rowsById.has(id) ? id : rowsById.has(Number(id)) ? Number(id) : id;
          return selected ? [{ id: rowId as GridRowId, field }] : [];
        }),
      ),
    [cellSelection, rowsById],
  );

  /** Selects the rectangle of data cells between two positions on the current page. */
  const selectCellRange = (from: { row: number; col: number }, to: { row: number; col: number }) => {
    const next: GridCellSelectionModel = {};
    for (let row = Math.min(from.row, to.row); row <= Math.max(from.row, to.row); row += 1) {
      const id = pageRowIds[row];
      if (id === undefined) {
        continue;
      }
      for (let col = Math.min(from.col, to.col); col <= Math.max(from.col, to.col); col += 1) {
        const column = columns[col];
        if (column && !isSpecialField(column.field)) {
          (next[id] ??= {})[column.field] = true;
        }
      }
    }
    setCellSelection(next);
  };

  const handleCellMouseDown = (event: MouseEvent, id: GridRowId, row: number | null, col: number, field: string) => {
    if (event.button !== 0 || row === null) {
      return;
    }
    if (event.shiftKey && cellAnchorRef.current) {
      selectCellRange(cellAnchorRef.current, { row, col });
      return;
    }
    cellAnchorRef.current = { row, col };
    if (event.ctrlKey || event.metaKey) {
      const next: GridCellSelectionModel = {};
      for (const [rowId, fields] of Object.entries(cellSelection)) {
        next[rowId] = { ...fields };
      }
      const current = next[id] ?? {};
      next[id] = { ...current, [field]: !current[field] };
      setCellSelection(next);
      return;
    }
    selectCellRange({ row, col }, { row, col });
    draggingCellsRef.current = true;
    window.addEventListener(
      'mouseup',
      () => {
        draggingCellsRef.current = false;
      },
      { once: true },
    );
  };

  const extendCellDrag = (row: number | null, col: number) => {
    if (draggingCellsRef.current && row !== null && cellAnchorRef.current) {
      selectCellRange(cellAnchorRef.current, { row, col });
    }
  };

  /** Writes pasted text into editable cells, starting at the selection or the focused cell. */
  const pasteText = async (text: string) => {
    const grid = splitClipboardPastedText ? splitClipboardPastedText(text, clipboardCopyCellDelimiter) : parseClipboardText(text, clipboardCopyCellDelimiter);
    if (!grid || grid.length === 0) {
      return;
    }
    const dataColumns = columns.filter((column) => !isSpecialField(column.field));
    const rowPosition = new Map(filteredRows.map((row, index) => [getRowId(row), index]));
    const targets: { id: GridRowId; field: string; text: string }[] = [];

    const single = grid.length === 1 && grid[0]?.length === 1;
    if (single && selectedCells.length > 1) {
      for (const cell of selectedCells) {
        targets.push({ ...cell, text: grid[0]?.[0] ?? '' });
      }
    } else {
      let startRow: number | undefined;
      let startField: string | undefined;
      if (selectedCells.length > 0) {
        startRow = Math.min(...selectedCells.map((cell) => rowPosition.get(cell.id) ?? Infinity));
        startField = dataColumns.find((column) => selectedCells.some((cell) => cell.field === column.field))?.field;
      } else if (focusPosition) {
        const id = pageRowIds[focusPosition.row];
        startRow = id === undefined ? undefined : rowPosition.get(id);
        startField = columns[focusPosition.col]?.field;
      }
      const startCol = dataColumns.findIndex((column) => column.field === startField);
      if (startRow === undefined || !Number.isFinite(startRow) || startCol === -1) {
        return;
      }
      grid.forEach((cells, rowOffset) => {
        const row = filteredRows[startRow + rowOffset];
        cells.forEach((cellText, colOffset) => {
          const column = dataColumns[startCol + colOffset];
          if (row && column) {
            targets.push({ id: getRowId(row), field: column.field, text: cellText });
          }
        });
      });
    }

    const byRow = new Map<GridRowId, { field: string; text: string }[]>();
    for (const { id, field, text: cellText } of targets) {
      byRow.set(id, [...(byRow.get(id) ?? []), { field, text: cellText }]);
    }
    const results = new Map<GridRowId, R>();
    for (const [id, cells] of byRow) {
      const oldRow = rowsById.get(id);
      if (!oldRow) {
        continue;
      }
      let newRow = oldRow;
      for (const { field, text: cellText } of cells) {
        const column = userColumnMap.get(field);
        if (!column || !canEditCell(id, oldRow, column)) {
          continue;
        }
        const value = parsePastedValue(column, cellText, newRow);
        if (value === SKIP_PASTE) {
          continue;
        }
        newRow = column.valueSetter ? column.valueSetter(value, newRow) : { ...newRow, [field]: value };
      }
      if (Object.keys({ ...oldRow, ...newRow }).some((key) => oldRow[key] !== newRow[key])) {
        try {
          results.set(id, processRowUpdate ? await processRowUpdate(newRow, oldRow) : newRow);
        } catch (error) {
          onProcessRowUpdateError?.(error);
        }
      }
    }
    applyRowResults(results);
    pushHistory([...results].map(([id, after]) => ({ id, before: rowsById.get(id) as R, after })));
  };

  const handlePaste = (event: ClipboardEvent) => {
    const target = event.target as HTMLElement;
    if (disableClipboardPaste || editing || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
      return;
    }
    const text = event.clipboardData.getData('text/plain');
    if (!text) {
      return;
    }
    event.preventDefault();
    props.onClipboardPaste?.(text);
    void pasteText(text);
  };

  /** Where a panel or menu opened from the api attaches: the column's header when it is rendered, the grid otherwise. */
  const panelAnchorFor = (field?: string): HTMLElement => {
    const scroller = scrollerRef.current as HTMLElement;
    const col = field ? columns.findIndex((column) => column.field === field) : -1;
    return (col !== -1 ? scroller?.querySelector<HTMLElement>(`[data-headerindex="${col}"]`) : null) ?? scroller;
  };

  const upsertFilterItems = (items: readonly GridFilterItem[]) => {
    let next = [...filterModel.items];
    for (const item of items) {
      const index = item.id !== undefined ? next.findIndex((candidate) => candidate.id === item.id) : -1;
      if (index === -1) {
        next = disableMultipleColumnsFiltering ? [item] : [...next, item];
      } else {
        next[index] = item;
      }
    }
    setFilterModel({ ...filterModel, items: next });
  };

  const sortedRows = (): R[] => {
    const comparator = sortingMode === 'client' ? getRowComparator(sortModel, userColumnMap) : null;
    return comparator ? [...mergedRows].sort(comparator) : [...mergedRows];
  };

  /** A rendered cell of a row: the given column's, or any. Rows scrolled out of view have none. */
  const getCellElementFor = (id: GridRowId, field?: string): HTMLElement | null => {
    const row = pageRowIds.indexOf(id);
    if (row === -1) {
      return null;
    }
    const selector = field === undefined ? `[data-rowindex="${row}"]` : `[data-rowindex="${row}"][data-field="${field.replace(/["\\]/g, '\\$&')}"]`;
    return scrollerRef.current?.querySelector<HTMLElement>(selector) ?? null;
  };

  const findNode = (nodes: readonly GridTreeNode<R>[], id: GridRowId): { node: GridTreeNode<R>; parent: GridRowId | null } | null => {
    const visit = (level: readonly GridTreeNode<R>[], parent: GridRowId | null): { node: GridTreeNode<R>; parent: GridRowId | null } | null => {
      for (const node of level) {
        if (node.id === id) {
          return { node, parent };
        }
        const found = visit(node.children, node.id);
        if (found) {
          return found;
        }
      }
      return null;
    };
    return visit(nodes, null);
  };

  const pin = (field: string, side: 'left' | 'right' | null) => {
    const left = (pinned.left ?? []).filter((item) => item !== field);
    const right = (pinned.right ?? []).filter((item) => item !== field);
    if (side === 'left') {
      left.push(field);
    } else if (side === 'right') {
      right.push(field);
    }
    setPinned({ left, right });
  };

  const updateRows = (updates: GridRowUpdate[]) => {
    setRowUpdates((previous) => {
      const base: RowUpdates<R> =
        previous.source === rows ? previous : { source: rows, map: EMPTY_MAP, added: EMPTY_ARRAY, deleted: EMPTY_SET };
      const map = new Map(base.map);
      let added = [...base.added];
      const deleted = new Set(base.deleted);
      const known = new Map<GridRowId, R>([...baseRows, ...added].map((row) => [getRowId(row), row]));
      for (const { _action, ...fields } of updates) {
        const id = getRowId(fields as unknown as R);
        if (_action === 'delete') {
          deleted.add(id);
          map.delete(id);
          added = added.filter((row) => getRowId(row) !== id);
          continue;
        }
        deleted.delete(id);
        const current = map.get(id) ?? known.get(id);
        if (current) {
          map.set(id, { ...current, ...fields } as R);
        } else {
          const row = fields as unknown as R;
          added.push(row);
          known.set(id, row);
        }
      }
      return { source: rows, map, added, deleted };
    });
  };

  const selectRows = (ids: readonly GridRowId[], isSelected = true, resetSelection = false) =>
    setSelection((previous) => {
      if (!isSelected) {
        return previous.filter((id) => !ids.includes(id));
      }
      return resetSelection ? [...ids] : [...previous.filter((id) => !ids.includes(id)), ...ids];
    });

  // The state snapshot of `apiRef.current.state`. Each part keeps its identity until it changes, so selectors stay stable.
  const allRowIds = useMemo(() => mergedRows.map(getRowId), [mergedRows, getRowId]);
  const rowsLookup = useMemo(() => Object.fromEntries([...rowsById].map(([id, row]) => [String(id), row])), [rowsById]);
  const sortedRowIds = useMemo(() => {
    const comparator = sortingMode === 'client' ? getRowComparator(sortModel, userColumnMap) : null;
    return comparator ? [...mergedRows].sort(comparator).map(getRowId) : allRowIds;
  }, [sortingMode, sortModel, userColumnMap, mergedRows, getRowId, allRowIds]);
  const filteredRowIds = useMemo(() => filteredRows.map(getRowId), [filteredRows, getRowId]);
  const visibleRowIds = useMemo(() => rowEntryIndexes.map((index) => (entries[index] as Entry<R>).node.id), [rowEntryIndexes, entries]);
  const columnLookup = useMemo(
    () => Object.fromEntries([...userColumns, ...columns].map((column) => [column.field, column])) as Record<string, GridColDef<any>>,
    [userColumns, columns],
  );
  const visibleFields = useMemo(() => columns.map((column) => column.field), [columns]);
  const dimensions = useMemo(
    () => Object.fromEntries(columns.map((column, index) => [column.field, { width: widths[index] ?? 0 }])),
    [columns, widths],
  );
  const focusedCellId = focusPosition ? visibleRowIds[focusPosition.row] : undefined;
  const focusedCellField = focusPosition ? columns[focusPosition.col]?.field : undefined;
  const focusedHeaderField = headerFocusCol !== null ? columns[headerFocusCol]?.field : undefined;
  const gridState = useMemo<GridState>(
    () => ({
      rows: { ids: allRowIds, totalRowCount: paginationMode === 'server' ? (rowCount ?? rootCount) : allRowIds.length, lookup: rowsLookup },
      sorting: { sortModel, sortedRowIds },
      filter: { filterModel, filteredRowIds },
      pagination: { paginationModel, rowCount: paginationMode === 'server' ? (rowCount ?? rootCount) : rootCount },
      visibleRowIds,
      columns: { orderedFields, columnVisibilityModel: visibilityModel, lookup: columnLookup, visibleFields, dimensions },
      pinnedColumns: pinned,
      density,
      rowSelection: selection,
      cellSelection,
      aggregation: { model: aggregationModel },
      rowGrouping: { model: rowGroupingModel as string[] },
      pivoting: { active: pivoting?.enabled ?? false, model: pivoting?.model ?? EMPTY_PIVOT_MODEL },
      charts: { model: chartsModel },
      detailPanel: { expandedRowIds: detailIds as GridRowId[] },
      editing: editing ? { id: editing.id, field: editing.field ?? null, values: editing.values } : null,
      focus: {
        cell: focusedCellId !== undefined && focusedCellField !== undefined && headerFocusCol === null ? { id: focusedCellId, field: focusedCellField } : null,
        columnHeader: focusedHeaderField !== undefined ? { field: focusedHeaderField } : null,
      },
      preferencePanel: {
        open: menuPanel !== null,
        openedPanelValue: menuPanel ? (menuPanel.kind === 'filter' ? 'filters' : menuPanel.kind) : null,
      },
      columnMenu: { open: columnMenu !== null, field: columnMenu?.field ?? null },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      allRowIds, paginationMode, rowCount, rootCount, rowsLookup, sortModel, sortedRowIds, filterModel, filteredRowIds, paginationModel,
      visibleRowIds, orderedFields, visibilityModel, columnLookup, visibleFields, dimensions, pinned, density, selection, cellSelection,
      aggregationModel, rowGroupingModel, pivoting?.enabled, pivoting?.model, chartsModel, detailIds, editing, focusedCellId, focusedCellField,
      focusedHeaderField, headerFocusCol, menuPanel, columnMenu,
    ],
  );

  const api: GridApi = {
    state: gridState,
    rootElementRef,
    exportDataAsCsv,
    getDataAsCsv,
    print,
    exportDataAsExcel,
    getDataAsExcel,
    startCellEditMode: ({ id, field }) => startCellEdit(id, field),
    startRowEditMode: ({ id }) => startRowEdit(id),
    stopEditMode: (options) => void stopEdit(options),
    setRowSelectionModel: setSelection,
    setColumnVisibility: (field, visible) => setVisibilityModel({ ...visibilityModel, [field]: visible }),
    getRowModels: () => rowsById,
    setRowIndex: moveRow,
    getCellSelectionModel: () => cellSelection,
    setCellSelectionModel: setCellSelection,
    isCellSelected: (id, field) => Boolean(cellSelection[id]?.[field]),
    getSelectedCellsAsArray: () => selectedCells,

    getRow: (id) => rowsById.get(id) ?? null,
    getRowId: (row) => getRowId(row as R),
    getAllRowIds: () => filteredRows.map(getRowId),
    getRowsCount: () => mergedRows.length,
    getRowIndexRelativeToVisibleRows: (id) => filteredRows.findIndex((row) => getRowId(row) === id),
    updateRows,
    getCellValue: (id, field) => {
      const row = rowsById.get(id);
      const column = userColumnMap.get(field);
      return row && column ? getCellValue(row, column) : undefined;
    },

    getSortModel: () => sortModel,
    setSortModel,
    getFilterModel: () => filterModel,
    setFilterModel,
    setQuickFilterValues: (values) => setFilterModel({ ...filterModel, quickFilterValues: values }),
    getPaginationModel: () => paginationModel,
    setPaginationModel,
    setPage: (nextPage) => setPaginationModel({ ...paginationModel, page: nextPage }),
    setPageSize: (pageSize) => setPaginationModel({ page: 0, pageSize }),
    getDensity: () => density,
    setDensity,

    selectRow: (id, isSelected = true, resetSelection = false) => selectRows([id], isSelected, resetSelection),
    selectRows,
    isRowSelected: (id) => selectedSet.has(id),
    getSelectedRows: () =>
      new Map(selection.flatMap((id) => {
        const row = rowsById.get(id);
        return row ? [[id, row] as const] : [];
      })),

    getAllColumns: () => orderedFields.flatMap((field) => userColumnMap.get(field) ?? []),
    getVisibleColumns: () => columns,
    getColumn: (field) => userColumnMap.get(field),
    getColumnIndex: (field, useVisibleColumns = true) =>
      useVisibleColumns ? columns.findIndex((column) => column.field === field) : orderedFields.indexOf(field),
    setColumnWidth: applyColumnWidth,
    setColumnIndex: (field, targetIndex) => {
      if (!orderedFields.includes(field)) {
        return;
      }
      const next = orderedFields.filter((item) => item !== field);
      next.splice(Math.max(0, Math.min(next.length, targetIndex)), 0, field);
      applyColumnOrder(next);
    },
    autosizeColumns,
    getPinnedColumns: () => pinned,
    setPinnedColumns: setPinned,
    pinColumn: (field, side) => pin(field, side),
    unpinColumn: (field) => pin(field, null),

    setAggregationModel,
    setRowGroupingModel: (model) => setRowGroupingModel(model),
    isPivotActive: () => pivoting?.enabled ?? false,
    setPivotActive: (active) => pivoting?.setEnabled(active),
    getPivotModel: () => pivoting?.model ?? EMPTY_PIVOT_MODEL,
    setPivotModel: (model) => pivoting?.setModel(model),
    getChartsModel: () => chartsModel,
    setChartsModel: (model) => {
      if (chartsEnabled) setChartsModel(model);
    },
    getChartData: () => computeChartData(),
    resetRowHeights: resetHeights,
    toggleDetailPanel: toggleDetail,
    getExpandedDetailPanels: () => [...detailIds],
    setRowChildrenExpansion: (id, isExpandedValue) => setExpansion((previous) => new Map(previous).set(id, isExpandedValue)),

    scroll: ({ left, top }) => {
      const scroller = scrollerRef.current;
      if (!scroller) {
        return;
      }
      if (left !== undefined) {
        scroller.scrollLeft = left;
      }
      if (top !== undefined) {
        scroller.scrollTop = top;
        setScrollTop(top);
      }
    },
    getScrollPosition: () => ({ top: scrollerRef.current?.scrollTop ?? 0, left: scrollerRef.current?.scrollLeft ?? 0 }),
    scrollToIndexes: ({ rowIndex, colIndex }) => {
      const scroller = scrollerRef.current;
      if (!scroller) {
        return;
      }
      if (rowIndex !== undefined) {
        const entryIndex = rowEntryIndexes[rowIndex];
        if (entryIndex !== undefined) {
          const top = offsets[entryIndex] ?? 0;
          scroller.scrollTop = top;
          setScrollTop(top);
        }
      }
      if (colIndex !== undefined) {
        scroller.scrollLeft = (isRtl ? -1 : 1) * widths.slice(0, colIndex).reduce((total, width) => total + width, 0);
      }
    },
    setCellFocus: (id, field) => {
      const row = pageRowIds.indexOf(id);
      const col = columns.findIndex((column) => column.field === field);
      if (row !== -1 && col !== -1) {
        focusCell(row, col);
      }
    },

    refetch: () => props.onRefetchRequest?.(),

    showFilterPanel: (field) => {
      const column = field ? userColumnMap.get(field) : undefined;
      if (column && !disableColumnFilter && isFilterable(column)) {
        openFilterFor(column, panelAnchorFor(field));
      } else {
        setMenuPanel({ kind: 'filter', anchor: panelAnchorFor(field) });
      }
    },
    hideFilterPanel: () => setMenuPanel((current) => (current?.kind === 'filter' ? null : current)),
    showPreferences: (panel) => setMenuPanel({ kind: panel === 'filters' ? 'filter' : 'columns', anchor: panelAnchorFor() }),
    hidePreferences: () => setMenuPanel(null),
    showColumnMenu: (field) => {
      const column = columns.find((candidate) => candidate.field === field);
      if (column && hasColumnMenu(column)) {
        setColumnMenu({ field, anchor: panelAnchorFor(field) });
      }
    },
    hideColumnMenu: () => setColumnMenu(null),
    toggleColumnMenu: (field) =>
      columnMenu?.field === field ? setColumnMenu(null) : apiObjectRef.current?.showColumnMenu(field),
    upsertFilterItem: (item) => upsertFilterItems([item]),
    upsertFilterItems,
    deleteFilterItem: (item) =>
      setFilterModel({
        ...filterModel,
        items: filterModel.items.filter((candidate) => (item.id !== undefined ? candidate.id !== item.id : candidate.field !== item.field)),
      }),
    setFilterLogicOperator: (operator) => setFilterModel({ ...filterModel, logicOperator: operator }),
    sortColumn: (field, direction, allowMultipleSorting = false) => {
      const others = allowMultipleSorting && !disableMultipleColumnsSorting ? sortModel.filter((item) => item.field !== field) : [];
      const index = sortModel.findIndex((item) => item.field === field);
      if (!direction) {
        setSortModel(sortModel.filter((item) => item.field !== field));
      } else if (allowMultipleSorting && index !== -1) {
        setSortModel(sortModel.map((item) => (item.field === field ? { field, sort: direction } : item)));
      } else {
        setSortModel([...others, { field, sort: direction }]);
      }
    },
    getSortedRowIds: () => sortedRows().map(getRowId),
    getSortedRows: () => sortedRows(),
    getRowIdFromRowIndex: (index) => pageRowIds[index],
    setColumnVisibilityModel: setVisibilityModel,
    setEditCellValue: async ({ id, field, value }) => {
      const edit = editingRef.current;
      if (!edit || edit.id !== id || !(field in edit.values)) {
        return false;
      }
      setEditing((previous) => (previous && previous.id === id ? { ...previous, values: { ...previous.values, [field]: value } } : previous));
      return true;
    },
    getCellMode: (id, field) => (editing?.id === id && editing.values && field in editing.values ? 'edit' : 'view'),
    getRowMode: (id) => (editing?.id === id && editing.field === undefined ? 'edit' : 'view'),
    getRowParams: (id) => {
      const row = rowsById.get(id);
      return row ? { id, row } : null;
    },
    getCellParams: (id, field) => {
      const row = rowsById.get(id);
      const column = userColumnMap.get(field);
      return row && column ? (getCellParams(id, row, column) as unknown as GridCellParams) : null;
    },
    getColumnHeaderParams: (field) => {
      const column = userColumnMap.get(field) ?? columns.find((candidate) => candidate.field === field);
      return column ? ({ field, colDef: column } as unknown as GridColumnHeaderParams) : null;
    },
    getRowNode: (id) => {
      const found = findNode(allRoots, id) ?? findNode(roots, id);
      if (!found) {
        return null;
      }
      const { node, parent } = found;
      return {
        id: node.id,
        type: node.children.length > 0 || !node.row ? 'group' : 'leaf',
        depth: node.depth,
        parent,
        children: node.children.map((child) => child.id),
        groupingField: node.groupField ?? null,
        groupingKey: node.groupField || !node.row ? node.label : null,
        childrenExpanded: node.children.length > 0 && isExpanded(node),
        isAutoGenerated: !node.row,
      };
    },
    getRowGroupChildren: ({ groupId, applyFiltering = false, applySorting = false }) => {
      const found = findNode(applyFiltering ? roots : allRoots, groupId);
      if (!found) {
        return [];
      }
      // The filtered tree is sorted already. The unfiltered one is in row order unless sorting is asked for.
      const below = collectRows(found.node).filter((row) => getRowId(row) !== groupId);
      const comparator = applySorting && !applyFiltering && sortingMode === 'client' ? getRowComparator(sortModel, userColumnMap) : null;
      return (comparator ? [...below].sort(comparator) : below).map(getRowId);
    },
    addRowGroupingCriteria: (field, index) => {
      const next = rowGroupingModel.filter((item) => item !== field);
      next.splice(index === undefined ? next.length : Math.max(0, Math.min(next.length, index)), 0, field);
      setRowGroupingModel(next);
    },
    removeRowGroupingCriteria: (field) => setRowGroupingModel(rowGroupingModel.filter((item) => item !== field)),
    setRowGroupingCriteriaIndex: (field, index) => {
      if (!rowGroupingModel.includes(field)) {
        return;
      }
      const next = rowGroupingModel.filter((item) => item !== field);
      next.splice(Math.max(0, Math.min(next.length, index)), 0, field);
      setRowGroupingModel(next);
    },
    setRows: (next) => {
      setReplacedRows({ source: rows, rows: next as R[] });
      setRowUpdates({ source: rows, map: EMPTY_MAP, added: EMPTY_ARRAY, deleted: EMPTY_SET });
      setRowOrder(null);
    },
    updateColumns: (changes) => {
      const next = [...userColumns];
      for (const change of changes as GridColDef<R>[]) {
        const index = next.findIndex((column) => column.field === change.field);
        if (index === -1) {
          next.push(change);
        } else {
          next[index] = { ...next[index], ...change };
        }
      }
      setColumnUpdates({ source: columnsProp, columns: next });
    },
    selectRowRange: ({ startId, endId }, isSelected = true, resetSelection = false) => {
      const from = pageRowIds.indexOf(startId);
      const to = pageRowIds.indexOf(endId);
      if (from === -1 || to === -1) {
        return;
      }
      const ids = pageRowIds.slice(Math.min(from, to), Math.max(from, to) + 1).filter((id) => isSelectable(id, rowsById.get(id)));
      selectRows(ids, isSelected, resetSelection);
    },
    selectCellRange: (start, end, keepOtherSelected = false) => {
      const position = (cell: { id: GridRowId; field: string }) => ({
        row: pageRowIds.indexOf(cell.id),
        col: columns.findIndex((column) => column.field === cell.field),
      });
      const from = position(start);
      const to = position(end);
      if (!cellSelectionEnabled || from.row === -1 || to.row === -1 || from.col === -1 || to.col === -1) {
        return;
      }
      const next: GridCellSelectionModel = keepOtherSelected
        ? Object.fromEntries(Object.entries(cellSelection).map(([id, fields]) => [id, { ...fields }]))
        : {};
      for (let row = Math.min(from.row, to.row); row <= Math.max(from.row, to.row); row += 1) {
        const id = pageRowIds[row] as GridRowId;
        for (let col = Math.min(from.col, to.col); col <= Math.max(from.col, to.col); col += 1) {
          const column = columns[col];
          if (column && !isSpecialField(column.field)) {
            (next[id] ??= {})[column.field] = true;
          }
        }
      }
      setCellSelection(next);
    },
    setExpandedDetailPanels: (ids) => setDetailIds(ids),
    isColumnPinned: (field) => (pinned.left?.includes(field) ? 'left' : pinned.right?.includes(field) ? 'right' : false),
    getColumnPosition: (field) => {
      const index = columns.findIndex((column) => column.field === field);
      return index === -1 ? 0 : widths.slice(0, index).reduce((total, width) => total + width, 0);
    },
    getRootDimensions: () => ({
      viewportWidth: scrollerRef.current?.clientWidth ?? containerWidth,
      viewportHeight: scrollerRef.current?.clientHeight ?? containerHeight,
      contentWidth: totalWidth,
      contentHeight: offsets[offsets.length - 1] ?? 0,
      rowHeight,
      columnHeaderHeight: headerHeight,
    }),
    getLocaleText: (key) => localeText[key],
    getRowElement: (id) => getCellElementFor(id)?.closest<HTMLElement>('[role="row"]') ?? null,
    getCellElement: (id, field) => getCellElementFor(id, field),
    getColumnHeaderElement: (field) => {
      const col = columns.findIndex((column) => column.field === field);
      return col === -1 ? null : (scrollerRef.current?.querySelector<HTMLElement>(`[data-headerindex="${col}"]`) ?? null);
    },
    getRowValue: (row, column) => getCellValue(row as R, column as GridColDef<R>),
    getRowFormattedValue: (row, column) => getFormattedValue(row as R, column as GridColDef<R>),
    isRowSelectable: (id) => isSelectable(id, rowsById.get(id)),
    publishEvent: (event, ...args) => emit(event, ...args),
    getAggregationModel: () => aggregationModel,
    getRowGroupingModel: () => [...rowGroupingModel],
    getColumnVisibilityModel: () => visibilityModel,
    setAllRowChildrenExpansion: (isExpandedValue) =>
      setExpansion(new Map(flattenTree(allRoots, () => true).flatMap((node) => (node.children.length > 0 ? [[node.id, isExpandedValue] as const] : [])))),
    setColumnHeaderFocus: (field) => {
      const col = columns.findIndex((column) => column.field === field);
      if (col !== -1 && !showListView) {
        focusHeader(col);
      }
    },

    history: {
      undo: () => applyHistory('undo'),
      redo: () => applyHistory('redo'),
      canUndo: () => canUndo,
      canRedo: () => canRedo,
      clear: clearHistory,
    },

    exportState: () => ({
      sorting: { sortModel },
      filter: { filterModel },
      pagination: { paginationModel },
      columns: {
        columnVisibilityModel: visibilityModel,
        orderedFields,
        dimensions: Object.fromEntries(Object.entries(widthOverrides).map(([field, width]) => [field, { width }])),
      },
      pinnedColumns: pinned,
      density,
      rowSelection: selection,
      // While pivoting these hold generated values. The user's own stay in place for when pivoting ends.
      ...(isPivoted ? {} : { aggregation: { model: aggregationModel }, rowGrouping: { model: [...rowGroupingModel] } }),
      ...(pivoting ? { pivoting: { enabled: pivoting.enabled, model: pivoting.model } } : {}),
      ...(chartsEnabled ? { charts: { model: chartsModel } } : {}),
    }),
    restoreState: (state: GridInitialState) => {
      if (state.sorting?.sortModel) setSortModel(state.sorting.sortModel);
      if (state.filter?.filterModel) setFilterModel(state.filter.filterModel);
      if (state.pagination?.paginationModel) setPaginationModel(state.pagination.paginationModel);
      if (state.columns?.columnVisibilityModel) setVisibilityModel(state.columns.columnVisibilityModel);
      if (state.columns?.orderedFields) applyColumnOrder([...state.columns.orderedFields]);
      if (state.columns?.dimensions) {
        setWidthOverrides(Object.fromEntries(Object.entries(state.columns.dimensions).map(([field, { width }]) => [field, width])));
      }
      if (state.pinnedColumns) setPinned(state.pinnedColumns as GridPinnedColumns);
      if (state.density) setDensity(state.density);
      if (state.rowSelection) setSelection(state.rowSelection);
      if (state.aggregation?.model) setAggregationModel(state.aggregation.model);
      if (state.rowGrouping?.model) setRowGroupingModel([...state.rowGrouping.model]);
      if (state.pivoting?.enabled !== undefined) pivoting?.setEnabled(state.pivoting.enabled);
      if (state.pivoting?.model) pivoting?.setModel(state.pivoting.model);
      if (state.charts?.model && chartsEnabled) setChartsModel(state.charts.model);
    },
    subscribeEvent: (event, handler) => {
      const listeners = listenersRef.current.get(event) ?? new Set<EventListener>();
      listeners.add(handler as EventListener);
      listenersRef.current.set(event, listeners);
      return () => {
        listeners.delete(handler as EventListener);
      };
    },
  };
  apiObjectRef.current = api;
  // Set during render, so custom slots that read the api through `useGridApiContext` see this render's state.
  const contextApiRef = apiRef ?? internalApiRef;
  contextApiRef.current = api;

  // Events for state changes, as MUI X publishes them. Each compares with what the previous render had.
  const previousStateRef = useRef<GridState | null>(null);
  useEffect(() => {
    const previous = previousStateRef.current;
    previousStateRef.current = gridState;
    if (!previous || previous === gridState) {
      return;
    }
    const changed = <K extends keyof GridState>(key: K) => previous[key] !== gridState[key];
    if (previous.sorting.sortModel !== gridState.sorting.sortModel) emit('sortModelChange', gridState.sorting.sortModel);
    if (previous.filter.filterModel !== gridState.filter.filterModel) emit('filterModelChange', gridState.filter.filterModel);
    if (previous.pagination.paginationModel !== gridState.pagination.paginationModel) emit('paginationModelChange', gridState.pagination.paginationModel);
    if (changed('rowSelection')) emit('rowSelectionChange', gridState.rowSelection);
    if (previous.columns.columnVisibilityModel !== gridState.columns.columnVisibilityModel) {
      emit('columnVisibilityModelChange', gridState.columns.columnVisibilityModel);
    }
    if (changed('density')) emit('densityChange', gridState.density);
    if (previous.columns.orderedFields.join('\u0000') !== gridState.columns.orderedFields.join('\u0000')) {
      emit('columnOrderChange', { orderedFields: gridState.columns.orderedFields });
    }
    for (const [field, { width }] of Object.entries(gridState.columns.dimensions)) {
      const before = previous.columns.dimensions[field]?.width;
      if (before !== undefined && before !== width) emit('columnWidthChange', { field, width });
    }
    if (changed('pinnedColumns')) emit('pinnedColumnsChange', gridState.pinnedColumns);
    if (previous.rowGrouping.model !== gridState.rowGrouping.model) emit('rowGroupingModelChange', gridState.rowGrouping.model);
    if (previous.aggregation.model !== gridState.aggregation.model) emit('aggregationModelChange', gridState.aggregation.model);
    if (previous.detailPanel.expandedRowIds !== gridState.detailPanel.expandedRowIds) {
      emit('detailPanelsExpandedRowIdsChange', gridState.detailPanel.expandedRowIds);
    }
    const cell = gridState.focus.cell;
    if (cell && (previous.focus.cell?.id !== cell.id || previous.focus.cell?.field !== cell.field)) emit('cellFocusIn', cell);
    const header = gridState.focus.columnHeader;
    if (header && previous.focus.columnHeader?.field !== header.field) emit('columnHeaderFocus', header);
    emit('stateChange', gridState);
  }, [gridState, emit]);

  // Expanding or collapsing a group reports which one changed.
  const previousExpansionRef = useRef(expansion);
  useEffect(() => {
    const previous = previousExpansionRef.current;
    previousExpansionRef.current = expansion;
    for (const [id, isExpandedValue] of expansion) {
      if (previous.get(id) !== isExpandedValue) emit('rowExpansionChange', { id, isExpanded: isExpandedValue });
    }
  }, [expansion, emit]);
  const lastEmittedStateRef = useRef<string | null>(null);
  useEffect(() => {
    if (!props.onStateChange) {
      return;
    }
    const state = api.exportState();
    const serialized = JSON.stringify(state);
    // The first run only records the starting state, so the callback reports changes and not the mount.
    if (lastEmittedStateRef.current !== null && lastEmittedStateRef.current !== serialized) {
      props.onStateChange(state);
    }
    lastEmittedStateRef.current = serialized;
  });
  useEffect(() => {
    if (apiRef) {
      apiRef.current = api;
    }
  });

  // Runs once the first rows are in, so the widths fit real content.
  const autosizedOnMountRef = useRef(false);
  useEffect(() => {
    if (autosizeOnMount && !autosizedOnMountRef.current && filteredRows.length > 0) {
      autosizedOnMountRef.current = true;
      autosizeColumns();
    }
  });

  const handleSort = (column: GridColDef<R>, event: MouseEvent) => {
    if (disableColumnSorting || column.sortable === false || isSpecialField(column.field) || column.type === 'actions') {
      return;
    }
    const addToSort = multipleColumnsSortingMode === 'always' || event.shiftKey || event.ctrlKey || event.metaKey;
    setSortModel(applySortClick(sortModel, column.field, column.sortingOrder ?? sortingOrder, addToSort && !disableMultipleColumnsSorting));
  };

  const isSortable = (column: GridColDef<R>) =>
    !disableColumnSorting && column.sortable !== false && !isSpecialField(column.field) && column.type !== 'actions';

  const hasColumnMenu = (column: GridColDef<R>) =>
    !disableColumnMenu && !column.disableColumnMenu && (!isSpecialField(column.field) || isRowGroupField(column.field));

  // The panels open under the header cell, not under the menu button.
  const headerCellOf = (anchor: HTMLElement) => anchor.closest<HTMLElement>('[role="columnheader"]') ?? anchor;

  const openFilterFor = (column: GridColDef<R>, anchor: HTMLElement) => {
    if (!filterModel.items.some((item) => item.field === column.field)) {
      const operator = getColumnFilterOperators(column)[0];
      setFilterModel({
        ...filterModel,
        items: [
          ...(disableMultipleColumnsFiltering ? [] : filterModel.items),
          { id: `filter-${Date.now()}`, field: column.field, operator: operator?.value ?? 'contains', value: getInitialFilterValue(operator) },
        ],
      });
    }
    setMenuPanel({ kind: 'filter', anchor: headerCellOf(anchor) });
  };

  const ColumnMenu: ComponentType<ComponentProps<typeof GridColumnMenu<any>>> = slots?.columnMenu ?? GridColumnMenu;

  const renderColumnMenu = () => {
    if (columnMenu && isRowGroupField(columnMenu.field)) {
      const groupColumn = columns.find((candidate) => candidate.field === columnMenu.field);
      // A column of the 'multiple' mode stands for one grouped field.
      const ownField = columnMenu.field.startsWith(ROW_GROUP_FIELD_PREFIX)
        ? columnMenu.field.slice(ROW_GROUP_FIELD_PREFIX.length, -2)
        : null;
      return groupColumn ? (
        <ColumnMenu
          {...slotProps?.columnMenu}
          column={groupColumn}
          anchorEl={columnMenu.anchor}
          onClose={() => setColumnMenu(null)}
          localeText={localeText}
          groupedColumns={(ownField === null ? rowGroupingModel : [ownField]).flatMap((field) => userColumnMap.get(field) ?? [])}
          onUngroup={(field) => setRowGroupingModel(rowGroupingModel.filter((item) => item !== field))}
          onManageColumns={() => setMenuPanel({ kind: 'columns', anchor: headerCellOf(columnMenu.anchor) })}
        />
      ) : null;
    }
    const column = columnMenu ? userColumnMap.get(columnMenu.field) : undefined;
    if (!columnMenu || !column) {
      return null;
    }
    const { field, anchor } = columnMenu;
    const availableFunctions = disableAggregation ? [] : getAvailableAggregationFunctions(column, aggregationFunctions);
    return (
      <ColumnMenu
          {...slotProps?.columnMenu}
        column={column}
        anchorEl={anchor}
        onClose={() => setColumnMenu(null)}
        localeText={localeText}
        sortDirection={sortModel.find((item) => item.field === field)?.sort}
        onSort={isSortable(column) ? (direction) => setSortModel(direction ? [{ field, sort: direction }] : sortModel.filter((item) => item.field !== field)) : undefined}
        onFilter={!disableColumnFilter && isFilterable(column) ? () => openFilterFor(column, anchor) : undefined}
        aggregationFunctions={availableFunctions}
        aggregation={aggregationModel[field]}
        getAggregationFunctionLabel={(fn) => getAggregationLabel(fn, aggregationFunctions, localeText)}
        onAggregationChange={(fn) => {
          const { [field]: _removed, ...rest } = aggregationModel;
          setAggregationModel(fn ? { ...rest, [field]: fn } : rest);
        }}
        grouped={rowGroupingModel.includes(field)}
        onToggleGroup={
          disableRowGrouping || (treeData && !serverRows?.groupsByColumns) || column.type === 'actions'
            ? undefined
            : () => setRowGroupingModel(rowGroupingModel.includes(field) ? rowGroupingModel.filter((item) => item !== field) : [...rowGroupingModel, field])
        }
        onHide={column.hideable === false ? undefined : () => setVisibilityModel({ ...visibilityModel, [field]: false })}
        onManageColumns={() => setMenuPanel({ kind: 'columns', anchor: headerCellOf(anchor) })}
        pinned={pinned.left?.includes(field) ? 'left' : pinned.right?.includes(field) ? 'right' : null}
        onPin={disableColumnPinning || column.pinnable === false ? undefined : (side) => pin(field, side)}
      />
    );
  };

  const startResize = (event: PointerEvent, column: GridColDef<R>, startWidth: number) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    // In a right-to-left grid a column grows to the left.
    const direction = isRtl ? -1 : 1;
    const minWidth = column.minWidth ?? 50;
    const maxWidth = column.maxWidth ?? Infinity;
    const onMove = (moveEvent: globalThis.PointerEvent) => {
      const width = Math.min(maxWidth, Math.max(minWidth, startWidth + direction * (moveEvent.clientX - startX)));
      setWidthOverrides((previous) => ({ ...previous, [column.field]: width }));
    };
    const onUp = (upEvent: globalThis.PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const width = Math.min(maxWidth, Math.max(minWidth, startWidth + direction * (upEvent.clientX - startX)));
      props.onColumnWidthChange?.({ field: column.field, width });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleDrop = (event: DragEvent, target: GridColDef<R>) => {
    event.preventDefault();
    const field = dragFieldRef.current;
    dragFieldRef.current = null;
    if (!field || field === target.field) {
      return;
    }
    const next = moveField(orderedFields, field, target.field);
    setColumnOrder(next);
    props.onColumnOrderChange?.(next);
  };

  // After an Alt+Arrow move the row sits elsewhere, so put the grid focus back on it.
  useEffect(() => {
    const id = pendingFocusRowRef.current;
    if (id === null) {
      return;
    }
    pendingFocusRowRef.current = null;
    const row = pageRowIds.indexOf(id);
    const col = columns.findIndex((column) => column.field === REORDER_FIELD);
    if (row !== -1 && col !== -1) {
      focusCell(row, col);
    }
  });

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    if (virtualize) {
      setScrollTop(element.scrollTop);
    }
    // Browsers report a right-to-left scroll position as a negative number.
    setScrollLeft(Math.abs(element.scrollLeft));
    const atEnd = element.scrollHeight > 0 && element.scrollTop + element.clientHeight >= element.scrollHeight - scrollEndThreshold;
    if (atEnd && !atScrollEndRef.current) {
      emit('rowsScrollEnd', {
        visibleRowsCount: rowEntryIndexes.length,
        viewportPageSize: Math.max(1, Math.floor(viewportHeight / rowHeight)),
      });
    }
    atScrollEndRef.current = atEnd;
  };

  // New rows arrived (or the rows changed), so reaching the bottom counts as a fresh arrival.
  useEffect(() => {
    atScrollEndRef.current = false;
  }, [entries.length]);

  const handleRowClick = (event: MouseEvent, node: GridTreeNode<R>) => {
    if (node.row) {
      emit('rowClick', { id: node.id, row: node.row }, event);
    }
    if (!rowSelection || disableRowSelectionOnClick || cellSelectionEnabled || !isSelectable(node.id, node.row) || editing) {
      return;
    }
    if (event.shiftKey && lastSelectedRef.current !== null) {
      const ids = rowEntryIndexes.map((index) => (entries[index] as Entry<R>).node.id);
      const from = ids.indexOf(lastSelectedRef.current);
      const to = ids.indexOf(node.id);
      if (from !== -1 && to !== -1) {
        const [start, end] = from < to ? [from, to] : [to, from];
        setSelection(ids.slice(start, end + 1).filter((id) => isSelectable(id, rowsById.get(id))));
        return;
      }
    }
    if (event.ctrlKey || event.metaKey) {
      toggleSelection(node.id, !selectedSet.has(node.id));
    } else {
      lastSelectedRef.current = node.id;
      setSelection([node.id]);
    }
  };

  const focusHeader = (col: number) => {
    shouldFocusHeaderRef.current = true;
    setHeaderFocusCol(Math.max(0, Math.min(columns.length - 1, col)));
  };

  /**
   * Keys on a focused column header: arrows move between headers and Down goes to the first row, Enter sorts (Shift+Enter adds to
   * the sort), Ctrl/Cmd+Enter or Alt+Down opens the column menu.
   */
  const handleHeaderKeyDown = (event: KeyboardEvent, col: number, sideways: number) => {
    const column = columns[col];
    if (sideways !== 0) {
      focusHeader(col + sideways);
    } else if (event.key === 'Home' || event.key === 'End') {
      focusHeader(event.key === 'Home' ? 0 : columns.length - 1);
    } else if (event.key === 'ArrowDown' && event.altKey) {
      const anchor = (event.target as HTMLElement).closest<HTMLElement>('[role="columnheader"]');
      if (!column || !anchor || !hasColumnMenu(column)) {
        return;
      }
      setColumnMenu({ field: column.field, anchor });
    } else if (event.key === 'ArrowDown') {
      if (rowEntryIndexes.length === 0) {
        return;
      }
      setHeaderFocusCol(null);
      focusCell(0, col);
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      const anchor = (event.target as HTMLElement).closest<HTMLElement>('[role="columnheader"]');
      if (!column || !anchor || !hasColumnMenu(column)) {
        return;
      }
      setColumnMenu({ field: column.field, anchor });
    } else if (event.key === 'Enter') {
      if (!column) {
        return;
      }
      emit('columnHeaderClick', { field: column.field, colDef: column }, event);
      handleSort(column, event as unknown as MouseEvent);
    } else {
      return;
    }
    event.preventDefault();
  };

  useEffect(() => {
    if (!shouldFocusHeaderRef.current || headerFocusCol === null) {
      return;
    }
    const scroller = scrollerRef.current;
    const element = scroller?.querySelector<HTMLElement>(`[data-headerindex="${headerFocusCol}"]`);
    if (element) {
      shouldFocusHeaderRef.current = false;
      element.focus();
    } else if (scroller && headerFocusCol >= leftCount && headerFocusCol < rightStart) {
      // A virtualized header renders once its column scrolls into view, and this effect runs again then.
      const before = (count: number) => widths.slice(0, count).reduce((total, width) => total + width, 0);
      scroller.scrollLeft = (isRtl ? -1 : 1) * (before(headerFocusCol) - before(leftCount));
    }
  }, [headerFocusCol, colWindow, widths, leftCount, rightStart, isRtl]);

  const handleKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.getAttribute('role') === 'combobox') {
      return;
    }
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && !event.altKey && (key === 'z' || key === 'y') && historyStackSize > 0) {
      event.preventDefault();
      void applyHistory(key === 'y' || event.shiftKey ? 'redo' : 'undo');
      return;
    }
    // Right and left swap in a right-to-left layout, so the arrows follow what the user sees.
    const sideways = event.key === 'ArrowRight' ? (isRtl ? -1 : 1) : event.key === 'ArrowLeft' ? (isRtl ? 1 : -1) : 0;
    const headerCell = target.closest<HTMLElement>('[data-headerindex]');
    if (headerCell) {
      handleHeaderKeyDown(event, Number(headerCell.dataset.headerindex), sideways);
      return;
    }
    const cell = target.closest<HTMLElement>('[data-rowindex]');
    if (!cell) {
      return;
    }
    const row = Number(cell.dataset.rowindex);
    const col = Number(cell.dataset.colindex);
    const entry = entries[rowEntryIndexes[row] ?? -1];
    const column = columns[col];

    if (entry?.node.row && column && !isSpecialField(column.field)) {
      emit('cellKeyDown', getCellParams(entry.node.id, entry.node.row, column), event);
    }

    const arrowStep: Record<string, [number, number]> = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, sideways], ArrowLeft: [0, sideways] };
    const step = arrowStep[event.key];
    if (cellSelectionEnabled && event.shiftKey && step) {
      const anchor = cellAnchorRef.current ?? { row, col };
      cellAnchorRef.current = anchor;
      const target = {
        row: Math.max(0, Math.min(rowEntryIndexes.length - 1, row + step[0])),
        col: Math.max(0, Math.min(columns.length - 1, col + step[1])),
      };
      selectCellRange(anchor, target);
      focusCell(target.row, target.col);
      event.preventDefault();
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        focusCell(row + 1, col);
        break;
      case 'ArrowUp':
        // From the first row the focus goes up into the column headers.
        if (row === 0 && !showListView) {
          focusHeader(col);
        } else {
          focusCell(row - 1, col);
        }
        break;
      case 'ArrowRight':
      case 'ArrowLeft':
        focusCell(row, col + sideways);
        break;
      case 'Home':
        focusCell(event.ctrlKey ? 0 : row, 0);
        break;
      case 'End':
        focusCell(event.ctrlKey ? rowEntryIndexes.length - 1 : row, columns.length - 1);
        break;
      case 'Enter':
      case 'F2':
        if (entry && column && isEditable(column, entry.node)) {
          if (editMode === 'row') {
            startRowEdit(entry.node.id);
          } else {
            startCellEdit(entry.node.id, column.field);
          }
          break;
        }
        return;
      case 'c':
      case 'C': {
        if (disableClipboardCopy || !(event.ctrlKey || event.metaKey) || window.getSelection()?.toString()) {
          return;
        }
        let text: string | null = null;
        if (cellSelectionEnabled && selectedCells.length > 0) {
          const selectedFields = new Set(selectedCells.map((cell) => cell.field));
          const selectedIds = new Set(selectedCells.map((cell) => cell.id));
          text = buildCsv(
            filteredRows.filter((row) => selectedIds.has(getRowId(row))),
            columns.filter((candidate) => selectedFields.has(candidate.field)),
            { delimiter: clipboardCopyCellDelimiter, includeHeaders: false, raw: ignoreValueFormatterDuringExport },
          );
        } else if (selection.length > 0) {
          text = buildCsv(
            filteredRows.filter((row) => selectedSet.has(getRowId(row))),
            exportColumns,
            { delimiter: clipboardCopyCellDelimiter, includeHeaders: false, raw: ignoreValueFormatterDuringExport },
          );
        } else if (entry?.node.row && column && !isSpecialField(column.field)) {
          text = getFormattedValue(entry.node.row, column);
        }
        if (text === null) {
          return;
        }
        void navigator.clipboard?.writeText(text).catch(() => undefined);
        props.onClipboardCopy?.(text);
        break;
      }
      case 'a':
      case 'A':
        if (!(event.ctrlKey || event.metaKey) || !rowSelection || disableMultipleRowSelection || cellSelectionEnabled) {
          return;
        }
        setSelection(selectableIds);
        break;
      case 'PageDown':
      case 'PageUp': {
        const page = Math.max(1, Math.floor(viewportHeight / (rowHeight ?? 52)) - 1);
        focusCell(Math.max(0, Math.min(rowEntryIndexes.length - 1, row + (event.key === 'PageDown' ? page : -page))), col);
        break;
      }
      case ' ':
        if (entry && rowSelection && isSelectable(entry.node.id, entry.node.row)) {
          toggleSelection(entry.node.id, !selectedSet.has(entry.node.id));
          break;
        }
        return;
      default:
        return;
    }
    event.preventDefault();
  };

  useEffect(() => {
    if (!shouldFocusRef.current || !focusPosition) {
      return;
    }
    const scroller = scrollerRef.current;
    const element = scroller?.querySelector<HTMLElement>(
      `[data-rowindex="${focusPosition.row}"][data-colindex="${focusPosition.col}"]`,
    );
    if (element) {
      shouldFocusRef.current = false;
      element.focus({ preventScroll: false });
    } else if (scroller) {
      if (virtualize) {
        const entryIndex = rowEntryIndexes[focusPosition.row];
        if (entryIndex !== undefined) {
          scroller.scrollTop = offsets[entryIndex] ?? 0;
        }
      }
      const { col } = focusPosition;
      if (col >= leftCount && col < rightStart && (col < colWindow.start || col >= colWindow.end)) {
        const before = (count: number) => widths.slice(0, count).reduce((total, width) => total + width, 0);
        scroller.scrollLeft = (isRtl ? -1 : 1) * (before(col) - before(leftCount));
      }
    }
  }, [focusPosition, range.start, range.end, rowEntryIndexes, offsets, virtualize, colWindow, widths, leftCount, rightStart]);

  // Row spanning: consecutive rows with the same value in a column share one tall cell. Keys are `${rowId}\u0000${field}`.
  const rowSpans = useMemo(() => {
    const spans = new Map<string, { count: number; height: number }>();
    const covered = new Map<string, GridRowId>();
    if (!rowSpanning) {
      return { spans, covered };
    }
    const comparable = (value: unknown) => (value instanceof Date ? value.getTime() : value);
    const dataNodes = pageNodes.filter((node) => node.row);
    for (const column of columns) {
      if (isSpecialField(column.field) || column.type === 'actions') {
        continue;
      }
      const valueAt = (node: GridTreeNode<R>) => {
        const row = node.row as R;
        const value = getCellValue(row, column);
        return comparable(column.rowSpanValueGetter ? column.rowSpanValueGetter(value, row) : value);
      };
      let start = 0;
      for (let index = 1; index <= dataNodes.length; index += 1) {
        const first = dataNodes[start] as GridTreeNode<R>;
        const here = dataNodes[index];
        const firstValue = valueAt(first);
        const sameRun =
          here !== undefined &&
          !isAutoHeightRow(first) &&
          !isAutoHeightRow(here) &&
          !detailIds.includes((dataNodes[index - 1] as GridTreeNode<R>).id) &&
          firstValue != null &&
          firstValue !== '' &&
          valueAt(here) === firstValue;
        if (sameRun) {
          continue;
        }
        const count = index - start;
        if (count > 1) {
          const run = dataNodes.slice(start, index);
          const height =
            run.reduce((total, node) => total + rowHeightFor(node), 0) -
            (rowSpacings.get(first.id)?.top ?? 0) -
            (rowSpacings.get((run[run.length - 1] as GridTreeNode<R>).id)?.bottom ?? 0);
          spans.set(`${first.id}\u0000${column.field}`, { count, height });
          for (const node of run.slice(1)) {
            covered.set(`${node.id}\u0000${column.field}`, first.id);
          }
        }
        start = index;
      }
    }
    return { spans, covered };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowSpanning, pageNodes, columns, detailIds, rowHeightFor, rowSpacings, isAutoHeightRow]);
  const renderedRowIds = useMemo(() => {
    const ids = new Set<GridRowId>();
    for (let index = range.start; index < range.end; index += 1) {
      const entry = entries[index];
      if (entry?.kind === 'row') {
        ids.add(entry.node.id);
      }
    }
    return ids;
  }, [entries, range.start, range.end]);

  /** Renders the cells of one row, leaving out columns scrolled out of view. */
  const renderColumns = (render: (column: GridColDef<R>, index: number) => ReactNode): ReactNode[] => {
    const out: ReactNode[] = [];
    const spacer = (key: string, width: number) => (
      <TableCell
        key={key}
        role="presentation"
        aria-hidden
        sx={{ width, minWidth: width, maxWidth: width, flex: '0 0 auto', height: '100%', p: 0, border: 0 }}
      />
    );
    const push = (index: number) => {
      const column = columns[index];
      if (column) {
        out.push(render(column, index));
      }
    };
    for (let index = 0; index < leftCount; index += 1) {
      push(index);
    }
    if (colWindow.leftSpacer > 0) {
      out.push(spacer('__spacer-left', colWindow.leftSpacer));
    }
    for (let index = colWindow.start; index < colWindow.end; index += 1) {
      push(index);
    }
    if (colWindow.rightSpacer > 0) {
      out.push(spacer('__spacer-right', colWindow.rightSpacer));
    }
    for (let index = rightStart; index < columns.length; index += 1) {
      push(index);
    }
    return out;
  };

  const spanWidth = (index: number, count: number) => widths.slice(index, index + count).reduce((total, width) => total + width, 0);

  const cellSx = (index: number, header: boolean) => {
    const column = columns[index] as GridColDef<R>;
    const width = widths[index] ?? 0;
    const align = (header ? column.headerAlign : undefined) ?? getDefaultAlign(column);
    const pin = index < leftCount ? 'left' : index >= rightStart ? 'right' : null;
    return {
      width,
      minWidth: width,
      maxWidth: width,
      flex: '0 0 auto',
      height: '100%',
      justifyContent: JUSTIFY[align],
      position: pin ? 'sticky' : 'relative',
      // Logical sides, so pinned columns stick to the start and end of a right-to-left grid as well.
      insetInlineStart: pin === 'left' ? leftOffsets[index] : undefined,
      insetInlineEnd: pin === 'right' ? rightOffsets[index] : undefined,
      zIndex: pin ? (header ? 4 : 2) : undefined,
      bgcolor: pin ? 'background.paper' : undefined,
      borderInlineEnd: (header ? showColumnVerticalBorder : showCellVerticalBorder) ? '1px solid var(--TstackDataGrid-border)' : undefined,
      ...ellipsisSx,
    } as const;
  };

  const renderValue = (column: GridColDef<R>, node: GridTreeNode<R>, row: R, wrapText: boolean): ReactNode => {
    const id = node.id;
    if (node.placeholder) {
      return isSpecialField(column.field) ? null : <Skeleton variant="text" sx={{ width: '80%' }} />;
    }
    if (node.row && serverRows?.isGroupRow(node.row) && !isSpecialField(column.field)) {
      const fn = aggregationModel[column.field];
      if (!fn || !serverRows.getAggregatedValue) {
        return null;
      }
      const formatted = formatAggregate(fn, serverRows.getAggregatedValue(node.row, column.field), column, aggregationFunctions[fn]);
      return `${formatted} (${getAggregationLabel(fn, aggregationFunctions, localeText).toLowerCase()})`;
    }
    if (column.type === 'actions' && column.getActions) {
      return column.getActions({ id, row, field: column.field });
    }
    if (isSpecialField(column.field) && column.renderCell) {
      return column.renderCell({ id, field: column.field, value: undefined, formattedValue: '', row, colDef: column });
    }
    const aggregates = nodeAggregates.get(id);
    const aggregateFn = aggregationModel[column.field];
    if (aggregates && aggregateFn && column.field in aggregates && aggregationPositions.get(id) === 'inline') {
      const formatted = formatAggregate(aggregateFn, aggregates[column.field], column, aggregationFunctions[aggregateFn]);
      return `${formatted} (${getAggregationLabel(aggregateFn, aggregationFunctions, localeText).toLowerCase()})`;
    }
    if (!node.row) {
      return null;
    }
    const value = getCellValue(row, column);
    const formattedValue = getFormattedValue(row, column, value);
    if (column.renderCell) {
      return column.renderCell({ id, field: column.field, value, formattedValue, row, colDef: column });
    }
    if (column.type === 'boolean') {
      return value ? <CheckIcon fontSize="small" aria-label={localeText.booleanTrue} /> : <CloseIcon fontSize="small" aria-label={localeText.booleanFalse} />;
    }
    return (
      <Box component="span" sx={wrapText ? wrappingTextSx : ellipsisSx}>
        {formattedValue}
      </Box>
    );
  };

  const renderEditor = (column: GridColDef<R>, node: GridTreeNode<R>, row: R, edit: EditState): ReactNode => {
    const value = edit.values[column.field];
    const applyEdit = (next: unknown, error?: boolean) =>
      setEditing((previous) =>
        previous && previous.id === node.id
          ? {
              ...previous,
              values: { ...previous.values, [column.field]: next },
              errors: error === undefined ? previous.errors : { ...previous.errors, [column.field]: error },
            }
          : previous,
      );
    const onChange = (next: unknown) => {
      const validate = column.preProcessEditCellProps;
      if (!validate) {
        applyEdit(next);
        return;
      }
      // Only the latest validation of a field may apply, so a slow async answer cannot overwrite newer input.
      const token = (validationTokensRef.current[column.field] = (validationTokensRef.current[column.field] ?? 0) + 1);
      applyEdit(next);
      const apply = (result: GridEditCellProps) => {
        if (validationTokensRef.current[column.field] === token) {
          applyEdit(result.value, Boolean(result.error));
        }
      };
      const result = validate({ id: node.id, row, hasChanged: true, props: { value: next, error: false } });
      if (result instanceof Promise) {
        void result.then(apply, () => undefined);
      } else {
        apply(result);
      }
    };
    const error = Boolean(edit.errors?.[column.field]);
    const onCommit = (reason?: GridEditStopReason) => void stopEdit({ reason: reason ?? 'enterKeyDown' });
    const onCancel = () => void stopEdit({ ignoreModifications: true });
    if (column.renderEditCell) {
      return column.renderEditCell({ id: node.id, field: column.field, value, row, colDef: column, error, onChange, onCommit, onCancel });
    }
    return (
      <GridCellEditor
        colDef={column}
        value={value}
        error={error}
        autoFocus={
          edit.field === column.field ||
          (edit.field === undefined && column.field === (edit.focusField && edit.focusField in edit.values ? edit.focusField : Object.keys(edit.values)[0]))
        }
        commitOnBlur={edit.field !== undefined}
        onChange={onChange}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    );
  };

  const renderRow = (node: GridTreeNode<R>, rowIndex: number | null, ariaIndex: number, extraSx?: object) => {
    const row = (node.row ?? EMPTY_OBJECT) as R;
    const selected = selectedSet.has(node.id);
    const edit = editing?.id === node.id ? editing : null;
    const autoHeight = isAutoHeightRow(node);
    const colSpans = new Map<number, number>();
    const skippedColumns = new Set<number>();
    if (hasColSpan && node.row) {
      columns.forEach((column, index) => {
        if (skippedColumns.has(index) || column.colSpan === undefined || isSpecialField(column.field)) {
          return;
        }
        const requested =
          typeof column.colSpan === 'function' ? column.colSpan(getCellValue(row, column), row, column) : column.colSpan;
        const regionEnd = index < leftCount ? leftCount : index >= rightStart ? columns.length : rightStart;
        const span = Math.max(1, Math.min(Math.floor(requested), regionEnd - index));
        if (span > 1) {
          colSpans.set(index, span);
          for (let offset = 1; offset < span; offset += 1) {
            skippedColumns.add(index + offset);
          }
        }
      });
    }
    return (
      <TableRow
        key={node.id}
        ref={autoHeight ? getRowRef(node.id) : undefined}
        role="row"
        hover
        selected={selected}
        aria-rowindex={ariaIndex}
        aria-selected={rowSelection ? selected : undefined}
        className={cx(
          gridClasses.row,
          detailIds.includes(node.id) && gridClasses['row--detailPanelExpanded'],
          node.row && getRowClassName ? getRowClassName({ id: node.id, row: node.row, indexRelativeToCurrentPage: rowIndex ?? -1 }) : undefined,
        )}
        onClick={(event) => handleRowClick(event, node)}
        onDoubleClick={(event) => {
          const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-field]');
          const field = cell?.dataset.field;
          const column = field ? userColumnMap.get(field) : undefined;
          if (node.row) {
            if (column) {
              emit('cellDoubleClick', getCellParams(node.id, node.row, column), event);
            }
            emit('rowDoubleClick', { id: node.id, row: node.row }, event);
          }
          if (column && isEditable(column, node)) {
            if (editMode === 'row') {
              startRowEdit(node.id);
            } else {
              startCellEdit(node.id, column.field);
            }
          }
        }}
        onDragOver={
          node.row || (canChangeParent && !isTreeReorder && node.groupField)
            ? (event) => {
                const dragged = dragRowRef.current;
                if (dragged === null || dragged === node.id || !canDropRowOn(dragged, node.id)) {
                  return;
                }
                event.preventDefault();
                const bounds = event.currentTarget.getBoundingClientRect();
                // Dropping on the lower half of a row moves the dragged row below it, unless that would not move it at all.
                const after = event.clientY > bounds.top + bounds.height / 2 && rowOrderPosition(dragged) < rowOrderPosition(node.id);
                setDropTarget((previous) => (previous?.id === node.id && previous.after === after ? previous : { id: node.id, after }));
              }
            : undefined
        }
        onDrop={
          node.row || (canChangeParent && !isTreeReorder && node.groupField)
            ? (event) => {
                event.preventDefault();
                const dragged = dragRowRef.current;
                dragRowRef.current = null;
                setDropTarget(null);
                if (dragged !== null && dragged !== node.id && canDropRowOn(dragged, node.id)) {
                  void dropRowOn(dragged, node.id);
                }
              }
            : undefined
        }
        sx={{
          height: autoHeight ? 'auto' : rowHeightFor(node),
          minHeight: autoHeight ? rowHeight + (rowSpacings.get(node.id)?.top ?? 0) + (rowSpacings.get(node.id)?.bottom ?? 0) : undefined,
          boxSizing: 'border-box',
          paddingTop: `${rowSpacings.get(node.id)?.top ?? 0}px`,
          paddingBottom: `${rowSpacings.get(node.id)?.bottom ?? 0}px`,
          width: totalWidth,
          ...(dropTarget?.id === node.id && {
            boxShadow: (theme: Theme) => `inset 0 ${dropTarget.after ? -2 : 2}px 0 ${theme.palette.primary.main}`,
          }),
          ...extraSx,
        }}
      >
        {renderColumns((column, index) => {
          if (skippedColumns.has(index)) {
            return null;
          }
          const spanKey = `${node.id}\u0000${column.field}`;
          const rowSpan = rowSpans.spans.get(spanKey);
          const coveredBy = rowSpans.covered.get(spanKey);
          // A covered cell stays as an empty slot while the tall cell above is on screen, and shows its own value when that row scrolled away.
          if (coveredBy !== undefined && renderedRowIds.has(coveredBy)) {
            return <TableCell key={column.field} role="presentation" aria-hidden sx={{ ...cellSx(index, false), p: 0, borderBottom: 0 }} />;
          }
          const colSpanCount = colSpans.get(index) ?? 1;
          const editingCell = edit !== null && column.field in edit.values && isEditable(column, node);
          const selectedCell = cellSelectionEnabled && Boolean(cellSelection[node.id]?.[column.field]);
          const selectable = cellSelectionEnabled && rowIndex !== null && !isSpecialField(column.field) && !editingCell;
          const focused =
            rowIndex !== null &&
            (focusPosition ? focusPosition.row === rowIndex && focusPosition.col === index : rowIndex === 0 && index === 0);
          return (
            <TableCell
              key={column.field}
              role="gridcell"
              data-field={column.field}
              data-rowindex={rowIndex ?? undefined}
              data-colindex={index}
              aria-colindex={index + 1}
              aria-colspan={colSpanCount > 1 ? colSpanCount : undefined}
              aria-rowspan={rowSpan?.count}
              className={cx(
                gridClasses.cell,
                gridClasses[`cell--text${capitalize(getDefaultAlign(column))}`],
                editingCell && gridClasses['cell--editing'],
                selectedCell && gridClasses['cell--selected'],
                index < leftCount && gridClasses['cell--pinnedLeft'],
                index >= rightStart && gridClasses['cell--pinnedRight'],
                ...(node.row && !isSpecialField(column.field)
                  ? [
                      typeof column.cellClassName === 'function'
                        ? column.cellClassName(getCellParams(node.id, row, column))
                        : column.cellClassName,
                      getCellClassName?.(getCellParams(node.id, row, column)),
                    ]
                  : []),
              )}
              aria-selected={cellSelectionEnabled && !isSpecialField(column.field) ? selectedCell : undefined}
              onMouseDown={selectable ? (event) => handleCellMouseDown(event, node.id, rowIndex, index, column.field) : undefined}
              onMouseEnter={selectable ? () => extendCellDrag(rowIndex, index) : undefined}
              tabIndex={rowIndex !== null && focused && !editingCell && headerFocusCol === null ? 0 : -1}
              onFocus={headerFocusCol !== null ? () => setHeaderFocusCol(null) : undefined}
              onClick={(event) => {
                if (rowIndex !== null) {
                  setFocusPosition({ row: rowIndex, col: index });
                }
                if (node.row && !isSpecialField(column.field)) {
                  emit('cellClick', getCellParams(node.id, node.row, column), event);
                }
              }}
              sx={{
                ...cellSx(index, false),
                // The doubled selector outranks the grid-wide rule that removes vertical cell padding.
                ...(autoHeight && { height: 'auto', alignSelf: 'stretch', ...wrappingTextSx, '&&': { paddingBlock: '8px' } }),
                ...(colSpanCount > 1 && {
                  width: spanWidth(index, colSpanCount),
                  minWidth: spanWidth(index, colSpanCount),
                  maxWidth: spanWidth(index, colSpanCount),
                }),
                ...(rowSpan && {
                  height: rowSpan.height,
                  alignSelf: 'flex-start',
                  bgcolor: 'background.paper',
                  zIndex: index < leftCount || index >= rightStart ? 3 : 1,
                  borderBottom: '1px solid var(--TstackDataGrid-border)',
                }),
                outlineOffset: -2,
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
                ...(cellSelectionEnabled && { userSelect: 'none' }),
                // A gradient over the cell's own background, so pinned cells stay opaque.
                ...(selectedCell && {
                  backgroundImage: (theme: Theme) => `linear-gradient(${alpha(theme.palette.primary.main, 0.18)}, ${alpha(theme.palette.primary.main, 0.18)})`,
                }),
              }}
            >
              {editingCell && edit ? renderEditor(column, node, row, edit) : renderValue(column, node, row, autoHeight)}
            </TableCell>
          );
        })}
      </TableRow>
    );
  };

  /** A row of aggregated values: the grand total, or the footer of a group (`group`), which labels its grouping cell. */
  const renderAggregateRow = (key: string, values: Record<string, unknown>, rowHeightValue: number, group: GridTreeNode<R> | null) => (
    <TableRow key={key} role="row" className={gridClasses.aggregationRow} data-group-footer={group ? String(group.id) : undefined} sx={{ height: rowHeightValue, width: totalWidth }}>
      {renderColumns((column, index) => {
        const fn = aggregationModel[column.field];
        const isGroupingCell = group !== null && (column.field === ROW_GROUP_FIELD || column.field === TREE_GROUP_FIELD || column.field === `${ROW_GROUP_FIELD_PREFIX}${group.groupField}__`);
        return (
          <TableCell key={column.field} role="gridcell" sx={{ ...cellSx(index, false), fontWeight: 500, color: 'primary.main' }}>
            {isGroupingCell ? (
              <Box component="span" sx={{ ...ellipsisSx, paddingInlineStart: column.field.startsWith(ROW_GROUP_FIELD_PREFIX) ? '30px' : `${group.depth * 20 + 30}px` }}>
                {localeText.groupFooterLabel(group.label)}
              </Box>
            ) : fn && column.field in values ? (
              formatAggregate(fn, values[column.field], column, aggregationFunctions[fn])
            ) : null}
          </TableCell>
        );
      })}
    </TableRow>
  );

  const renderHeaderCell = (column: GridColDef<R>, index: number) => {
    const sortItem = sortModel.find((item) => item.field === column.field);
    const sortIndex = sortModel.findIndex((item) => item.field === column.field);
    const sortable = isSortable(column);
    const menuOpen = columnMenu?.field === column.field;
    const resizable = !disableColumnResize && column.resizable !== false && !isSpecialField(column.field);
    const reorderable =
      !disableColumnReorder && !column.disableReorder && index >= leftCount && index < rightStart && !isSpecialField(column.field);
    const direction: GridSortDirection = sortItem?.sort;
    const content = column.renderHeader ? column.renderHeader({ colDef: column }) : (column.headerName ?? column.field);
    const headerAlign = column.headerAlign ?? getDefaultAlign(column);
    const aggregateFn = aggregationModel[column.field];

    return (
      <TableCell
        key={column.field}
        role="columnheader"
        aria-colindex={index + 1}
        data-headerindex={index}
        tabIndex={headerFocusCol === index ? 0 : -1}
        onFocus={(event) => {
          // Only the header itself takes the tab stop, not its menu button.
          if (event.target === event.currentTarget && headerFocusCol !== index) {
            setHeaderFocusCol(index);
          }
        }}
        aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : undefined}
        className={cx(
          gridClasses.columnHeader,
          sortable && gridClasses['columnHeader--sortable'],
          direction && gridClasses['columnHeader--sorted'],
          index < leftCount && gridClasses['columnHeader--pinnedLeft'],
          index >= rightStart && gridClasses['columnHeader--pinnedRight'],
          column.headerClassName,
        )}
        title={column.description}
        draggable={reorderable}
        onDragStart={reorderable ? () => (dragFieldRef.current = column.field) : undefined}
        onDragOver={reorderable ? (event) => event.preventDefault() : undefined}
        onDrop={reorderable ? (event) => handleDrop(event, column) : undefined}
        onClick={(event) => {
          emit('columnHeaderClick', { field: column.field, colDef: column }, event);
          handleSort(column, event);
        }}
        sx={{
          ...cellSx(index, true),
          cursor: sortable ? 'pointer' : 'default',
          userSelect: 'none',
          outlineOffset: -2,
          '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
          flexDirection: headerAlign === 'right' ? 'row-reverse' : 'row',
          justifyContent: 'space-between',
          // The menu button takes no room until it shows, so it does not squeeze the header text.
          '&:hover .TstackDataGrid-menuButton, &:focus-within .TstackDataGrid-menuButton': menuButtonShownSx,
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, alignItems: JUSTIFY[headerAlign] }}>
          {sortable ? (
            <TableSortLabel
              active={Boolean(direction)}
              direction={direction === 'desc' ? 'desc' : 'asc'}
              hideSortIcon={column.hideSortIcons}
              className={gridClasses.columnHeaderTitle}
              sx={{ ...ellipsisSx, maxWidth: '100%', flexDirection: headerAlign === 'right' ? 'row-reverse' : 'row' }}
            >
              {content}
              {sortModel.length > 1 && sortIndex !== -1 && (
                <Box component="sup" sx={{ ml: 0.25 }}>
                  {sortIndex + 1}
                </Box>
              )}
            </TableSortLabel>
          ) : (
            <Box component="span" className={gridClasses.columnHeaderTitle} sx={{ ...ellipsisSx, maxWidth: '100%' }}>
              {content}
            </Box>
          )}
          {aggregateFn && (
            <Box component="span" sx={{ color: 'text.secondary', fontSize: 12, fontWeight: 400, lineHeight: 1.2 }}>
              {aggregationFunctions[aggregateFn]?.label ?? aggregateFn}
            </Box>
          )}
        </Box>
        {hasColumnMenu(column) && (
          <IconButton
            className="TstackDataGrid-menuButton"
            size="small"
            aria-label={`${column.headerName ?? column.field} ${localeText.columnMenuLabel}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            draggable={false}
            onClick={(event) => {
              event.stopPropagation();
              setColumnMenu(menuOpen ? null : { field: column.field, anchor: event.currentTarget });
            }}
            sx={{ flexShrink: 0, p: 0, width: 0, opacity: 0, overflow: 'hidden', '& svg': { fontSize: 18 }, ...(menuOpen && menuButtonShownSx) }}
          >
            <MoreVertIcon />
          </IconButton>
        )}
        {resizable && (
          <Box
            role="separator"
            aria-orientation="vertical"
            onPointerDown={(event) => startResize(event, column, widths[index] ?? 0)}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={
              disableAutosize
                ? undefined
                : (event) => {
                    event.stopPropagation();
                    autosizeColumns({ columns: [column.field] });
                  }
            }
            sx={{
              position: 'absolute',
              top: 0,
              insetInlineEnd: 0,
              bottom: 0,
              width: 10,
              cursor: 'col-resize',
              touchAction: 'none',
              '&::after': {
                content: '""',
                position: 'absolute',
                top: '50%',
                insetInlineEnd: 4,
                width: 2,
                height: 24,
                transform: 'translateY(-50%)',
                bgcolor: 'var(--TstackDataGrid-border)',
              },
            }}
          />
        )}
      </TableCell>
    );
  };

  const renderHeaderFilterCell = (column: GridColDef<R>, index: number) => {
    const item = filterModel.items.find((candidate) => candidate.field === column.field);
    const filterable = !disableColumnFilter && isFilterable(column) && !isSpecialField(column.field);
    return (
      <TableCell key={column.field} role="columnheader" aria-colindex={index + 1} sx={{ ...cellSx(index, true), overflow: 'visible' }}>
        {filterable && (
          <GridHeaderFilterCell
            column={column}
            item={item}
            localeText={localeText}
            onChange={(next) =>
              setFilterModel({
                ...filterModel,
                items:
                  next === null
                    ? filterModel.items.filter((candidate) => candidate !== item)
                    : item
                      ? filterModel.items.map((candidate) => (candidate === item ? next : candidate))
                      : [...(disableMultipleColumnsFiltering ? [] : filterModel.items), next],
              })
            }
          />
        )}
      </TableCell>
    );
  };

  const getPinnedRowNode = (row: R): GridTreeNode<R> => ({ id: getRowId(row), depth: 0, row, label: '', children: [], rowCount: 1 });

  const visibleEntries = entries.slice(range.start, range.end);
  const spacerSx = { display: 'block', width: totalWidth, borderBottom: 0, p: 0 } as const;
  const headerRowCount = showListView ? 0 : groupHeaderRows.length + 1 + (headerFilters ? 1 : 0);
  const headerBlockHeight = showListView
    ? 0
    : groupHeaderRows.length * (props.columnGroupHeaderHeight ?? headerHeight) + headerHeight + (headerFilters ? filterRowHeight : 0);
  const totalRowCount = rootCount;
  const toolbarProps = {
    columns: userColumns,
    columnVisibilityModel: effectiveVisibility,
    onColumnVisibilityModelChange: setVisibilityModel,
    filterModel,
    onFilterModelChange: setFilterModel,
    density,
    onDensityChange: setDensity,
    localeText,
    exportDataAsCsv: () => exportDataAsCsv(),
    exportDataAsExcel: disableExcelExport ? undefined : () => exportDataAsExcel(),
    print: () => print(),
    disableColumnSelector,
    disableDensitySelector,
    disableFilterSelector: disableColumnFilter,
    filterColumns: pivoting?.sourceColumns,
    onOpenPivotPanel: pivoting ? (anchor: HTMLElement) => setMenuPanel({ kind: 'pivot', anchor }) : undefined,
    pivotActive: pivoting?.enabled,
    onOpenChartsPanel: chartsEnabled ? (anchor: HTMLElement) => setMenuPanel({ kind: 'charts', anchor }) : undefined,
    ...(historyStackSize > 0 && !isPivoted
      ? { onUndo: () => void applyHistory('undo'), onRedo: () => void applyHistory('redo'), canUndo, canRedo }
      : {}),
    disableMultipleColumnsFiltering,
  };
  const Toolbar: ComponentType<GridToolbarProps<any>> = slots?.toolbar ?? GridToolbar;
  const FilterPanel: ComponentType<GridFilterPanelSlotProps<any>> = slots?.filterPanel ?? GridFilterPanel;
  const ColumnsPanel: ComponentType<GridColumnsPanelSlotProps<any>> = slots?.columnsPanel ?? GridColumnsPanel;
  const PivotPanel: ComponentType<GridPivotPanelSlotProps<any>> = slots?.pivotPanel ?? GridPivotPanel;
  const ChartsPanel: ComponentType<GridChartsPanelSlotProps<any>> = slots?.chartsPanel ?? GridChartsPanel;
  const NoRowsOverlay = slots?.noRowsOverlay;
  const LoadingOverlay = slots?.loadingOverlay;
  const FooterSlot = slots?.footer;
  const PaginationSlot = slots?.pagination;
  const showFooter = !hideFooter;
  const footerRowCount = paginationMode === 'server' ? (rowCount ?? totalRowCount) : totalRowCount;
  const bottomRows = pinnedRows?.bottom ?? EMPTY_ARRAY;
  const topRows = pinnedRows?.top ?? EMPTY_ARRAY;
  const footerValues = serverAggregated ? (serverRows?.footerAggregates ?? null) : isPivoted ? (pivoting?.totals ?? null) : footerAggregates;
  const hasFooterAggregates = footerValues !== null && Object.keys(footerValues).length > 0;

  // The page size that fills the body: the scroller less the headers, the pinned rows and the aggregation footer.
  const autoSize =
    autoPageSize && pagination && containerHeight > 0
      ? Math.max(
          1,
          Math.floor(
            (containerHeight - headerBlockHeight - (topRows.length + bottomRows.length + (hasFooterAggregates ? 1 : 0)) * rowHeight) / rowHeight,
          ),
        )
      : null;
  useEffect(() => {
    if (autoSize !== null && autoSize !== paginationModel.pageSize) {
      setPaginationModel({ ...paginationModel, pageSize: autoSize });
    }
  }, [autoSize, paginationModel, setPaginationModel]);

  return (
    <GridApiContext.Provider value={contextApiRef}>
    <GridRootPropsContext.Provider value={props}>
    <Paper
      ref={rootElementRef}
      variant="outlined"
      dir={isRtl ? 'rtl' : undefined}
      className={cx(gridClasses.root, props.className)}
      style={props.style}
      sx={[
        (rootTheme) => getBorderVariables(rootTheme),
        { display: 'flex', flexDirection: 'column', position: 'relative', p: 2, pb: showFooter ? 0 : 2, borderRadius: '8px', '&&': { borderColor: 'var(--TstackDataGrid-border)' } },
        (rootTheme) => resolveStyleOverrides(themeOverrides, { ownerState: props, theme: rootTheme }) as object,
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {showToolbar && <Toolbar {...toolbarProps} {...slotProps?.toolbar} />}
      {renderColumnMenu()}
      <Popover
        open={menuPanel !== null}
        anchorEl={menuPanel?.anchor}
        onClose={() => setMenuPanel(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        {menuPanel?.kind === 'filter' && (
          <FilterPanel
            columns={pivoting?.sourceColumns ?? userColumns}
            filterModel={filterModel}
            onFilterModelChange={setFilterModel}
            localeText={localeText}
            disableMultipleFilters={disableMultipleColumnsFiltering}
            {...slotProps?.filterPanel}
          />
        )}
        {menuPanel?.kind === 'columns' && (
          <ColumnsPanel
            columns={userColumns}
            columnVisibilityModel={effectiveVisibility}
            onColumnVisibilityModelChange={setVisibilityModel}
            localeText={localeText}
            {...slotProps?.columnsPanel}
          />
        )}
        {chartsPanelOpen && chartData && (
          <ChartsPanel
            seriesColumns={chartSeriesColumns}
            categoryColumns={chartCategoryColumns}
            grouped={isGroup && !isPivoted}
            model={chartsModel}
            onModelChange={setChartsModel}
            data={chartData}
            localeText={localeText}
            {...slotProps?.chartsPanel}
          />
        )}
        {menuPanel?.kind === 'pivot' && pivoting && (
          <PivotPanel
            columns={pivoting.pivotColumns}
            active={pivoting.enabled}
            onActiveChange={pivoting.setEnabled}
            model={pivoting.model}
            onModelChange={pivoting.setModel}
            getAvailableFunctions={(column) => getAvailableAggregationFunctions(column, aggregationFunctions)}
            getFunctionLabel={(fn) => getAggregationLabel(fn, aggregationFunctions, localeText)}
            localeText={localeText}
            {...slotProps?.pivotPanel}
          />
        )}
      </Popover>
      {loading &&
        (LoadingOverlay ? (
          <LoadingOverlay localeText={localeText} {...slotProps?.loadingOverlay} />
        ) : (
          <GridLoadingIndicator variant={loadingVariant} label={localeText.loadingLabel} />
        ))}
      <TableContainer
        className={cx(gridClasses.main, gridClasses.virtualScroller)}
        ref={scrollerRef}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        sx={{ height: autoHeight ? 'auto' : height, position: 'relative', overflow: 'auto', ...(hasAutoHeightRows && { overflowAnchor: 'none' }) }}
      >
        <Table
          role="grid"
          aria-rowcount={totalRowCount + headerRowCount}
          aria-colcount={columns.length}
          aria-busy={loading}
          sx={{
            display: 'block',
            width: totalWidth,
            minWidth: '100%',
            '& .MuiTableHead-root, & .MuiTableBody-root, & .MuiTableFooter-root': { display: 'block', padding: 0 },
            '& .MuiTableRow-root': { width: totalWidth, borderBottomColor: 'var(--TstackDataGrid-border)' },
            '& .MuiTableHead-root .MuiTableCell-root': { fontWeight: 600 },
            '& .MuiTableCell-root': { paddingBlock: 0, paddingInline: '10px', boxSizing: 'border-box' },
          }}
        >
          {!showListView && (
          <TableHead className={gridClasses.columnHeaders} sx={{ position: 'sticky', top: 0, zIndex: 3, bgcolor: 'background.paper' }}>
            {groupHeaderRows.map((cells, level) => (
              <TableRow key={`group-${level}`} className={gridClasses.columnGroupHeader} sx={{ height: props.columnGroupHeaderHeight ?? headerHeight }}>
                {cells.map((cell) => {
                  const spanWidth = widths.slice(cell.startIndex, cell.startIndex + cell.span).reduce((total, width) => total + width, 0);
                  return (
                    <TableCell
                      key={`${cell.groupId ?? 'none'}-${cell.startIndex}`}
                      role="columnheader"
                      aria-colspan={cell.span}
                      sx={{ width: spanWidth, minWidth: spanWidth, maxWidth: spanWidth, flex: '0 0 auto', height: '100%', justifyContent: 'center', fontWeight: 600, ...ellipsisSx }}
                    >
                      {cell.headerName}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
            <TableRow aria-rowindex={groupHeaderRows.length + 1} sx={{ height: headerHeight }}>
              {renderColumns(renderHeaderCell)}
            </TableRow>
            {headerFilters && (
              <TableRow aria-rowindex={headerRowCount} className={gridClasses.headerFilterRow} sx={{ height: filterRowHeight }}>
                {renderColumns(renderHeaderFilterCell)}
              </TableRow>
            )}
          </TableHead>
          )}

          {topRows.length > 0 && (
            <TableBody className={cx(gridClasses.pinnedRows, gridClasses['pinnedRows--top'])} sx={{ position: 'sticky', top: headerBlockHeight, zIndex: 2, bgcolor: 'background.paper' }}>
              {topRows.map((row, index) => renderRow(getPinnedRowNode(row), null, headerRowCount + index + 1))}
            </TableBody>
          )}

          <TableBody>
            {range.offsetTop > 0 && <TableRow aria-hidden role="presentation" sx={{ ...spacerSx, height: range.offsetTop }} />}
            {visibleEntries.map((entry, offset) => {
              const entryIndex = range.start + offset;
              if (entry.kind === 'groupFooter') {
                return renderAggregateRow(`${entry.node.id}-footer`, nodeAggregates.get(entry.node.id) ?? EMPTY_OBJECT, entry.height, entry.node);
              }
              if (entry.kind === 'detail') {
                const panelWidth = Math.min(totalWidth, containerWidth || totalWidth);
                return (
                  <TableRow
                    key={`${entry.node.id}-detail`}
                    className={gridClasses.detailPanel}
                    ref={entry.auto ? getRowRef(detailKey(entry.node.id)) : undefined}
                    role="row"
                    sx={{ height: entry.auto ? 'auto' : entry.height, width: totalWidth }}
                  >
                    <TableCell
                      role="gridcell"
                      sx={{ position: 'sticky', insetInlineStart: 0, width: panelWidth, height: entry.auto ? 'auto' : '100%', overflow: entry.auto ? 'visible' : 'auto', display: 'block', py: 0 }}
                    >
                      {entry.node.row && getDetailPanelContent?.({ id: entry.node.id, row: entry.node.row })}
                    </TableCell>
                  </TableRow>
                );
              }
              const rowIndex = rowEntryIndexes.indexOf(entryIndex);
              return renderRow(entry.node, rowIndex, headerRowCount + topRows.length + rowIndex + 1);
            })}
            {range.offsetBottom > 0 && <TableRow aria-hidden role="presentation" sx={{ ...spacerSx, height: range.offsetBottom }} />}
            {entries.length === 0 && !loading && (
              <TableRow>
                <TableCell
                  role="gridcell"
                  className={gridClasses.overlay}
                  sx={{ position: 'sticky', insetInlineStart: 0, width: containerWidth || '100%', minHeight: rowHeight * 2, justifyContent: 'center', color: 'text.secondary' }}
                >
                  {NoRowsOverlay ? <NoRowsOverlay localeText={localeText} {...slotProps?.noRowsOverlay} /> : localeText.noRowsLabel}
                </TableCell>
              </TableRow>
            )}
          </TableBody>

          {(bottomRows.length > 0 || hasFooterAggregates) && (
            <TableFooter sx={{ position: 'sticky', bottom: 0, zIndex: 3, bgcolor: 'background.paper' }}>
              {bottomRows.map((row, index) => renderRow(getPinnedRowNode(row), null, headerRowCount + topRows.length + totalRowCount + index + 1))}
              {hasFooterAggregates && footerValues && renderAggregateRow('__aggregation-footer__', footerValues, rowHeight, null)}
            </TableFooter>
          )}
        </Table>
      </TableContainer>
      {showFooter && FooterSlot && (
        <FooterSlot selectedRowCount={selection.length} rowCount={footerRowCount} localeText={localeText} {...slotProps?.footer} />
      )}
      {showFooter && !FooterSlot && (
        <Box className={gridClasses.footerContainer} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: 1, borderColor: 'var(--TstackDataGrid-border)' }}>
          <Box className={gridClasses.selectedRowCount} sx={{ pl: 2, color: 'text.secondary' }}>
            {!hideFooterSelectedRowCount && selection.length > 0 && (checkboxSelection || rowSelection) ? localeText.footerRowsSelected(selection.length) : null}
          </Box>
          {pagination && !hideFooterPagination && PaginationSlot && (
            <PaginationSlot
              count={footerRowCount}
              page={paginationMode === 'server' ? paginationModel.page : page}
              pageSize={paginationModel.pageSize}
              pageSizeOptions={autoPageSize ? EMPTY_ARRAY : pageSizeOptions}
              onPaginationModelChange={setPaginationModel}
              localeText={localeText}
              {...slotProps?.pagination}
            />
          )}
          {pagination && !hideFooterPagination && !PaginationSlot && (
            <TablePagination
              component="div"
              count={footerRowCount}
              page={paginationMode === 'server' ? paginationModel.page : page}
              rowsPerPage={paginationModel.pageSize}
              rowsPerPageOptions={autoPageSize ? [] : [...pageSizeOptions]}
              labelRowsPerPage={localeText.paginationRowsPerPage}
              onPageChange={(_, nextPage) => setPaginationModel({ ...paginationModel, page: nextPage })}
              onRowsPerPageChange={(event) => setPaginationModel({ page: 0, pageSize: Number(event.target.value) })}
              // Opens the menu 8px left of the select so the options' 8px padding puts their text under the selected value.
              slotProps={{
                select: {
                  MenuProps: {
                    anchorOrigin: { vertical: 'bottom', horizontal: 'left' },
                    transformOrigin: { vertical: 'top', horizontal: 'left' },
                    slotProps: { paper: { sx: { ml: -1, '& .MuiMenuItem-root': { fontSize: 12, pl: 1, pr: 2 } } } },
                  },
                },
              }}
              sx={{ '& .MuiTablePagination-select, & .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': { fontSize: 12, lineHeight: '20px' }, '& .MuiTablePagination-select.MuiSelect-select': { lineHeight: '24px' } }}
            />
          )}
        </Box>
      )}
    </Paper>
    </GridRootPropsContext.Provider>
    </GridApiContext.Provider>
  );
}

/** Loads `rows` and `rowCount` from the data source whenever what they depend on changes. */
function DataSourceGrid<R extends GridValidRowModel>(props: DataGridProps<R> & { dataSource: GridDataSource<R> }) {
  const { pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS } = props;
  const { serverPivot, ...serverProps } = useGridDataSource(props, { page: 0, pageSize: pageSizeValue(pageSizeOptions[0] ?? 10) });
  const sourceRowsRef = useRef<GridPivoting<R>['sourceRowsRef']['current']>(null);
  const pivotColumns = useMemo(
    () =>
      props.getPivotDerivedColumns
        ? withPivotDerivedColumns(props.columns, props.getPivotDerivedColumns as (column: GridColDef<R>) => GridColDef<R>[] | undefined)
        : props.columns,
    [props.columns, props.getPivotDerivedColumns],
  );
  if (!serverPivot.available) {
    return <DataGridBase<R> {...props} {...serverProps} />;
  }
  const layout = serverPivot.layout;
  // Derived fields only exist for the server when the consumer asked for them, since the server has to compute them.
  const pivoting: GridPivoting<R> = {
    enabled: serverPivot.enabled,
    applied: serverPivot.applied,
    model: serverPivot.model,
    setEnabled: serverPivot.setEnabled,
    setModel: serverPivot.setModel,
    sourceColumns: props.columns,
    pivotColumns,
    totals: null,
    rowLabelColumn: null,
    sourceRowsRef,
  };
  const { rowGroupingModel: _rows, onRowGroupingModelChange: _onRows, onAggregationModelChange: _onAggregation, ...overrides } = PIVOT_ROW_PROP_OVERRIDES;
  const pivotProps = layout
    ? ({
        ...overrides,
        columnGroupingModel: layout.columnGroupingModel,
        groupingColDef: {
          ...(layout.rowHeaderName ? { headerName: layout.rowHeaderName } : {}),
          ...(typeof props.groupingColDef === 'function' ? props.groupingColDef({ groupingField: null, fields: [] }) : props.groupingColDef),
        },
      } as unknown as Partial<DataGridProps<R>>)
    : undefined;
  return <DataGridBase<R> {...props} {...serverProps} {...pivotProps} pivoting={pivoting} />;
}

const getPivotRowId = (row: GridValidRowModel): GridRowId => row[PIVOT_ROW_ID];
const getPivotRowPath = (row: GridValidRowModel): string[] => row[PIVOT_ROW_PATH];

/** Props that describe source rows, or act on them, and make no sense for generated rows. */
const PIVOT_ROW_PROP_OVERRIDES = {
  rowSelection: false,
  checkboxSelection: false,
  keepNonExistentRowsSelected: true,
  rowReordering: false,
  rowSpanning: false,
  disableRowGrouping: true,
  disableAggregation: true,
  rowGroupingModel: [],
  onRowGroupingModelChange: undefined,
  onAggregationModelChange: undefined,
  getDetailPanelContent: undefined,
  getChildrenCount: undefined,
  onFetchChildren: undefined,
  pinnedRows: undefined,
  getRowHeight: undefined,
  getRowSpacing: undefined,
  getRowClassName: undefined,
  getCellClassName: undefined,
  isRowSelectable: undefined,
  isCellEditable: undefined,
  onRowClick: undefined,
  onRowDoubleClick: undefined,
  onCellClick: undefined,
  onCellDoubleClick: undefined,
  onCellKeyDown: undefined,
} as const;

/**
 * Sits above the grid and swaps in generated rows and columns while a pivot table shows.
 * It stays mounted when pivoting toggles, so the grid keeps its scroll position, column widths and the rest of its state.
 */
function PivotingGrid<R extends GridValidRowModel>(props: DataGridProps<R>) {
  const { rows, columns, initialState, disablePivoting = false, sortingMode, filterMode, paginationMode } = props;
  const [filterModel, setFilterModel] = useGridState(
    props.filterModel,
    initialState?.filter?.filterModel ?? DEFAULT_FILTER_MODEL,
    props.onFilterModelChange,
  );
  const [enabled, setEnabled] = useGridState(props.pivotActive, initialState?.pivoting?.enabled ?? false, props.onPivotActiveChange);
  const [model, setModel] = useGridState(props.pivotModel, initialState?.pivoting?.model ?? EMPTY_PIVOT_MODEL, props.onPivotModelChange);
  const sourceRowsRef = useRef<GridPivoting<R>['sourceRowsRef']['current']>(null);

  const available = !disablePivoting && (sortingMode ?? 'client') === 'client' && (filterMode ?? 'client') === 'client' && (paginationMode ?? 'client') === 'client';
  const applied = available && enabled && !isPivotModelEmpty(model);
  const functions = props.aggregationFunctions ?? GRID_AGGREGATION_FUNCTIONS;
  const totalLabel = props.localeText?.pivotTotal ?? DEFAULT_LOCALE_TEXT.pivotTotal;
  const { getPivotDerivedColumns = getDefaultPivotDerivedColumns, pivotingColDef, ignoreDiacritics } = props;

  // The pivot panel offers derived fields, such as the year of a date, next to the columns.
  const pivotColumns = useMemo(
    () => withPivotDerivedColumns(columns, getPivotDerivedColumns as (column: GridColDef<R>) => GridColDef<R>[] | undefined),
    [columns, getPivotDerivedColumns],
  );

  const pivot = useMemo<GridPivotResult | null>(() => {
    if (!applied) {
      return null;
    }
    const columnsByField = new Map(columns.map((column) => [column.field, column]));
    const edited = sourceRowsRef.current;
    const sourceRows = edited?.source === rows ? edited.rows : rows;
    const predicate = getFilterPredicate(filterModel, columnsByField, columns, { ignoreDiacritics });
    return computePivot({
      rows: predicate ? sourceRows.filter(predicate) : sourceRows,
      columns: new Map(pivotColumns.map((column) => [column.field, column])),
      model,
      functions,
      totalLabel,
      pivotingColDef: pivotingColDef as Parameters<typeof computePivot>[0]['pivotingColDef'],
    });
  }, [applied, rows, columns, pivotColumns, filterModel, model, functions, totalLabel, pivotingColDef, ignoreDiacritics]);

  const pivoting: GridPivoting<R> | undefined = available
    ? {
        enabled,
        applied,
        model,
        setEnabled,
        setModel,
        sourceColumns: columns,
        pivotColumns,
        totals: pivot?.totals ?? null,
        rowLabelColumn: (pivot?.rowLabelColumn as GridColDef<R> | undefined) ?? null,
        sourceRowsRef,
      }
    : undefined;

  const pivotProps = pivot
    ? ({
        ...PIVOT_ROW_PROP_OVERRIDES,
        rows: pivot.rows,
        columns: pivot.columns,
        getRowId: getPivotRowId,
        treeData: true,
        getTreeDataPath: getPivotRowPath,
        aggregationModel: pivot.aggregationModel,
        columnGroupingModel: pivot.columnGroupingModel,
        groupingColDef: {
          ...(pivot.rowHeaderName ? { headerName: pivot.rowHeaderName } : {}),
          ...(typeof props.groupingColDef === 'function' ? props.groupingColDef({ groupingField: null, fields: [] }) : props.groupingColDef),
        },
        // The source rows were filtered above, and the filter fields do not exist on the generated rows.
        filterMode: 'server',
      } as unknown as Partial<DataGridProps<R>>)
    : undefined;

  return <DataGridBase<R> {...props} filterModel={filterModel} onFilterModelChange={setFilterModel} {...pivotProps} pivoting={pivoting} />;
}

/** Name under `theme.components` whose `defaultProps` apply to every grid, as in MUI X. */
export const GRID_THEME_COMPONENT_NAME = 'MuiDataGrid';

/**
 * Props from `theme.components.MuiDataGrid.defaultProps` under the grid's own. `localeText` and `slotProps` merge key by key,
 * so a locale set in the theme keeps working when a grid overrides one text.
 */
function useGridThemeProps<R extends GridValidRowModel>(props: DataGridProps<R>): DataGridProps<R> {
  const theme = useTheme();
  const defaults = (theme.components as Record<string, { defaultProps?: Partial<DataGridProps<R>> } | undefined> | undefined)?.[
    GRID_THEME_COMPONENT_NAME
  ]?.defaultProps;
  return useMemo(() => {
    if (!defaults) {
      return props;
    }
    const merged = { ...defaults, ...props } as DataGridProps<R>;
    if (defaults.localeText || props.localeText) {
      merged.localeText = { ...defaults.localeText, ...props.localeText };
    }
    if (defaults.slotProps || props.slotProps) {
      merged.slotProps = { ...defaults.slotProps, ...props.slotProps };
    }
    return merged;
  }, [defaults, props]);
}

export function DataGrid<R extends GridValidRowModel = GridValidRowModel>(inProps: DataGridProps<R>) {
  const props = useGridThemeProps(inProps);
  return props.dataSource ? <DataSourceGrid<R> {...props} dataSource={props.dataSource} /> : <PivotingGrid<R> {...props} />;
}
