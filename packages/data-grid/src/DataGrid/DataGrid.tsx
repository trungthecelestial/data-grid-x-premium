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
import { alpha, darken, lighten, type Theme } from '@mui/material/styles';
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
  GridCellSelectionModel,
  GridColDef,
  GridColumnsPanelSlotProps,
  GridCsvExportOptions,
  GridEditStopReason,
  GridExcelExportOptions,
  GridEventMap,
  GridEventName,
  GridFilterModel,
  GridFilterPanelSlotProps,
  GridPivotModel,
  GridPivotPanelSlotProps,
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
  GridToolbarProps,
  GridValidRowModel,
} from './DataGrid.types';
import {
  formatAggregate,
  getAggregationLabel,
  getAvailableAggregationFunctions,
  GRID_AGGREGATION_FUNCTIONS,
} from './features/aggregation';
import { computePivot, EMPTY_PIVOT_MODEL, isPivotModelEmpty, PIVOT_ROW_ID, PIVOT_ROW_PATH, type GridPivotResult } from './features/pivot';
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
import { buildXlsx, XLSX_MIME_TYPE } from './features/xlsx';
import { countActiveFilters, getColumnFilterOperators, getFilterPredicate, getInitialFilterValue, isFilterable } from './features/filtering';
import { applySortClick, DEFAULT_SORTING_ORDER } from './features/sorting';
import { collectRows, type GridTreeNode } from './features/tree';
import { useElementSize } from './hooks/useElementSize';
import { useGridRows } from './hooks/useGridRows';
import { useGridDataSource, type GridServerRows } from './hooks/useGridDataSource';
import { useGridState } from './hooks/useGridState';
import { useMeasuredRowHeights } from './hooks/useMeasuredRowHeights';
import { getOffsets, getVirtualRange } from './hooks/virtualization';
import { DEFAULT_LOCALE_TEXT } from './localeText';

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
const SPECIAL_FIELDS = new Set([REORDER_FIELD, CHECKBOX_FIELD, DETAIL_FIELD, TREE_GROUP_FIELD, ROW_GROUP_FIELD]);

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
    '--DnaDataGrid-border': lighten(alpha(lightDivider, 1), 0.88),
    ...theme.applyStyles('dark', { '--DnaDataGrid-border': darken(alpha(darkDivider, 1), 0.68) }),
  };
};

const defaultGetRowId =(row: GridValidRowModel): GridRowId => row.id;

const ellipsisSx = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;
const wrappingTextSx = { whiteSpace: 'normal', overflowWrap: 'anywhere' } as const;

const JUSTIFY = { left: 'flex-start', center: 'center', right: 'flex-end' } as const;

const menuButtonShownSx = { width: 24, p: 0.25, opacity: 1, mx: 0.25 } as const;

type Entry<R extends GridValidRowModel> =
  | { kind: 'row'; node: GridTreeNode<R> }
  | { kind: 'detail'; node: GridTreeNode<R>; height: number };

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
  totals: Record<string, unknown> | null;
  rowLabelColumn: GridColDef<R> | null;
  /** Receives the rows with runtime edits applied, so pivoting starts from what the user sees. */
  sourceRowsRef: MutableRefObject<{ source: readonly R[]; rows: readonly R[] } | null>;
}

type DataGridBaseProps<R extends GridValidRowModel> = DataGridProps<R> & { onRefetchRequest?: () => void; pivoting?: GridPivoting<R>; serverRows?: GridServerRows<R> };

