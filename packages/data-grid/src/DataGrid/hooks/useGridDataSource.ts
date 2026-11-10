import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  DataGridProps,
  GridAggregationModel,
  GridColDef,
  GridDataSource,
  GridDataSourceGetRowsParams,
  GridDataSourceGetRowsResult,
  GridFilterModel,
  GridPaginationModel,
  GridPivotColumnNode,
  GridPivotModel,
  GridRowId,
  GridValidRowModel,
} from '../DataGrid.types';
import { GRID_AGGREGATION_FUNCTIONS } from '../features/aggregation';
import { GridDataSourceCacheDefault } from '../features/dataSourceCache';
import { buildServerPivotLayout, EMPTY_PIVOT_MODEL, isPivotModelEmpty, type GridServerPivotLayout } from '../features/pivot';
import { useGridState } from './useGridState';

const PLACEHOLDER_INDEX = '__lazyPlaceholderIndex';
const DEFAULT_FILTER_MODEL: GridFilterModel = { items: [] };
const NO_GROUP_KEYS: string[] = [];
const NO_FIELDS: readonly string[] = [];
const NO_MODEL: GridAggregationModel = {};
const NO_CHILDREN = new Map<GridRowId, never[]>();
/** Rows requested at a time when lazy loading runs on the "All" page size. */
const FALLBACK_CHUNK_SIZE = 100;

/** Pivoting done by the server, as the grid above the hook needs it. */
export interface GridServerPivot {
  /** The data source pivots and pivoting is not turned off. */
  available: boolean;
  enabled: boolean;
  /** A pivot table shows. */
  applied: boolean;
  model: GridPivotModel;
  setEnabled: (enabled: boolean) => void;
  setModel: (model: GridPivotModel) => void;
  layout: GridServerPivotLayout | null;
}

/** What a server-backed grid needs beyond regular props. */
export interface GridServerRows<R extends GridValidRowModel> {
  /** True when rows nest by the grouped columns, as opposed to tree data. */
  groupsByColumns: boolean;
  isGroupRow: (row: R) => boolean;
  isPlaceholderRow: (row: R) => boolean;
  /** Set when the server calculates aggregates. */
  getAggregatedValue?: (row: R, field: string) => unknown;
  footerAggregates: Record<string, unknown> | null;
  /** Changes when loaded children no longer apply, so expanded rows load theirs again. */
  childrenKey: string;
  onRenderedRangeChange?: (start: number, end: number) => void;
}

interface LazyState<R> {
  chunks: ReadonlyMap<number, readonly R[]>;
  rowCount: number | null;
  /** End of the furthest loaded chunk, which sizes the list while the total is unknown. */
  loadedEnd: number;
}

const defaultGetRowId = (row: GridValidRowModel): GridRowId => row.id;

const hasNextPage = (response: GridDataSourceGetRowsResult<any>, pageSize: number) => response.pageInfo?.hasNextPage ?? response.rows.length === pageSize;

/** The row count of a response. `-1` means more rows exist but the total is unknown. */
function getRowCount(response: GridDataSourceGetRowsResult<any>, start: number, pageSize: number) {
  return response.rowCount ?? (hasNextPage(response, pageSize) ? -1 : start + response.rows.length);
}

