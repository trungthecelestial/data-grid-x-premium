import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
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
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { GridCellEditor } from './components/GridCellEditor';
import { GridColumnMenu, getAvailableAggregationFunctions } from './components/GridColumnMenu';
import { GridColumnsPanel } from './components/GridColumnsPanel';
import { GridFilterPanel } from './components/GridFilterPanel';
import { GridToolbar } from './components/GridToolbar';
import type {
  DataGridProps,
  GridAggregationModel,
  GridApi,
  GridApiRef,
  GridColDef,
  GridFilterModel,
  GridPaginationModel,
  GridRowId,
  GridSortDirection,
  GridValidRowModel,
} from './DataGrid.types';
import { formatAggregate } from './features/aggregation';
import {
  buildGroupHeaderRows,
  getCellValue,
  getDefaultAlign,
  getFormattedValue,
  moveField,
  reconcileOrder,
  resolveColumnWidths,
} from './features/columns';
import { buildCsv, buildPrintHtml, downloadFile, printHtml } from './features/export';
import { getColumnFilterOperators, getInitialFilterValue, isFilterable } from './features/filtering';
import { applySortClick, DEFAULT_SORTING_ORDER } from './features/sorting';
import type { GridTreeNode } from './features/tree';
import { useElementSize } from './hooks/useElementSize';
import { useGridRows } from './hooks/useGridRows';
import { useGridState } from './hooks/useGridState';
import { getOffsets, getVirtualRange } from './hooks/virtualization';
import { DEFAULT_LOCALE_TEXT } from './localeText';

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
const DEFAULT_HEIGHT = 400;
const DEFAULT_DETAIL_HEIGHT = 200;
const CHECKBOX_FIELD = '__check__';
const DETAIL_FIELD = '__detail_panel_toggle__';
const TREE_GROUP_FIELD = '__tree_data_group__';
const ROW_GROUP_FIELD = '__row_group_by_columns_group__';
const SPECIAL_FIELDS = new Set([CHECKBOX_FIELD, DETAIL_FIELD, TREE_GROUP_FIELD, ROW_GROUP_FIELD]);

const DENSITY_HEIGHTS = {
  compact: { row: 36, header: 40 },
  standard: { row: 52, header: 56 },
  comfortable: { row: 68, header: 64 },
} as const;

const EMPTY_ARRAY: readonly never[] = [];
const EMPTY_STRINGS: readonly string[] = [];
const EMPTY_OBJECT: Readonly<Record<string, never>> = {};
const EMPTY_MAP = new Map<never, never>();
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

const JUSTIFY = { left: 'flex-start', center: 'center', right: 'flex-end' } as const;

const menuButtonShownSx = { width: 24, p: 0.25, opacity: 1, mx: 0.25 } as const;

type Entry<R extends GridValidRowModel> =
  | { kind: 'row'; node: GridTreeNode<R> }
  | { kind: 'detail'; node: GridTreeNode<R>; height: number };

interface EditState {
  id: GridRowId;
  /** Set in cell edit mode. Row edit mode edits every editable cell of the row. */
  field?: string;
  values: Record<string, unknown>;
}

export function useGridApiRef(): GridApiRef {
  return useRef({} as GridApi);
}