function DataGridBase<R extends GridValidRowModel = GridValidRowModel>(props: DataGridBaseProps<R>) {
  const {
    rows,
    columns: userColumns,
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
  } = props;

  const localeText = useMemo(() => ({ ...DEFAULT_LOCALE_TEXT, ...props.localeText }), [props.localeText]);

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
  const [columnMenu, setColumnMenu] = useState<{ field: string; anchor: HTMLElement } | null>(null);
  const [menuPanel, setMenuPanel] = useState<{ kind: 'filter' | 'columns' | 'pivot'; anchor: HTMLElement } | null>(null);

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
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const committingRef = useRef(false);
  const shouldFocusRef = useRef(false);
  const lastSelectedRef = useRef<GridRowId | null>(null);
  const dragFieldRef = useRef<string | null>(null);
  const dragRowRef = useRef<GridRowId | null>(null);
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

  const mergedRows = useMemo(() => {
    let result: readonly R[] = rows;
    if (rowUpdates.source === rows) {
      const { map, added, deleted } = rowUpdates;
      if (map.size > 0 || added.length > 0 || deleted.size > 0) {
        const all = added.length > 0 ? [...rows, ...added] : rows;
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
  }, [rows, rowUpdates, rowOrder, getRowId]);

  const isPivoted = pivoting?.applied ?? false;
  const serverAggregated = Boolean(serverRows?.getAggregatedValue);
  if (pivoting && !isPivoted) {
    pivoting.sourceRowsRef.current = { source: rows, rows: mergedRows };
  }

  const rowsById = useMemo(() => new Map(mergedRows.map((row) => [getRowId(row), row])), [mergedRows, getRowId]);

  const canReorder =
    rowReordering &&
    sortModel.length === 0 &&
    countActiveFilters(filterModel) === 0 &&
    !treeData &&
    rowGroupingModel.length === 0 &&
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

  const { pageNodes, roots, rootCount, page, filteredRows, nodeAggregates, footerAggregates, isExpanded, isGroup } = useGridRows(
    {
      rows: mergedRows,
      getRowId,
      columnsByField: userColumnMap,
      quickFilterColumns: visibleUserColumns,
      sortModel,
      filterModel,
      sortingMode,
      filterMode,
      treeData,
      getTreeDataPath,
      rowGroupingModel,
      expansion,
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
        renderCell: ({ id }) => (
          <IconButton
            size="small"
            tabIndex={-1}
            disabled={!canReorder}
            draggable={canReorder}
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
              if (event.altKey && step !== 0 && canReorder) {
                event.preventDefault();
                event.stopPropagation();
                pendingFocusRowRef.current = id;
                moveRow(id, mergedRows.findIndex((row) => getRowId(row) === id) + step);
              }
            }}
            sx={{ cursor: canReorder ? 'grab' : 'default', '&:active': { cursor: 'grabbing' } }}
          >
            <DragIndicatorIcon fontSize="small" />
          </IconButton>
        ),
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
              <KeyboardArrowRightIcon fontSize="small" />
            )}
          </IconButton>
        ),
      });
    }

    if (isGroup) {
      const byRowGrouping = rowGroupingModel.length > 0 && (!treeData || Boolean(serverRows?.groupsByColumns));
      result.push({
        field: byRowGrouping ? ROW_GROUP_FIELD : TREE_GROUP_FIELD,
        headerName: byRowGrouping ? localeText.rowGroupingHeader : localeText.treeDataGroupHeader,
        width: 220,
        sortable: false,
        filterable: false,
        hideable: false,
        disableReorder: true,
        ...groupingColDef,
        renderCell: ({ id }) => {
          const node = nodeById.get(id);
          if (!node) {
            return null;
          }
          const expandable = node.children.length > 0 || needsChildren(node);
          const serverGroup = node.row && serverRows?.isGroupRow(node.row);
          const label = serverGroup
            ? `${node.label} (${getChildrenCount?.(node.row as R) ?? 0})`
            : byRowGrouping
              ? node.groupField
                ? `${node.label} (${node.rowCount})`
                : ''
              : node.label;
          return (
            <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, pl: `${node.depth * 20}px` }}>
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
                    <KeyboardArrowRightIcon fontSize="small" />
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
        },
      });
    }

    return result;
  }, [
    rowReordering,
    canReorder,
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
  ]);

  const { columns, leftCount, rightStart } = useMemo(() => {
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
  }, [specialColumns, visibleUserColumns, pinned, headerFilters, disableColumnFilter]);

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
    return node ? rowHeightFor(node) : undefined;
  };

  const entries = useMemo(() => {
    const result: Entry<R>[] = [];
    for (const node of pageNodes) {
      result.push({ kind: 'row', node });
      if (node.row && getDetailPanelContent && detailIds.includes(node.id)) {
        const params = { id: node.id, row: node.row };
        result.push({ kind: 'detail', node, height: getDetailPanelHeight?.(params) ?? DEFAULT_DETAIL_HEIGHT });
      }
    }
    return result;
  }, [pageNodes, getDetailPanelContent, getDetailPanelHeight, detailIds]);

  const offsets = useMemo(
    () => getOffsets(entries.map((entry) => (entry.kind === 'detail' ? entry.height : rowHeightFor(entry.node)))),
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

  const apiObjectRef = useRef<GridApi | null>(null);

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
      return buildXlsx(exportedRows, exportedColumns, {
        sheetName: merged.sheetName,
        includeHeaders: merged.includeHeaders,
        columnWidths: Object.fromEntries(columns.map((column, index) => [column.field, widths[index] ?? 0])),
      });
    },
    [excelOptions, resolveExport, columns, widths],
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
      !SPECIAL_FIELDS.has(column.field) &&
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
      setRowUpdates((previous) => {
        const base = previous.source === rows ? previous : { source: rows, map: EMPTY_MAP, added: EMPTY_ARRAY, deleted: EMPTY_SET };
        const map = new Map(base.map);
        map.set(edit.id, result);
        return { ...base, map };
      });
      finish();
    } catch (error) {
      onProcessRowUpdateError?.(error);
    } finally {
      committingRef.current = false;
    }
  }, [rowsById, userColumnMap, processRowUpdate, onProcessRowUpdateError, rows, emit]);

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

  const autosizeColumns = (options?: GridAutosizeOptions) => {
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
        if (column && !SPECIAL_FIELDS.has(column.field)) {
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
    const grid = parseClipboardText(text);
    if (grid.length === 0) {
      return;
    }
    const dataColumns = columns.filter((column) => !SPECIAL_FIELDS.has(column.field));
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
    if (results.size > 0) {
      setRowUpdates((previous) => {
        const base: RowUpdates<R> =
          previous.source === rows ? previous : { source: rows, map: EMPTY_MAP, added: EMPTY_ARRAY, deleted: EMPTY_SET };
        const map = new Map(base.map);
        for (const [id, row] of results) {
          map.set(id, row);
        }
        return { ...base, map };
      });
    }
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
      const known = new Map<GridRowId, R>([...rows, ...added].map((row) => [getRowId(row), row]));
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

  const api: GridApi = {
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
        scroller.scrollLeft = widths.slice(0, colIndex).reduce((total, width) => total + width, 0);
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

  const handleSort = (column: GridColDef<R>, event: MouseEvent) => {
    if (disableColumnSorting || column.sortable === false || SPECIAL_FIELDS.has(column.field) || column.type === 'actions') {
      return;
    }
    setSortModel(applySortClick(sortModel, column.field, column.sortingOrder ?? sortingOrder, event.shiftKey && !disableMultipleColumnsSorting));
  };

  const isSortable = (column: GridColDef<R>) =>
    !disableColumnSorting && column.sortable !== false && !SPECIAL_FIELDS.has(column.field) && column.type !== 'actions';

  const hasColumnMenu = (column: GridColDef<R>) =>
    !disableColumnMenu && !column.disableColumnMenu && (!SPECIAL_FIELDS.has(column.field) || column.field === ROW_GROUP_FIELD);

  // The panels open under the header cell, not under the menu button.
  const headerCellOf = (anchor: HTMLElement) => anchor.closest<HTMLElement>('[role="columnheader"]') ?? anchor;

  const openFilterFor = (column: GridColDef<R>, anchor: HTMLElement) => {
    if (!filterModel.items.some((item) => item.field === column.field)) {
      const operator = getColumnFilterOperators(column)[0];
      setFilterModel({
        ...filterModel,
        items: [
          ...filterModel.items,
          { id: `filter-${Date.now()}`, field: column.field, operator: operator?.value ?? 'contains', value: getInitialFilterValue(operator) },
        ],
      });
    }
    setMenuPanel({ kind: 'filter', anchor: headerCellOf(anchor) });
  };

  const ColumnMenu: ComponentType<ComponentProps<typeof GridColumnMenu<any>>> = slots?.columnMenu ?? GridColumnMenu;

  const renderColumnMenu = () => {
    if (columnMenu?.field === ROW_GROUP_FIELD) {
      const groupColumn = columns.find((candidate) => candidate.field === ROW_GROUP_FIELD);
      return groupColumn ? (
        <ColumnMenu
          {...slotProps?.columnMenu}
          column={groupColumn}
          anchorEl={columnMenu.anchor}
          onClose={() => setColumnMenu(null)}
          localeText={localeText}
          groupedColumns={rowGroupingModel.flatMap((field) => userColumnMap.get(field) ?? [])}
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
    const minWidth = column.minWidth ?? 50;
    const maxWidth = column.maxWidth ?? Infinity;
    const onMove = (moveEvent: globalThis.PointerEvent) => {
      const width = Math.min(maxWidth, Math.max(minWidth, startWidth + moveEvent.clientX - startX));
      setWidthOverrides((previous) => ({ ...previous, [column.field]: width }));
    };
    const onUp = (upEvent: globalThis.PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const width = Math.min(maxWidth, Math.max(minWidth, startWidth + upEvent.clientX - startX));
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
    setScrollLeft(element.scrollLeft);
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

  const handleKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.getAttribute('role') === 'combobox') {
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

    if (entry?.node.row && column && !SPECIAL_FIELDS.has(column.field)) {
      emit('cellKeyDown', getCellParams(entry.node.id, entry.node.row, column), event);
    }

    const arrowStep: Record<string, [number, number]> = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1] };
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
        focusCell(row - 1, col);
        break;
      case 'ArrowRight':
        focusCell(row, col + 1);
        break;
      case 'ArrowLeft':
        focusCell(row, col - 1);
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
            { delimiter: '\t', includeHeaders: false, raw: ignoreValueFormatterDuringExport },
          );
        } else if (selection.length > 0) {
          text = buildCsv(
            filteredRows.filter((row) => selectedSet.has(getRowId(row))),
            exportColumns,
            { delimiter: '\t', includeHeaders: false, raw: ignoreValueFormatterDuringExport },
          );
        } else if (entry?.node.row && column && !SPECIAL_FIELDS.has(column.field)) {
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
        scroller.scrollLeft = before(col) - before(leftCount);
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
      if (SPECIAL_FIELDS.has(column.field) || column.type === 'actions') {
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
      left: pin === 'left' ? leftOffsets[index] : undefined,
      right: pin === 'right' ? rightOffsets[index] : undefined,
      zIndex: pin ? (header ? 4 : 2) : undefined,
      bgcolor: pin ? 'background.paper' : undefined,
      borderRight: (header ? showColumnVerticalBorder : showCellVerticalBorder) ? '1px solid var(--DnaDataGrid-border)' : undefined,
      ...ellipsisSx,
    } as const;
  };

  const renderValue = (column: GridColDef<R>, node: GridTreeNode<R>, row: R, wrapText: boolean): ReactNode => {
    const id = node.id;
    if (node.placeholder) {
      return SPECIAL_FIELDS.has(column.field) ? null : <Skeleton variant="text" sx={{ width: '80%' }} />;
    }
    if (node.row && serverRows?.isGroupRow(node.row) && !SPECIAL_FIELDS.has(column.field)) {
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
    if (SPECIAL_FIELDS.has(column.field) && column.renderCell) {
      return column.renderCell({ id, field: column.field, value: undefined, formattedValue: '', row, colDef: column });
    }
    const aggregates = nodeAggregates.get(id);
    const aggregateFn = aggregationModel[column.field];
    if (!node.row && aggregates && aggregateFn && column.field in aggregates) {
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
        if (skippedColumns.has(index) || column.colSpan === undefined || SPECIAL_FIELDS.has(column.field)) {
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
        className={node.row && getRowClassName ? getRowClassName({ id: node.id, row: node.row, indexRelativeToCurrentPage: rowIndex ?? -1 }) : undefined}
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
          node.row
            ? (event) => {
                const dragged = dragRowRef.current;
                if (dragged === null || dragged === node.id) {
                  return;
                }
                event.preventDefault();
                const bounds = event.currentTarget.getBoundingClientRect();
                const ids = mergedRows.map(getRowId);
                // Dropping on the lower half of a row moves the dragged row below it, unless that would not move it at all.
                const after = event.clientY > bounds.top + bounds.height / 2 && ids.indexOf(dragged) < ids.indexOf(node.id);
                setDropTarget((previous) => (previous?.id === node.id && previous.after === after ? previous : { id: node.id, after }));
              }
            : undefined
        }
        onDrop={
          node.row
            ? (event) => {
                event.preventDefault();
                const dragged = dragRowRef.current;
                dragRowRef.current = null;
                setDropTarget(null);
                if (dragged !== null && dragged !== node.id) {
                  moveRow(dragged, mergedRows.findIndex((row) => getRowId(row) === node.id));
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
          const selectable = cellSelectionEnabled && rowIndex !== null && !SPECIAL_FIELDS.has(column.field) && !editingCell;
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
              className={
                node.row && !SPECIAL_FIELDS.has(column.field)
                  ? [
                      typeof column.cellClassName === 'function'
                        ? column.cellClassName(getCellParams(node.id, row, column))
                        : column.cellClassName,
                      getCellClassName?.(getCellParams(node.id, row, column)),
                    ]
                      .filter(Boolean)
                      .join(' ') || undefined
                  : undefined
              }
              aria-selected={cellSelectionEnabled && !SPECIAL_FIELDS.has(column.field) ? selectedCell : undefined}
              onMouseDown={selectable ? (event) => handleCellMouseDown(event, node.id, rowIndex, index, column.field) : undefined}
              onMouseEnter={selectable ? () => extendCellDrag(rowIndex, index) : undefined}
              tabIndex={rowIndex !== null && focused && !editingCell ? 0 : -1}
              onClick={(event) => {
                if (rowIndex !== null) {
                  setFocusPosition({ row: rowIndex, col: index });
                }
                if (node.row && !SPECIAL_FIELDS.has(column.field)) {
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
                  borderBottom: '1px solid var(--DnaDataGrid-border)',
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

  const renderHeaderCell = (column: GridColDef<R>, index: number) => {
    const sortItem = sortModel.find((item) => item.field === column.field);
    const sortIndex = sortModel.findIndex((item) => item.field === column.field);
    const sortable = isSortable(column);
    const menuOpen = columnMenu?.field === column.field;
    const resizable = !disableColumnResize && column.resizable !== false && !SPECIAL_FIELDS.has(column.field);
    const reorderable =
      !disableColumnReorder && !column.disableReorder && index >= leftCount && index < rightStart && !SPECIAL_FIELDS.has(column.field);
    const direction: GridSortDirection = sortItem?.sort;
    const content = column.renderHeader ? column.renderHeader({ colDef: column }) : (column.headerName ?? column.field);
    const headerAlign = column.headerAlign ?? getDefaultAlign(column);
    const aggregateFn = aggregationModel[column.field];

    return (
      <TableCell
        key={column.field}
        role="columnheader"
        aria-colindex={index + 1}
        aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : undefined}
        className={column.headerClassName}
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
          flexDirection: headerAlign === 'right' ? 'row-reverse' : 'row',
          justifyContent: 'space-between',
          // The menu button takes no room until it shows, so it does not squeeze the header text.
          '&:hover .DnaDataGrid-menuButton, &:focus-within .DnaDataGrid-menuButton': menuButtonShownSx,
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, alignItems: JUSTIFY[headerAlign] }}>
          {sortable ? (
            <TableSortLabel
              active={Boolean(direction)}
              direction={direction === 'desc' ? 'desc' : 'asc'}
              hideSortIcon={column.hideSortIcons}
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
            <Box component="span" sx={{ ...ellipsisSx, maxWidth: '100%' }}>
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
            className="DnaDataGrid-menuButton"
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
              right: 0,
              bottom: 0,
              width: 10,
              cursor: 'col-resize',
              touchAction: 'none',
              '&::after': {
                content: '""',
                position: 'absolute',
                top: '50%',
                right: 4,
                width: 2,
                height: 24,
                transform: 'translateY(-50%)',
                bgcolor: 'var(--DnaDataGrid-border)',
              },
            }}
          />
        )}
      </TableCell>
    );
  };

  const renderHeaderFilterCell = (column: GridColDef<R>, index: number) => {
    const item = filterModel.items.find((candidate) => candidate.field === column.field);
    const filterable = !disableColumnFilter && isFilterable(column) && !SPECIAL_FIELDS.has(column.field);
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
                      : [...filterModel.items, next],
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
  const headerRowCount = groupHeaderRows.length + 1 + (headerFilters ? 1 : 0);
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
  };
  const Toolbar: ComponentType<GridToolbarProps<any>> = slots?.toolbar ?? GridToolbar;
  const FilterPanel: ComponentType<GridFilterPanelSlotProps<any>> = slots?.filterPanel ?? GridFilterPanel;
  const ColumnsPanel: ComponentType<GridColumnsPanelSlotProps<any>> = slots?.columnsPanel ?? GridColumnsPanel;
  const PivotPanel: ComponentType<GridPivotPanelSlotProps<any>> = slots?.pivotPanel ?? GridPivotPanel;
  const NoRowsOverlay = slots?.noRowsOverlay;
  const LoadingOverlay = slots?.loadingOverlay;
  const FooterSlot = slots?.footer;
  const PaginationSlot = slots?.pagination;
  const showFooter = !hideFooter;
  const footerRowCount = paginationMode === 'server' ? (rowCount ?? totalRowCount) : totalRowCount;
  const bottomRows = pinnedRows?.bottom ?? EMPTY_ARRAY;
  const topRows = pinnedRows?.top ?? EMPTY_ARRAY;
  const footerValues = isPivoted ? (pivoting?.totals ?? null) : serverAggregated ? (serverRows?.footerAggregates ?? null) : footerAggregates;
  const hasFooterAggregates = footerValues !== null && Object.keys(footerValues).length > 0;

  return (
    <Paper
      variant="outlined"
      sx={[
        (theme) => getBorderVariables(theme),
        { display: 'flex', flexDirection: 'column', position: 'relative', p: 2, pb: showFooter ? 0 : 2, borderRadius: '8px', '&&': { borderColor: 'var(--DnaDataGrid-border)' } },
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
        {menuPanel?.kind === 'pivot' && pivoting && (
          <PivotPanel
            columns={pivoting.sourceColumns}
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
            '& .MuiTableRow-root': { width: totalWidth, borderBottomColor: 'var(--DnaDataGrid-border)' },
            '& .MuiTableHead-root .MuiTableCell-root': { fontWeight: 600 },
            '& .MuiTableCell-root': { paddingBlock: 0, paddingInline: '10px', boxSizing: 'border-box' },
          }}
        >
          <TableHead sx={{ position: 'sticky', top: 0, zIndex: 3, bgcolor: 'background.paper' }}>
            {groupHeaderRows.map((cells, level) => (
              <TableRow key={`group-${level}`} sx={{ height: props.columnGroupHeaderHeight ?? headerHeight }}>
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
              <TableRow aria-rowindex={headerRowCount} sx={{ height: headerHeight }}>
                {renderColumns(renderHeaderFilterCell)}
              </TableRow>
            )}
          </TableHead>

          {topRows.length > 0 && (
            <TableBody sx={{ position: 'sticky', top: headerHeight * headerRowCount, zIndex: 2, bgcolor: 'background.paper' }}>
              {topRows.map((row, index) => renderRow(getPinnedRowNode(row), null, headerRowCount + index + 1))}
            </TableBody>
          )}

          <TableBody>
            {range.offsetTop > 0 && <TableRow aria-hidden role="presentation" sx={{ ...spacerSx, height: range.offsetTop }} />}
            {visibleEntries.map((entry, offset) => {
              const entryIndex = range.start + offset;
              if (entry.kind === 'detail') {
                const panelWidth = Math.min(totalWidth, containerWidth || totalWidth);
                return (
                  <TableRow key={`${entry.node.id}-detail`} role="row" sx={{ height: entry.height, width: totalWidth }}>
                    <TableCell
                      role="gridcell"
                      sx={{ position: 'sticky', left: 0, width: panelWidth, height: '100%', overflow: 'auto', display: 'block', py: 0 }}
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
                  sx={{ position: 'sticky', left: 0, width: containerWidth || '100%', minHeight: rowHeight * 2, justifyContent: 'center', color: 'text.secondary' }}
                >
                  {NoRowsOverlay ? <NoRowsOverlay localeText={localeText} {...slotProps?.noRowsOverlay} /> : localeText.noRowsLabel}
                </TableCell>
              </TableRow>
            )}
          </TableBody>

          {(bottomRows.length > 0 || hasFooterAggregates) && (
            <TableFooter sx={{ position: 'sticky', bottom: 0, zIndex: 3, bgcolor: 'background.paper' }}>
              {bottomRows.map((row, index) => renderRow(getPinnedRowNode(row), null, headerRowCount + topRows.length + totalRowCount + index + 1))}
              {hasFooterAggregates && footerValues && (
                <TableRow role="row" sx={{ height: rowHeight, width: totalWidth }}>
                  {renderColumns((column, index) => {
                    const fn = aggregationModel[column.field];
                    return (
                      <TableCell key={column.field} role="gridcell" sx={{ ...cellSx(index, false), fontWeight: 500, color: 'primary.main' }}>
                        {fn && column.field in footerValues ? formatAggregate(fn, footerValues[column.field], column, aggregationFunctions[fn]) : null}
                      </TableCell>
                    );
                  })}
                </TableRow>
              )}
            </TableFooter>
          )}
        </Table>
      </TableContainer>
      {showFooter && FooterSlot && (
        <FooterSlot selectedRowCount={selection.length} rowCount={footerRowCount} localeText={localeText} {...slotProps?.footer} />
      )}
      {showFooter && !FooterSlot && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: 1, borderColor: 'var(--DnaDataGrid-border)' }}>
          <Box sx={{ pl: 2, color: 'text.secondary' }}>
            {!hideFooterSelectedRowCount && selection.length > 0 && (checkboxSelection || rowSelection) ? localeText.footerRowsSelected(selection.length) : null}
          </Box>
          {pagination && !hideFooterPagination && PaginationSlot && (
            <PaginationSlot
              count={footerRowCount}
              page={paginationMode === 'server' ? paginationModel.page : page}
              pageSize={paginationModel.pageSize}
              pageSizeOptions={pageSizeOptions}
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
              rowsPerPageOptions={[...pageSizeOptions]}
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
  );
}

/** Loads `rows` and `rowCount` from the data source whenever what they depend on changes. */
function DataSourceGrid<R extends GridValidRowModel>(props: DataGridProps<R> & { dataSource: GridDataSource<R> }) {
  const { pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS } = props;
  const serverProps = useGridDataSource(props, { page: 0, pageSize: pageSizeValue(pageSizeOptions[0] ?? 10) });
  return <DataGridBase<R> {...props} {...serverProps} />;
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

  const pivot = useMemo<GridPivotResult | null>(() => {
    if (!applied) {
      return null;
    }
    const columnsByField = new Map(columns.map((column) => [column.field, column]));
    const edited = sourceRowsRef.current;
    const sourceRows = edited?.source === rows ? edited.rows : rows;
    const predicate = getFilterPredicate(filterModel, columnsByField, columns);
    return computePivot({
      rows: predicate ? sourceRows.filter(predicate) : sourceRows,
      columns: columnsByField,
      model,
      functions,
      totalLabel,
    });
  }, [applied, rows, columns, filterModel, model, functions, totalLabel]);

  const pivoting: GridPivoting<R> | undefined = available
    ? {
        enabled,
        applied,
        model,
        setEnabled,
        setModel,
        sourceColumns: columns,
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
        groupingColDef: { ...(pivot.rowHeaderName ? { headerName: pivot.rowHeaderName } : {}), ...props.groupingColDef },
        // The source rows were filtered above, and the filter fields do not exist on the generated rows.
        filterMode: 'server',
      } as unknown as Partial<DataGridProps<R>>)
    : undefined;

  return <DataGridBase<R> {...props} filterModel={filterModel} onFilterModelChange={setFilterModel} {...pivotProps} pivoting={pivoting} />;
}

export function DataGrid<R extends GridValidRowModel = GridValidRowModel>(props: DataGridProps<R>) {
  return props.dataSource ? <DataSourceGrid<R> {...props} dataSource={props.dataSource} /> : <PivotingGrid<R> {...props} />;
}