/** Loads rows from `dataSource` and returns the props that show them in the grid. */
export function useGridDataSource<R extends GridValidRowModel>(
  props: DataGridProps<R> & { dataSource: GridDataSource<R> },
  defaultPaginationModel: GridPaginationModel,
) {
  const { dataSource, initialState, treeData = false, lazyLoading = false, lazyLoadingRequestThrottleMs = 300, dataSourceCache } = props;
  const userGetRowId = (props.getRowId ?? defaultGetRowId) as (row: R) => GridRowId;
  const functions = props.aggregationFunctions ?? GRID_AGGREGATION_FUNCTIONS;

  const [sortModel, setSortModel] = useGridState(props.sortModel, initialState?.sorting?.sortModel ?? [], props.onSortModelChange);
  const [filterModel, setFilterModel] = useGridState(props.filterModel, initialState?.filter?.filterModel ?? DEFAULT_FILTER_MODEL, props.onFilterModelChange);
  const [paginationModel, setPaginationModel] = useGridState(
    props.paginationModel,
    initialState?.pagination?.paginationModel ?? defaultPaginationModel,
    props.onPaginationModelChange,
  );
  const [rowGroupingModel, setRowGroupingModel] = useGridState<readonly string[]>(
    props.rowGroupingModel,
    initialState?.rowGrouping?.model ?? NO_FIELDS,
    props.onRowGroupingModelChange as ((model: readonly string[]) => void) | undefined,
  );
  const [storedAggregationModel, setAggregationModel] = useGridState<GridAggregationModel>(
    props.aggregationModel,
    initialState?.aggregation?.model ?? NO_MODEL,
    props.onAggregationModelChange,
  );

  const userAggregationModel = useMemo(
    () => Object.fromEntries(Object.entries(storedAggregationModel).filter(([, fn]) => functions[fn])),
    [storedAggregationModel, functions],
  );

  const [pivotEnabled, setPivotEnabled] = useGridState(props.pivotActive, initialState?.pivoting?.enabled ?? false, props.onPivotActiveChange);
  const [pivotModel, setPivotModel] = useGridState(props.pivotModel, initialState?.pivoting?.model ?? EMPTY_PIVOT_MODEL, props.onPivotModelChange);
  const pivotAvailable = Boolean(dataSource.supportsPivoting) && !props.disablePivoting;
  const pivotApplied = pivotAvailable && pivotEnabled && !isPivotModelEmpty(pivotModel);
  const [pivotColumnTree, setPivotColumnTree] = useState<GridPivotColumnNode[] | undefined>(undefined);
  const pivotRowFields = useMemo(() => pivotModel.rows.map(({ field }) => field), [pivotModel.rows]);
  // While pivoting the server groups by the pivot row fields, and aggregates through the pivot model instead.
  const effectiveGroupingModel = pivotApplied ? pivotRowFields : rowGroupingModel;
  const aggregationModel = pivotApplied ? NO_MODEL : userAggregationModel;
  const effectiveTreeData = treeData && !pivotApplied;

  // Without these two callbacks the server cannot describe a hierarchy, and grouping stays on the loaded rows.
  const canNest = Boolean(dataSource.getGroupKey && dataSource.getChildrenCount);
  const nestsByColumns = canNest && !effectiveTreeData && effectiveGroupingModel.length > 0;
  const nests = canNest && (effectiveTreeData || effectiveGroupingModel.length > 0);
  const isLazy = lazyLoading && !nests && !pivotApplied;
  const groupFields = nestsByColumns ? effectiveGroupingModel : NO_FIELDS;
  const sentPivotModel = pivotApplied ? pivotModel : undefined;

  const [root, setRoot] = useState<{ rows: readonly R[]; rowCount: number; aggregateRow?: R }>({ rows: [], rowCount: 0 });
  const [childrenByParent, setChildrenByParent] = useState<ReadonlyMap<GridRowId, readonly R[]>>(NO_CHILDREN);
  const [lazy, setLazy] = useState<LazyState<R>>({ chunks: new Map(), rowCount: null, loadedEnd: 0 });
  const [loading, setLoading] = useState(true);
  const [refetchTick, setRefetchTick] = useState(0);

  const cache = useMemo(() => (dataSourceCache === undefined ? new GridDataSourceCacheDefault() : dataSourceCache), [dataSourceCache]);
  const queryKey = JSON.stringify([sortModel, filterModel, groupFields, aggregationModel, nests, sentPivotModel ?? null, refetchTick]);
  const chunkSize = paginationModel.pageSize > 0 ? paginationModel.pageSize : FALLBACK_CHUNK_SIZE;

  const latest = useRef({ dataSource, sortModel, filterModel, groupFields, aggregationModel, paginationModel, queryKey, chunkSize, sentPivotModel });
  latest.current = { dataSource, sortModel, filterModel, groupFields, aggregationModel, paginationModel, queryKey, chunkSize, sentPivotModel };

  const makeParams = useCallback((pagination: GridPaginationModel, groupKeys: string[]): GridDataSourceGetRowsParams => {
    const { sortModel: sort, filterModel: filter, groupFields: fields, aggregationModel: aggregation, sentPivotModel: pivot } = latest.current;
    const start = pagination.pageSize > 0 ? pagination.page * pagination.pageSize : 0;
    return {
      sortModel: sort,
      filterModel: filter,
      paginationModel: pagination,
      start,
      end: pagination.pageSize > 0 ? start + pagination.pageSize - 1 : Number.MAX_SAFE_INTEGER,
      groupKeys,
      groupFields: [...fields],
      aggregationModel: aggregation,
      ...(pivot && { pivotModel: pivot }),
    };
  }, []);

  const request = useCallback(
    async (params: GridDataSourceGetRowsParams) => {
      const cached = cache?.get(params);
      if (cached) {
        return cached as GridDataSourceGetRowsResult<R>;
      }
      const response = await latest.current.dataSource.getRows(params);
      cache?.set(params, response);
      return response;
    },
    [cache],
  );

  const refetch = useCallback(() => {
    cache?.clear();
    setRefetchTick((tick) => tick + 1);
  }, [cache]);

  const requestRef = useRef(0);
  useEffect(() => {
    if (isLazy) {
      return;
    }
    const current = (requestRef.current += 1);
    const pagination = latest.current.paginationModel;
    const params = makeParams(pagination, NO_GROUP_KEYS);
    setLoading(true);
    request(params).then(
      (response) => {
        if (current === requestRef.current) {
          setRoot({ rows: response.rows, rowCount: getRowCount(response, params.start, pagination.pageSize), aggregateRow: response.aggregateRow });
          setPivotColumnTree(response.pivotColumns);
          setLoading(false);
        }
      },
      (error: unknown) => {
        if (current === requestRef.current) {
          setLoading(false);
          latest.current.dataSource.onError?.(error, params);
        }
      },
    );
  }, [isLazy, queryKey, paginationModel, makeParams, request]);

  // Children loaded for another sort or filter are wrong now. Page changes keep them, so a page still shows its groups open when the user returns.
  useEffect(() => setChildrenByParent(NO_CHILDREN), [queryKey]);

  const lazyRequests = useRef({ loaded: new Set<number>(), inFlight: new Set<number>() });
  const renderedRange = useRef<[number, number]>([0, 0]);
  const rangeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadRenderedChunks = useCallback(() => {
    const { chunkSize: size, queryKey: key } = latest.current;
    const [start, end] = renderedRange.current;
    const { loaded, inFlight } = lazyRequests.current;
    const requests = lazyRequests.current;
    for (let chunk = Math.floor(start / size); chunk <= Math.floor(Math.max(start, end - 1) / size); chunk += 1) {
      if (!loaded.has(chunk) && !inFlight.has(chunk)) {
        inFlight.add(chunk);
        const params = makeParams({ page: chunk, pageSize: size }, NO_GROUP_KEYS);
        request(params).then(
          (response) => {
            if (latest.current.queryKey !== key || requests !== lazyRequests.current) {
              return;
            }
            inFlight.delete(chunk);
            loaded.add(chunk);
            const count = getRowCount(response, params.start, size);
            setLazy((previous) => ({
              chunks: new Map(previous.chunks).set(chunk, response.rows),
              rowCount: count === -1 ? previous.rowCount : count,
              loadedEnd: Math.max(previous.loadedEnd, params.start + response.rows.length),
            }));
            setLoading(false);
          },
          (error: unknown) => {
            // Leaving the chunk unloaded lets the next scroll try it again.
            inFlight.delete(chunk);
            if (latest.current.queryKey === key) {
              setLoading(false);
              latest.current.dataSource.onError?.(error, params);
            }
          },
        );
      }
    }
  }, [makeParams, request]);

  useEffect(() => {
    if (!isLazy) {
      return;
    }
    lazyRequests.current = { loaded: new Set(), inFlight: new Set() };
    // The row count stays until the new one arrives, so the scrollbar does not jump.
    setLazy((previous) => ({ ...previous, chunks: new Map(), loadedEnd: 0 }));
    setLoading(true);
    loadRenderedChunks();
  }, [isLazy, queryKey, chunkSize, loadRenderedChunks]);

  useEffect(
    () => () => {
      if (rangeTimer.current !== null) {
        clearTimeout(rangeTimer.current);
        rangeTimer.current = null;
      }
    },
    [],
  );

  const onRenderedRangeChange = useCallback(
    (start: number, end: number) => {
      renderedRange.current = [start, end];
      if (rangeTimer.current === null) {
        rangeTimer.current = setTimeout(() => {
          rangeTimer.current = null;
          loadRenderedChunks();
        }, lazyLoadingRequestThrottleMs);
      }
    },
    [loadRenderedChunks, lazyLoadingRequestThrottleMs],
  );

  // Parents come before their children, which is the order the tree is built in.
  const { flatRows, pathById, groupIds } = useMemo(() => {
    const rows: R[] = [];
    const paths = new Map<GridRowId, string[]>();
    const groups = new Set<GridRowId>();
    if (nests) {
      const visit = (level: readonly R[], parentPath: string[], depth: number) => {
        for (const row of level) {
          const id = userGetRowId(row);
          const isColumnGroup = nestsByColumns && depth < groupFields.length;
          const path = [...parentPath, isColumnGroup || effectiveTreeData ? String(dataSource.getGroupKey?.(row)) : String(id)];
          paths.set(id, path);
          if (isColumnGroup) {
            groups.add(id);
          }
          rows.push(row);
          visit(childrenByParent.get(id) ?? [], path, depth + 1);
        }
      };
      visit(root.rows, [], 0);
    }
    return { flatRows: rows, pathById: paths, groupIds: groups };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nests, nestsByColumns, effectiveTreeData, groupFields, root.rows, childrenByParent, userGetRowId]);

  const pathRef = useRef(pathById);
  pathRef.current = pathById;
  const groupIdsRef = useRef(groupIds);
  groupIdsRef.current = groupIds;

  const isPlaceholderRow = useCallback((row: R) => PLACEHOLDER_INDEX in row, []);
  const isGroupRow = useCallback((row: R) => groupIdsRef.current.has(userGetRowId(row)), [userGetRowId]);
  const getRowId = useCallback(
    (row: R): GridRowId => (PLACEHOLDER_INDEX in row ? `lazy-placeholder-${row[PLACEHOLDER_INDEX]}` : userGetRowId(row)),
    [userGetRowId],
  );
  const getTreeDataPath = useCallback((row: R) => pathRef.current.get(userGetRowId(row)) ?? [], [userGetRowId]);

  const getChildrenCount = useCallback(
    (row: R) => (nestsByColumns && !groupIdsRef.current.has(userGetRowId(row)) ? 0 : (latest.current.dataSource.getChildrenCount?.(row) ?? 0)),
    [nestsByColumns, userGetRowId],
  );

  const onFetchChildren = useCallback(
    ({ id }: { id: GridRowId }) => {
      const key = latest.current.queryKey;
      const params = makeParams(latest.current.paginationModel, pathRef.current.get(id) ?? []);
      return request(params).then(
        (response) => {
          if (latest.current.queryKey === key) {
            setChildrenByParent((previous) => new Map(previous).set(id, response.rows));
          }
        },
        (error: unknown) => latest.current.dataSource.onError?.(error, params),
      );
    },
    [makeParams, request],
  );

  const lazyRows = useMemo(() => {
    if (!isLazy) {
      return [];
    }
    const count = lazy.rowCount ?? lazy.loadedEnd + chunkSize;
    return Array.from({ length: count }, (_, index) => {
      const row = lazy.chunks.get(Math.floor(index / chunkSize))?.[index % chunkSize];
      return row ?? ({ [PLACEHOLDER_INDEX]: index } as unknown as R);
    });
  }, [isLazy, lazy, chunkSize]);

  // Group rows hold only their key and aggregates, so a column's own getter or formatter may not cope with them.
  const columns = useMemo<readonly GridColDef<R>[]>(
    () =>
      nestsByColumns
        ? props.columns.map((column) => ({
            ...column,
            ...(column.valueGetter && {
              valueGetter: (value: unknown, row: R) => (isGroupRow(row) ? value : column.valueGetter?.(value, row)),
            }),
            ...(column.valueFormatter && {
              valueFormatter: (value: unknown, row: R) => (isGroupRow(row) && value == null ? '' : (column.valueFormatter?.(value, row) ?? '')),
            }),
          }))
        : props.columns,
    [nestsByColumns, props.columns, isGroupRow],
  );

  const pivotColumnsSource = props.columns;
  const getPivotColumnField = dataSource.getPivotColumnField;
  const { pivotingColDef } = props;
  const pivotLayout = useMemo(
    () =>
      pivotApplied
        ? buildServerPivotLayout({
            model: pivotModel,
            columns: new Map(pivotColumnsSource.map((column) => [column.field, column])),
            pivotColumns: pivotColumnTree,
            functions,
            getField: getPivotColumnField,
            pivotingColDef: pivotingColDef as Parameters<typeof buildServerPivotLayout>[0]['pivotingColDef'],
          })
        : null,
    [pivotApplied, pivotModel, pivotColumnsSource, pivotColumnTree, functions, getPivotColumnField, pivotingColDef],
  );

  // Pivot rows hold their values in the generated fields, so reading those is the default way to their aggregates.
  const getAggregatedValue =
    dataSource.getAggregatedValue ?? (pivotApplied ? (row: R, field: string) => (row as GridValidRowModel)[field] : undefined);
  const shownAggregationModel = pivotLayout?.aggregationModel ?? aggregationModel;
  const footerAggregates = useMemo(() => {
    if (!getAggregatedValue || !root.aggregateRow) {
      return null;
    }
    const aggregateRow = root.aggregateRow;
    return Object.fromEntries(Object.keys(shownAggregationModel).map((field) => [field, getAggregatedValue(aggregateRow, field)]));
  }, [getAggregatedValue, root.aggregateRow, shownAggregationModel]);

  const userProcessRowUpdate = props.processRowUpdate;
  const processRowUpdate = dataSource.updateRow
    ? async (newRow: R, oldRow: R) => {
        const updatedRow = userProcessRowUpdate ? await userProcessRowUpdate(newRow, oldRow) : newRow;
        const rowId = userGetRowId(oldRow);
        const saved = (await dataSource.updateRow?.({ rowId, updatedRow, previousRow: oldRow })) ?? updatedRow;
        // Cached pages and aggregates may include the old value.
        cache?.clear();
        const patch = (rows: readonly R[]) => (rows.some((row) => userGetRowId(row) === rowId) ? rows.map((row) => (userGetRowId(row) === rowId ? saved : row)) : rows);
        setRoot((previous) => ({ ...previous, rows: patch(previous.rows) }));
        setChildrenByParent((previous) => new Map([...previous].map(([parent, rows]) => [parent, patch(rows)])));
        setLazy((previous) => ({ ...previous, chunks: new Map([...previous.chunks].map(([chunk, rows]) => [chunk, patch(rows)])) }));
        return saved;
      }
    : userProcessRowUpdate;

  const userIsRowSelectable = props.isRowSelectable;
  const userIsCellEditable = props.isCellEditable;
  const serverRows: GridServerRows<R> = {
    groupsByColumns: nestsByColumns,
    isGroupRow,
    isPlaceholderRow,
    getAggregatedValue,
    footerAggregates,
    childrenKey: queryKey,
    onRenderedRangeChange: isLazy ? onRenderedRangeChange : undefined,
  };

  const serverPivot: GridServerPivot = {
    available: pivotAvailable,
    enabled: pivotEnabled,
    applied: pivotApplied,
    model: pivotModel,
    setEnabled: setPivotEnabled,
    setModel: setPivotModel,
    layout: pivotLayout,
  };

  return {
    rows: nests ? flatRows : isLazy ? lazyRows : root.rows,
    columns: pivotLayout ? (pivotLayout.columns as unknown as GridColDef<R>[]) : columns,
    serverPivot,
    rowCount: isLazy ? (lazy.rowCount ?? -1) : root.rowCount,
    loading: props.loading || loading,
    sortModel,
    onSortModelChange: setSortModel,
    filterModel,
    onFilterModelChange: setFilterModel,
    paginationModel,
    onPaginationModelChange: setPaginationModel,
    rowGroupingModel: effectiveGroupingModel as string[],
    onRowGroupingModelChange: setRowGroupingModel as (model: string[]) => void,
    aggregationModel: shownAggregationModel,
    onAggregationModelChange: setAggregationModel,
    sortingMode: 'server',
    filterMode: 'server',
    paginationMode: 'server',
    onRefetchRequest: refetch,
    processRowUpdate,
    serverRows,
    ...(isLazy && { pagination: false, getRowId }),
    ...(nests ? { treeData: true, getTreeDataPath, getChildrenCount, onFetchChildren } : pivotApplied ? { treeData: false } : {}),
    ...(nestsByColumns && {
      isRowSelectable: (params: { id: GridRowId; row: R }) => !groupIdsRef.current.has(params.id) && (userIsRowSelectable?.(params) ?? true),
      isCellEditable: (params: Parameters<NonNullable<DataGridProps<R>['isCellEditable']>>[0]) =>
        !groupIdsRef.current.has(params.id) && (userIsCellEditable?.(params) ?? true),
    }),
  } as const;
}
