import { useMemo } from 'react';
import type {
  GridAggregationModel,
  GridAggregationPosition,
  GridGroupNode,
  GridColDef,
  GridFilterModel,
  GridRowId,
  GridSortModel,
  GridValidRowModel,
} from '../DataGrid.types';
import { computeAggregates, type GridAggregationFunctions } from '../features/aggregation';
import { getCellValue, getFormattedValue } from '../features/columns';
import { getFilterPredicate } from '../features/filtering';
import { getRowComparator } from '../features/sorting';
import {
  buildFlatNodes,
  buildGroupedTree,
  buildPathTree,
  collectLeafRows,
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
  /** Rows generated for a group, which are left out of `filteredRows`. */
  isGroupRow?: (row: R) => boolean;
  isPlaceholderRow?: (row: R) => boolean;
  ignoreDiacritics?: boolean;
  /** Tree data: filter and sort only the top level. */
  disableChildrenFiltering?: boolean;
  disableChildrenSorting?: boolean;
  aggregationRowsScope?: 'filtered' | 'all';
  getAggregationPosition?: (node: GridGroupNode) => GridAggregationPosition;
  isGroupExpandedByDefault?: (node: GridGroupNode) => boolean;
}

export const ROOT_GROUP_ID = '__root_group__';

export function toGroupNode<R extends GridValidRowModel>(node: GridTreeNode<R>): GridGroupNode {
  return {
    id: node.id,
    depth: node.depth,
    groupingField: node.groupField ?? null,
    groupingKey: node.label,
    childrenCount: node.rowCount - (node.row ? 1 : 0),
  };
}

const defaultAggregationPosition = (node: GridGroupNode): GridAggregationPosition => (node.depth === -1 ? 'footer' : 'inline');

