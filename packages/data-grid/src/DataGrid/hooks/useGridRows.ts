import { useMemo } from 'react';
import type {
  GridAggregationModel,
  GridColDef,
  GridFilterModel,
  GridRowId,
  GridSortModel,
  GridValidRowModel,
} from '../DataGrid.types';
import { computeAggregates, type GridAggregationFunctions } from '../features/aggregation';
import { getFormattedValue } from '../features/columns';
import { getFilterPredicate } from '../features/filtering';
import { getRowComparator } from '../features/sorting';
import {
  buildFlatNodes,
  buildGroupedTree,
  buildPathTree,
  collectRows,
  NO_VALUE_LABEL,
  flattenTree,
  pruneTree,
  sortTree,
  type GridTreeNode,
} from '../features/tree';

export interface UseGridRowsParams<R extends GridValidRowModel> {
  rows: readonly R[];
  getRowId: (row: R) => GridRowId;
  columnsByField: ReadonlyMap<string, GridColDef<R>>;
  /** Columns the quick filter searches through. */
  quickFilterColumns: readonly GridColDef<R>[];
  sortModel: GridSortModel;
  filterModel: GridFilterModel;
  sortingMode: 'client' | 'server';
  filterMode: 'client' | 'server';
  treeData: boolean;
  getTreeDataPath?: (row: R) => string[];
  rowGroupingModel: readonly string[];
  /** Explicit expansion choices per node id. Nodes without an entry follow `defaultExpansionDepth`. */
  expansion: ReadonlyMap<GridRowId, boolean>;
  defaultExpansionDepth: number;
  pagination: boolean;
  paginationMode: 'client' | 'server';
  page: number;
  pageSize: number;
  aggregationModel: GridAggregationModel;
  aggregationFunctions: GridAggregationFunctions;
}

export interface UseGridRowsResult<R extends GridValidRowModel> {
  /** Nodes on the current page, in display order, with expanded descendants included. */
  pageNodes: GridTreeNode<R>[];
  /** Top level nodes after filtering and sorting, before pagination. */
  roots: GridTreeNode<R>[];
  rootCount: number;
  page: number;
  /** Every data row that passes the filters, in display order with all groups expanded. */
  filteredRows: R[];
  nodeAggregates: ReadonlyMap<GridRowId, Record<string, unknown>>;
  footerAggregates: Record<string, unknown> | null;
  isExpanded: (node: GridTreeNode<R>) => boolean;
  isGroup: boolean;
}

export function useGridRows<R extends GridValidRowModel>(params: UseGridRowsParams<R>): UseGridRowsResult<R> {
  const {
    rows,
    getRowId,
    columnsByField,
    quickFilterColumns,
    sortModel,
    filterModel,
    sortingMode,
    filterMode,
    treeData,
    getTreeDataPath,
    rowGroupingModel,
    expansion,
    defaultExpansionDepth,
    pagination,
    paginationMode,
    page,
    pageSize,
    aggregationModel,
    aggregationFunctions,
  } = params;

  const isGroup = (treeData && Boolean(getTreeDataPath)) || rowGroupingModel.length > 0;

  const roots = useMemo(() => {
    const predicate =
      filterMode === 'client' ? getFilterPredicate(filterModel, columnsByField, quickFilterColumns) : null;
    const comparator = sortingMode === 'client' ? getRowComparator(sortModel, columnsByField) : null;

    if (!isGroup) {
      const filtered = predicate ? rows.filter(predicate) : [...rows];
      return buildFlatNodes(comparator ? filtered.sort(comparator) : filtered, getRowId);
    }

    let tree =
      treeData && getTreeDataPath
        ? buildPathTree(rows, getRowId, getTreeDataPath)
        : buildGroupedTree(rows, getRowId, rowGroupingModel, (row, field) => {
            const column = columnsByField.get(field);
            const label = column ? getFormattedValue(row, column) : String(row[field] ?? '');
            return label === '' ? NO_VALUE_LABEL : label;
          });
    if (predicate) {
      tree = pruneTree(tree, predicate);
    }
    return sortTree(tree, comparator);
  }, [
    rows,
    getRowId,
    columnsByField,
    quickFilterColumns,
    sortModel,
    filterModel,
    sortingMode,
    filterMode,
    isGroup,
    treeData,
    getTreeDataPath,
    rowGroupingModel,
  ]);

  const isExpanded = useMemo(
    () => (node: GridTreeNode<R>) =>
      expansion.get(node.id) ?? (defaultExpansionDepth === -1 || node.depth < defaultExpansionDepth),
    [expansion, defaultExpansionDepth],
  );

  // A page size of -1 (or any value below 1) is the "All" option: one page with every row.
  const clientPagination = pagination && paginationMode === 'client' && pageSize > 0;
  const lastPage = clientPagination ? Math.max(0, Math.ceil(roots.length / pageSize) - 1) : 0;
  const currentPage = clientPagination ? Math.min(page, lastPage) : page;

  const pageNodes = useMemo(() => {
    const pageRoots = clientPagination ? roots.slice(currentPage * pageSize, (currentPage + 1) * pageSize) : roots;
    return flattenTree(pageRoots, isExpanded);
  }, [roots, clientPagination, currentPage, pageSize, isExpanded]);

  const filteredRows = useMemo(
    () =>
      flattenTree(roots, () => true).flatMap((node) => (node.row ? [node.row] : [])),
    [roots],
  );

  const hasAggregation = Object.keys(aggregationModel).length > 0;

  const nodeAggregates = useMemo(() => {
    const result = new Map<GridRowId, Record<string, unknown>>();
    if (hasAggregation) {
      for (const node of pageNodes) {
        if (node.children.length > 0) {
          result.set(node.id, computeAggregates(collectRows(node), aggregationModel, columnsByField, aggregationFunctions, node.id));
        }
      }
    }
    return result;
  }, [hasAggregation, pageNodes, aggregationModel, columnsByField, aggregationFunctions]);

  const footerAggregates = useMemo(
    () => (hasAggregation ? computeAggregates(filteredRows, aggregationModel, columnsByField, aggregationFunctions) : null),
    [hasAggregation, filteredRows, aggregationModel, columnsByField, aggregationFunctions],
  );

  return {
    pageNodes,
    roots,
    rootCount: roots.length,
    page: currentPage,
    filteredRows,
    nodeAggregates,
    footerAggregates,
    isExpanded,
    isGroup,
  };
}
