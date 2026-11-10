/**
 * Class names on the grid's parts, the same as MUI X uses, so CSS and `styleOverrides` written for MUI X carry over.
 * Each key is also a slot of `theme.components.MuiDataGrid.styleOverrides`.
 */
export const gridClasses = {
  root: 'MuiDataGrid-root',
  toolbarContainer: 'MuiDataGrid-toolbarContainer',
  main: 'MuiDataGrid-main',
  virtualScroller: 'MuiDataGrid-virtualScroller',
  columnHeaders: 'MuiDataGrid-columnHeaders',
  columnHeader: 'MuiDataGrid-columnHeader',
  'columnHeader--sorted': 'MuiDataGrid-columnHeader--sorted',
  'columnHeader--sortable': 'MuiDataGrid-columnHeader--sortable',
  'columnHeader--pinnedLeft': 'MuiDataGrid-columnHeader--pinnedLeft',
  'columnHeader--pinnedRight': 'MuiDataGrid-columnHeader--pinnedRight',
  columnHeaderTitle: 'MuiDataGrid-columnHeaderTitle',
  columnGroupHeader: 'MuiDataGrid-columnGroupHeader',
  headerFilterRow: 'MuiDataGrid-headerFilterRow',
  row: 'MuiDataGrid-row',
  'row--detailPanelExpanded': 'MuiDataGrid-row--detailPanelExpanded',
  cell: 'MuiDataGrid-cell',
  'cell--editing': 'MuiDataGrid-cell--editing',
  'cell--selected': 'MuiDataGrid-cell--selected',
  'cell--pinnedLeft': 'MuiDataGrid-cell--pinnedLeft',
  'cell--pinnedRight': 'MuiDataGrid-cell--pinnedRight',
  'cell--textLeft': 'MuiDataGrid-cell--textLeft',
  'cell--textCenter': 'MuiDataGrid-cell--textCenter',
  'cell--textRight': 'MuiDataGrid-cell--textRight',
  groupingCriteriaCell: 'MuiDataGrid-groupingCriteriaCell',
  treeDataGroupingCell: 'MuiDataGrid-treeDataGroupingCell',
  detailPanel: 'MuiDataGrid-detailPanel',
  aggregationRow: 'MuiDataGrid-aggregationRow',
  pinnedRows: 'MuiDataGrid-pinnedRows',
  'pinnedRows--top': 'MuiDataGrid-pinnedRows--top',
  'pinnedRows--bottom': 'MuiDataGrid-pinnedRows--bottom',
  overlay: 'MuiDataGrid-overlay',
  footerContainer: 'MuiDataGrid-footerContainer',
  selectedRowCount: 'MuiDataGrid-selectedRowCount',
} as const;

export type GridClassKey = keyof typeof gridClasses;

/** Joins class names, leaving out empty ones. */
export const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ') || undefined;

/**
 * Turns `styleOverrides` from the theme into styles for the root: `root` applies to the root itself, every other slot
 * to the elements with its class. Function overrides receive the grid's props and the theme, as in MUI.
 */
export function resolveStyleOverrides(
  overrides: Record<string, unknown> | undefined,
  args: { ownerState: unknown; theme: unknown },
): Record<string, unknown> {
  if (!overrides) {
    return {};
  }
  const resolve = (value: unknown) => (typeof value === 'function' ? (value as (input: typeof args) => unknown)(args) : value);
  const styles: Record<string, unknown> = {};
  for (const [slot, value] of Object.entries(overrides)) {
    const className = gridClasses[slot as GridClassKey];
    if (slot === 'root') {
      Object.assign(styles, resolve(value));
    } else if (className) {
      styles[`& .${className}`] = resolve(value);
    }
  }
  return styles;
}