export interface UseGridRowsResult<R extends GridValidRowModel> {
  /** Nodes on the current page, in display order, with expanded descendants included. */
  pageNodes: GridTreeNode<R>[];
  /** Top level nodes after filtering and sorting, before pagination. */
  roots: GridTreeNode<R>[];
  /** Top level nodes before filtering. Sorted only when no filter applies. */
  allRoots: GridTreeNode<R>[];
  rootCount: number;
  page: number;
  /** Every data row that passes the filters, in display order with all groups expanded. */
  filteredRows: R[];
  nodeAggregates: ReadonlyMap<GridRowId, Record<string, unknown>>;
  /** Where each group on the page shows its aggregates. Groups without an entry show none. */
  aggregationPositions: ReadonlyMap<GridRowId, 'inline' | 'footer'>;
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
    isGroupRow,
    isPlaceholderRow,
    ignoreDiacritics = false,
    disableChildrenFiltering = false,
    disableChildrenSorting = false,
    aggregationRowsScope = 'filtered',
    getAggregationPosition = defaultAggregationPosition,
    isGroupExpandedByDefault,
  } = params;

  const isGroup = (treeData && Boolean(getTreeDataPath)) || rowGroupingModel.length > 0;

  const isPathTree = treeData && Boolean(getTreeDataPath);

  const { roots, unfilteredRoots } = useMemo(() => {
    const predicate =
      filterMode === 'client' ? getFilterPredicate(filterModel, columnsByField, quickFilterColumns, { ignoreDiacritics }) : null;
    const comparator = sortingMode === 'client' ? getRowComparator(sortModel, columnsByField) : null;

    if (!isGroup) {
      const filtered = predicate ? rows.filter(predicate) : [...rows];
      return { roots: buildFlatNodes(comparator ? filtered.sort(comparator) : filtered, getRowId, isPlaceholderRow), unfilteredRoots: null };
    }

    const tree =
      treeData && getTreeDataPath
        ? buildPathTree(rows, getRowId, getTreeDataPath)
        : buildGroupedTree(rows, getRowId, rowGroupingModel, (row, field) => {
            const column = columnsByField.get(field);
            const label = column?.groupingValueGetter
              ? String(column.groupingValueGetter(getCellValue(row, column), row) ?? '')
              : column
                ? getFormattedValue(row, column)
                : String(row[field] ?? '');
            return label === '' ? NO_VALUE_LABEL : label;
          });
    const pruned = predicate ? pruneTree(tree, predicate, isPathTree && disableChildrenFiltering) : tree;
    return {
      roots: sortTree(pruned, comparator, isPathTree && disableChildrenSorting),
      unfilteredRoots: predicate ? tree : null,
    };
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
    isPlaceholderRow,
    ignoreDiacritics,
    isPathTree,
    disableChildrenFiltering,
    disableChildrenSorting,
  ]);

  const isExpanded = useMemo(
    () => (node: GridTreeNode<R>) =>
      expansion.get(node.id) ??
      (isGroupExpandedByDefault
        ? isGroupExpandedByDefault(toGroupNode(node))
        : defaultExpansionDepth === -1 || node.depth < defaultExpansionDepth),
    [expansion, defaultExpansionDepth, isGroupExpandedByDefault],
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
      flattenTree(roots, () => true).flatMap((node) => (node.row && !isGroupRow?.(node.row) ? [node.row] : [])),
    [roots, isGroupRow],
  );

  const hasAggregation = Object.keys(aggregationModel).length > 0;

  // With the 'all' scope a group aggregates the rows the filters hid too, so it reads them from the unfiltered tree.
  const unfilteredById = useMemo(() => {
    const index = new Map<GridRowId, GridTreeNode<R>>();
    if (hasAggregation && aggregationRowsScope === 'all' && unfilteredRoots) {
      for (const node of flattenTree(unfilteredRoots, () => true)) {
        index.set(node.id, node);
      }
    }
    return index;
  }, [hasAggregation, aggregationRowsScope, unfilteredRoots]);

  const { nodeAggregates, aggregationPositions } = useMemo(() => {
    const aggregates = new Map<GridRowId, Record<string, unknown>>();
    const positions = new Map<GridRowId, 'inline' | 'footer'>();
    if (hasAggregation) {
      for (const node of pageNodes) {
        if (node.children.length === 0) {
          continue;
        }
        const position = getAggregationPosition(toGroupNode(node));
        if (!position) {
          continue;
        }
        positions.set(node.id, position);
        const source = unfilteredById.get(node.id) ?? node;
        // Like MUI X, a parent aggregates the leaves below it. Tree data parents with values of their own leave those out.
        aggregates.set(node.id, computeAggregates(collectLeafRows(source), aggregationModel, columnsByField, aggregationFunctions, node.id));
      }
    }
    return { nodeAggregates: aggregates, aggregationPositions: positions };
  }, [hasAggregation, pageNodes, aggregationModel, columnsByField, aggregationFunctions, getAggregationPosition, unfilteredById]);

  const footerAggregates = useMemo(() => {
    if (!hasAggregation) {
      return null;
    }
    const leaves = (nodes: readonly GridTreeNode<R>[]) => nodes.flatMap((node) => collectLeafRows(node));
    const scopeRows = isPathTree
      ? leaves(aggregationRowsScope === 'all' ? (unfilteredRoots ?? roots) : roots)
      : aggregationRowsScope === 'all'
        ? rows.filter((row) => !isGroupRow?.(row) && !isPlaceholderRow?.(row))
        : filteredRows;
    const root: GridGroupNode = { id: ROOT_GROUP_ID, depth: -1, groupingField: null, groupingKey: null, childrenCount: scopeRows.length };
    if (!getAggregationPosition(root)) {
      return null;
    }
    return computeAggregates(scopeRows, aggregationModel, columnsByField, aggregationFunctions);
  }, [hasAggregation, isPathTree, roots, unfilteredRoots, aggregationRowsScope, rows, isGroupRow, isPlaceholderRow, filteredRows, getAggregationPosition, aggregationModel, columnsByField, aggregationFunctions]);

  return {
    pageNodes,
    roots,
    allRoots: unfilteredRoots ?? roots,
    rootCount: roots.length,
    page: currentPage,
    filteredRows,
    nodeAggregates,
    aggregationPositions,
    footerAggregates,
    isExpanded,
    isGroup,
  };
}