export function DataGrid<R extends GridValidRowModel = GridValidRowModel>(props: DataGridProps<R>) {
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
    initialState?.pagination?.paginationModel ?? { page: 0, pageSize: pageSizeOptions[0] ?? 10 },
    props.onPaginationModelChange,
  );
  const [selection, setSelection] = useGridState(
    props.rowSelectionModel,
    initialState?.rowSelection ?? EMPTY_ARRAY,
    props.onRowSelectionModelChange,
  );
  const [visibilityModel, setVisibilityModel] = useGridState(
    props.columnVisibilityModel,
    initialState?.columns?.columnVisibilityModel ?? EMPTY_OBJECT,
    props.onColumnVisibilityModelChange,
  );
  const [density, setDensity] = useGridState(props.density, initialState?.density ?? 'standard', props.onDensityChange);
  const [pinned] = useGridState(props.pinnedColumns, initialState?.pinnedColumns ?? EMPTY_OBJECT, props.onPinnedColumnsChange);
  const [detailIds, setDetailIds] = useGridState<readonly GridRowId[]>(
    props.detailPanelExpandedRowIds,
    EMPTY_ARRAY,
    props.onDetailPanelExpandedRowIdsChange as ((ids: readonly GridRowId[]) => void) | undefined,
  );

  const [aggregationModel, setAggregationModel] = useGridState<GridAggregationModel>(
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
  const [menuPanel, setMenuPanel] = useState<{ kind: 'filter' | 'columns'; anchor: HTMLElement } | null>(null);

  const [columnOrder, setColumnOrder] = useState<string[]>(
    () => initialState?.columns?.orderedFields ?? userColumns.map((column) => column.field),
  );
  const [widthOverrides, setWidthOverrides] = useState<Record<string, number>>(() =>
    Object.fromEntries(Object.entries(initialState?.columns?.dimensions ?? {}).map(([field, { width }]) => [field, width])),
  );
  const [expansion, setExpansion] = useState<ReadonlyMap<GridRowId, boolean>>(EMPTY_MAP);
  const [rowUpdates, setRowUpdates] = useState<{ source: readonly R[]; map: ReadonlyMap<GridRowId, R> }>({
    source: rows,
    map: EMPTY_MAP,
  });
  const [editing, setEditing] = useState<EditState | null>(null);
  const [focusPosition, setFocusPosition] = useState<{ row: number; col: number } | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const committingRef = useRef(false);
  const shouldFocusRef = useRef(false);
  const lastSelectedRef = useRef<GridRowId | null>(null);
  const dragFieldRef = useRef<string | null>(null);

  const { width: containerWidth, height: containerHeight } = useElementSize(scrollerRef);

  const heights = DENSITY_HEIGHTS[density];
  const rowHeight = props.rowHeight ?? heights.row;
  const headerHeight = props.columnHeaderHeight ?? heights.header;

  const mergedRows = useMemo(() => {
    const updates = rowUpdates.source === rows ? rowUpdates.map : EMPTY_MAP;
    return updates.size === 0 ? rows : rows.map((row) => updates.get(getRowId(row)) ?? row);
  }, [rows, rowUpdates, getRowId]);

  const rowsById = useMemo(() => new Map(mergedRows.map((row) => [getRowId(row), row])), [mergedRows, getRowId]);

  const userColumnMap = useMemo(
    () => new Map<string, GridColDef<R>>(userColumns.map((column) => [column.field, column])),
    [userColumns],
  );

  const effectiveVisibility = useMemo(
    () => ({ ...Object.fromEntries(rowGroupingModel.map((field) => [field, false])), ...visibilityModel }),
    [rowGroupingModel, visibilityModel],
  );

  const orderedFields = useMemo(() => reconcileOrder(columnOrder, userColumns), [columnOrder, userColumns]);

  const visibleUserColumns = useMemo(
    () =>
      orderedFields.flatMap((field) => {
        const column = userColumnMap.get(field);
        return column && effectiveVisibility[field] !== false ? [column] : [];
      }),
    [orderedFields, userColumnMap, effectiveVisibility],
  );

  const { pageNodes, rootCount, page, filteredRows, nodeAggregates, footerAggregates, isExpanded, isGroup } = useGridRows(
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
      aggregationModel,
    },
  );

  const nodeById = useMemo(() => new Map(pageNodes.map((node) => [node.id, node])), [pageNodes]);

  const selectedSet = useMemo(() => new Set(selection), [selection]);
  const isSelectable = useCallback(
    (id: GridRowId, row: R | undefined) =>
      rowSelection && row !== undefined && (isRowSelectable ? isRowSelectable({ id, row }) : true),
    [rowSelection, isRowSelectable],
  );
  const selectableIds = useMemo(
    () =>
      rowSelection
        ? filteredRows.flatMap((row) => {
            const id = getRowId(row);
            return isSelectable(id, row) ? [id] : [];
          })
        : [],
    [rowSelection, filteredRows, getRowId, isSelectable],
  );

  const toggleDetail = useCallback(
    (id: GridRowId) => setDetailIds((previous) => (previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id])),
    [setDetailIds],
  );

  const toggleExpansion = useCallback(
    (node: GridTreeNode<R>) => setExpansion((previous) => new Map(previous).set(node.id, !isExpanded(node))),
    [isExpanded],
  );

  const toggleSelection = useCallback(
    (id: GridRowId, selected: boolean) => {
      lastSelectedRef.current = id;
      setSelection((previous) => (selected ? [...previous.filter((item) => item !== id), id] : previous.filter((item) => item !== id)));
    },
    [setSelection],
  );

  const specialColumns = useMemo<GridColDef<R>[]>(() => {
    const result: GridColDef<R>[] = [];

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
        renderHeader: () => (
          <Checkbox
            size="small"
            checked={selectableIds.length > 0 && selectedCount === selectableIds.length}
            indeterminate={selectedCount > 0 && selectedCount < selectableIds.length}
            disabled={selectableIds.length === 0}
            inputProps={{ 'aria-label': localeText.checkboxSelectionHeader }}
            onChange={(event) => setSelection(event.target.checked ? selectableIds : EMPTY_ARRAY)}
          />
        ),
        renderCell: ({ id, row }) => (
          <Checkbox
            size="small"
            checked={selectedSet.has(id)}
            disabled={!isSelectable(id, row)}
            tabIndex={-1}
            inputProps={{ 'aria-label': localeText.checkboxSelectionRow }}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => toggleSelection(id, event.target.checked)}
          />
        ),
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
      const byRowGrouping = rowGroupingModel.length > 0 && !treeData;
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
          const expandable = node.children.length > 0;
          const label = byRowGrouping ? (node.groupField ? `${node.label} (${node.rowCount})` : '') : node.label;
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
                  {isExpanded(node) ? <KeyboardArrowDownIcon fontSize="small" /> : <KeyboardArrowRightIcon fontSize="small" />}
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
    const all = [...specialColumns, ...pinnedLeft, ...middle, ...pinnedRight];
    return { columns: all, leftCount: specialColumns.length + pinnedLeft.length, rightStart: all.length - pinnedRight.length };
  }, [specialColumns, visibleUserColumns, pinned]);

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

  const groupHeaderRows = useMemo(
    () =>
      buildGroupHeaderRows(
        columnGroupingModel,
        columns.map((column) => column.field),
      ),
    [columnGroupingModel, columns],
  );

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
    () => getOffsets(entries.map((entry) => (entry.kind === 'detail' ? entry.height : rowHeight))),
    [entries, rowHeight],
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

  const rowEntryIndexes = useMemo(
    () => entries.flatMap((entry, index) => (entry.kind === 'row' ? [index] : [])),
    [entries],
  );

  const exportColumns = useMemo(() => visibleUserColumns.filter((column) => column.type !== 'actions'), [visibleUserColumns]);

  const getDataAsCsv = useCallback(
    (options?: { delimiter?: string }) => buildCsv(filteredRows, exportColumns, options),
    [filteredRows, exportColumns],
  );
  const exportDataAsCsv = useCallback(
    (options?: { fileName?: string; delimiter?: string }) =>
      downloadFile(`${options?.fileName ?? 'data'}.csv`, getDataAsCsv(options), 'text/csv;charset=utf-8'),
    [getDataAsCsv],
  );
  const print = useCallback(() => printHtml(buildPrintHtml(filteredRows, exportColumns)), [filteredRows, exportColumns]);

  const isEditable = useCallback(
    (column: GridColDef<R>, node: GridTreeNode<R>) =>
      Boolean(column.editable) && Boolean(node.row) && column.type !== 'actions' && !SPECIAL_FIELDS.has(column.field),
    [],
  );

  const startCellEdit = useCallback(
    (id: GridRowId, field: string) => {
      const row = rowsById.get(id);
      const column = userColumnMap.get(field);
      if (row && column?.editable) {
        setEditing({ id, field, values: { [field]: getCellValue(row, column) } });
      }
    },
    [rowsById, userColumnMap],
  );

  const startRowEdit = useCallback(
    (id: GridRowId) => {
      const row = rowsById.get(id);
      if (!row) {
        return;
      }
      const values: Record<string, unknown> = {};
      for (const column of visibleUserColumns) {
        if (column.editable && column.type !== 'actions') {
          values[column.field] = getCellValue(row, column);
        }
      }
      setEditing({ id, values });
    },
    [rowsById, visibleUserColumns],
  );

  const stopEdit = useCallback(async (options?: { ignoreModifications?: boolean }) => {
    const edit = editingRef.current;
    if (!edit || committingRef.current) {
      return;
    }
    if (options?.ignoreModifications) {
      setEditing(null);
      return;
    }
    const oldRow = rowsById.get(edit.id);
    if (!oldRow) {
      setEditing(null);
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
      setEditing(null);
      return;
    }
    committingRef.current = true;
    try {
      const result = processRowUpdate ? await processRowUpdate(newRow, oldRow) : newRow;
      setRowUpdates((previous) => {
        const map = new Map(previous.source === rows ? previous.map : []);
        map.set(edit.id, result);
        return { source: rows, map };
      });
      setEditing(null);
    } catch (error) {
      onProcessRowUpdateError?.(error);
    } finally {
      committingRef.current = false;
    }
  }, [rowsById, userColumnMap, processRowUpdate, onProcessRowUpdateError, rows]);

  const api: GridApi = {
    exportDataAsCsv,
    getDataAsCsv,
    print,
    startCellEditMode: ({ id, field }) => startCellEdit(id, field),
    startRowEditMode: ({ id }) => startRowEdit(id),
    stopEditMode: (options) => void stopEdit(options),
    setRowSelectionModel: setSelection,
    setColumnVisibility: (field, visible) => setVisibilityModel({ ...visibilityModel, [field]: visible }),
    getRowModels: () => rowsById,
  };
  useEffect(() => {
    if (apiRef) {
      apiRef.current = api;
    }
  });

  const handleSort = (column: GridColDef<R>, event: MouseEvent) => {
    if (disableColumnSorting || column.sortable === false || SPECIAL_FIELDS.has(column.field) || column.type === 'actions') {
      return;
    }
    setSortModel(applySortClick(sortModel, column.field, sortingOrder, event.shiftKey && !disableMultipleColumnsSorting));
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

  const renderColumnMenu = () => {
    if (columnMenu?.field === ROW_GROUP_FIELD) {
      const groupColumn = columns.find((candidate) => candidate.field === ROW_GROUP_FIELD);
      return groupColumn ? (
        <GridColumnMenu
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
    const aggregationFunctions = disableAggregation ? [] : getAvailableAggregationFunctions(column);
    return (
      <GridColumnMenu
        column={column}
        anchorEl={anchor}
        onClose={() => setColumnMenu(null)}
        localeText={localeText}
        sortDirection={sortModel.find((item) => item.field === field)?.sort}
        onSort={isSortable(column) ? (direction) => setSortModel(direction ? [{ field, sort: direction }] : sortModel.filter((item) => item.field !== field)) : undefined}
        onFilter={!disableColumnFilter && isFilterable(column) ? () => openFilterFor(column, anchor) : undefined}
        aggregationFunctions={aggregationFunctions}
        aggregation={aggregationModel[field]}
        onAggregationChange={(fn) => {
          const { [field]: _removed, ...rest } = aggregationModel;
          setAggregationModel(fn ? { ...rest, [field]: fn } : rest);
        }}
        grouped={rowGroupingModel.includes(field)}
        onToggleGroup={
          disableRowGrouping || treeData || column.type === 'actions'
            ? undefined
            : () => setRowGroupingModel(rowGroupingModel.includes(field) ? rowGroupingModel.filter((item) => item !== field) : [...rowGroupingModel, field])
        }
        onHide={column.hideable === false ? undefined : () => setVisibilityModel({ ...visibilityModel, [field]: false })}
        onManageColumns={() => setMenuPanel({ kind: 'columns', anchor: headerCellOf(anchor) })}
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

  const handleRowClick = (event: MouseEvent, node: GridTreeNode<R>) => {
    if (!rowSelection || disableRowSelectionOnClick || !isSelectable(node.id, node.row) || editing) {
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

  const focusCell = (row: number, col: number) => {
    shouldFocusRef.current = true;
    setFocusPosition({ row: Math.max(0, Math.min(rowEntryIndexes.length - 1, row)), col: Math.max(0, Math.min(columns.length - 1, col)) });
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
    } else if (scroller && virtualize) {
      const entryIndex = rowEntryIndexes[focusPosition.row];
      if (entryIndex !== undefined) {
        scroller.scrollTop = offsets[entryIndex] ?? 0;
      }
    }
  }, [focusPosition, range.start, range.end, rowEntryIndexes, offsets, virtualize]);

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
      ...ellipsisSx,
    } as const;
  };

  const renderValue = (column: GridColDef<R>, node: GridTreeNode<R>, row: R): ReactNode => {
    const id = node.id;
    if (column.type === 'actions' && column.getActions) {
      return column.getActions({ id, row, field: column.field });
    }
    if (SPECIAL_FIELDS.has(column.field) && column.renderCell) {
      return column.renderCell({ id, field: column.field, value: undefined, formattedValue: '', row, colDef: column });
    }
    const aggregates = nodeAggregates.get(id);
    const aggregateFn = aggregationModel[column.field];
    if (!node.row && aggregates && aggregateFn && column.field in aggregates) {
      return `${formatAggregate(aggregateFn, aggregates[column.field], column)} (${localeText.aggregationFunctions[aggregateFn].toLowerCase()})`;
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
      <Box component="span" sx={ellipsisSx}>
        {formattedValue}
      </Box>
    );
  };

  const renderEditor = (column: GridColDef<R>, node: GridTreeNode<R>, row: R, edit: EditState): ReactNode => {
    const value = edit.values[column.field];
    const onChange = (next: unknown) =>
      setEditing((previous) => (previous ? { ...previous, values: { ...previous.values, [column.field]: next } } : previous));
    const onCommit = () => void stopEdit();
    const onCancel = () => void stopEdit({ ignoreModifications: true });
    if (column.renderEditCell) {
      return column.renderEditCell({ id: node.id, field: column.field, value, row, colDef: column, onChange, onCommit, onCancel });
    }
    return (
      <GridCellEditor
        colDef={column}
        value={value}
        autoFocus={edit.field === column.field || (edit.field === undefined && column.field === Object.keys(edit.values)[0])}
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
    return (
      <TableRow
        key={node.id}
        role="row"
        hover
        selected={selected}
        aria-rowindex={ariaIndex}
        aria-selected={rowSelection ? selected : undefined}
        onClick={(event) => handleRowClick(event, node)}
        onDoubleClick={(event) => {
          const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-field]');
          const field = cell?.dataset.field;
          const column = field ? userColumnMap.get(field) : undefined;
          if (column && isEditable(column, node)) {
            if (editMode === 'row') {
              startRowEdit(node.id);
            } else {
              startCellEdit(node.id, column.field);
            }
          }
        }}
        sx={{ height: rowHeight, width: totalWidth, ...extraSx }}
      >
        {columns.map((column, index) => {
          const editingCell = edit !== null && column.field in edit.values && isEditable(column, node);
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
              tabIndex={rowIndex !== null && focused && !editingCell ? 0 : -1}
              onClick={() => rowIndex !== null && setFocusPosition({ row: rowIndex, col: index })}
              sx={{ ...cellSx(index, false), outlineOffset: -2, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' } }}
            >
              {editingCell && edit ? renderEditor(column, node, row, edit) : renderValue(column, node, row)}
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
        draggable={reorderable}
        onDragStart={reorderable ? () => (dragFieldRef.current = column.field) : undefined}
        onDragOver={reorderable ? (event) => event.preventDefault() : undefined}
        onDrop={reorderable ? (event) => handleDrop(event, column) : undefined}
        onClick={(event) => handleSort(column, event)}
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
              {aggregateFn}
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

  const getPinnedRowNode = (row: R): GridTreeNode<R> => ({ id: getRowId(row), depth: 0, row, label: '', children: [], rowCount: 1 });

  const visibleEntries = entries.slice(range.start, range.end);
  const spacerSx = { display: 'block', width: totalWidth, borderBottom: 0, p: 0 } as const;
  const headerRowCount = groupHeaderRows.length + 1;
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
    print,
  };
  const Toolbar = slots?.toolbar ?? GridToolbar;
  const showFooter = !hideFooter;
  const footerRowCount = paginationMode === 'server' ? (rowCount ?? totalRowCount) : totalRowCount;
  const bottomRows = pinnedRows?.bottom ?? EMPTY_ARRAY;
  const topRows = pinnedRows?.top ?? EMPTY_ARRAY;
  const hasFooterAggregates = footerAggregates !== null && Object.keys(footerAggregates).length > 0;

  return (
    <Paper
      variant="outlined"
      sx={[
        (theme) => getBorderVariables(theme),
        { display: 'flex', flexDirection: 'column', position: 'relative', p: 2, pb: showFooter ? 0 : 2, borderRadius: '8px', '&&': { borderColor: 'var(--DnaDataGrid-border)' } },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {showToolbar && <Toolbar {...toolbarProps} />}
      {renderColumnMenu()}
      <Popover
        open={menuPanel !== null}
        anchorEl={menuPanel?.anchor}
        onClose={() => setMenuPanel(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        {menuPanel?.kind === 'filter' && (
          <GridFilterPanel columns={userColumns} filterModel={filterModel} onFilterModelChange={setFilterModel} localeText={localeText} />
        )}
        {menuPanel?.kind === 'columns' && (
          <GridColumnsPanel
            columns={userColumns}
            columnVisibilityModel={effectiveVisibility}
            onColumnVisibilityModelChange={setVisibilityModel}
            localeText={localeText}
          />
        )}
      </Popover>
      {loading && <LinearProgress aria-label={localeText.loadingLabel} sx={{ position: 'absolute', left: 0, right: 0, top: 0, zIndex: 5 }} />}
      <TableContainer
        ref={scrollerRef}
        onScroll={virtualize ? (event) => setScrollTop(event.currentTarget.scrollTop) : undefined}
        onKeyDown={handleKeyDown}
        sx={{ height: autoHeight ? 'auto' : height, position: 'relative', overflow: 'auto' }}
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
              <TableRow key={`group-${level}`} sx={{ height: headerHeight }}>
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
            <TableRow aria-rowindex={headerRowCount} sx={{ height: headerHeight }}>
              {columns.map(renderHeaderCell)}
            </TableRow>
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
                  {localeText.noRowsLabel}
                </TableCell>
              </TableRow>
            )}
          </TableBody>

          {(bottomRows.length > 0 || hasFooterAggregates) && (
            <TableFooter sx={{ position: 'sticky', bottom: 0, zIndex: 3, bgcolor: 'background.paper' }}>
              {bottomRows.map((row, index) => renderRow(getPinnedRowNode(row), null, headerRowCount + topRows.length + totalRowCount + index + 1))}
              {hasFooterAggregates && footerAggregates && (
                <TableRow role="row" sx={{ height: rowHeight, width: totalWidth }}>
                  {columns.map((column, index) => {
                    const fn = aggregationModel[column.field];
                    return (
                      <TableCell key={column.field} role="gridcell" sx={{ ...cellSx(index, false), fontWeight: 500, color: 'primary.main' }}>
                        {fn && column.field in footerAggregates ? formatAggregate(fn, footerAggregates[column.field], column) : null}
                      </TableCell>
                    );
                  })}
                </TableRow>
              )}
            </TableFooter>
          )}
        </Table>
      </TableContainer>
      {showFooter && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: 1, borderColor: 'var(--DnaDataGrid-border)' }}>
          <Box sx={{ pl: 2, color: 'text.secondary' }}>
            {selection.length > 0 && (checkboxSelection || rowSelection) ? localeText.footerRowsSelected(selection.length) : null}
          </Box>
          {pagination && (
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
