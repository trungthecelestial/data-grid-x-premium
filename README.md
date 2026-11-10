# DNA Data Grid

A React data grid inspired by the features, structure and usage of [MUI X Data Grid](https://mui.com/x/react-data-grid/).

## Layout

| Path | Description |
| --- | --- |
| `packages/data-grid` | `@dna/data-grid`, the grid library |
| `packages/typescript-config` | Shared `tsconfig` presets |
| `apps/playground` | Vite app for trying the grid during development |

## Getting started

Requires Node 22.23.4+ and pnpm 10 (`npm i -g pnpm`, or `corepack enable` on Node 22-24).

```bash
pnpm install
pnpm dev
```

## Pivoting

Set `pivotModel` and `pivotActive`, seed them through `initialState.pivoting`, or let users build the table from the Pivot button in the toolbar.

```tsx
<DataGrid
  rows={rows}
  columns={columns}
  showToolbar
  initialState={{
    pivoting: {
      enabled: true,
      model: {
        rows: [{ field: 'team' }],
        columns: [{ field: 'year', sort: 'desc' }],
        values: [{ field: 'salary', aggFunc: 'avg' }],
      },
    },
  }}
/>
```

Filters run on the source rows before pivoting, and sorting runs on the generated rows. Every subtotal and total is calculated from the source rows. Client-side pivoting is unavailable with a server mode. With `dataSource`, the server can pivot instead (see below).

## Custom aggregation functions

`aggregationFunctions` replaces the built-in set, so spread `GRID_AGGREGATION_FUNCTIONS` to keep it. Registered functions appear in the column menu and the pivot panel for the column types they accept.

```tsx
const aggregationFunctions = {
  ...GRID_AGGREGATION_FUNCTIONS,
  range: {
    label: 'Range',
    columnTypes: ['number'],
    apply: ({ values }) => Math.max(...values) - Math.min(...values),
  },
};
```

Add `getCellValue` when a function needs more of the row than the cell, as a weighted average does, and `valueFormatter` to format its result.

## Auto-measured row heights

Return `'auto'` from `getRowHeight` to size a row to its content. `rowHeight` becomes the minimum, and text wraps. Heights are measured as rows render and kept up to date when content or column widths change. Give `getEstimatedRowHeight` a value close to the typical height to keep the scrollbar steady, and call `apiRef.current.resetRowHeights()` to measure again from scratch.

## Server-side data

Pass `dataSource` and sorting, filtering and pagination run on your server. The other parts are opt-in:

| To get | Add |
| --- | --- |
| Row grouping or tree data on the server, loading children on expand | `getGroupKey` and `getChildrenCount`, then read `groupKeys` and `groupFields` in `getRows` |
| Aggregates calculated on the server | `getAggregatedValue`, and `aggregateRow` in the response for the footer |
| Saving edits | `updateRow` |
| One long list that loads as it scrolls | The `lazyLoading` prop |
| Paging without a total | Leave out `rowCount`, optionally returning `pageInfo.hasNextPage` |

Responses are cached for five minutes. Pass your own `dataSourceCache`, or `null` to turn it off. `apiRef.current.refetch()` empties the cache and loads again.

Only the top level is paginated, so a response for `groupKeys` with entries should hold all children of that parent.

### Server-side pivoting

Set `supportsPivoting` on the data source to show the Pivot button. While a pivot table shows, `getRows` receives `pivotModel`, and `groupFields` holds its row fields, so the server returns one group row per value with `getGroupKey` and `getChildrenCount` as for row grouping. Each row holds the value of every column path in the field `getPivotColumnField` names, by default the path and the value field joined with `>->` (`2024>->North>->salary`). Return the values of the column fields as a tree in `pivotColumns`, and the grand totals in `aggregateRow`.

## Undo and redo

Cell edits, row edits and pastes go on a history stack. Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z or Ctrl+Y redoes, and the toolbar shows both buttons. Undoing calls `processRowUpdate` with the earlier row, so the change reaches your server too. Set `historyStackSize` to change how many steps are kept (30 by default, `0` turns it off), and use `apiRef.current.history` (`undo`, `redo`, `canUndo`, `canRedo`, `clear`) from your own controls. A step whose rows changed since, for example after new `rows` arrive, empties the history instead of overwriting them.

## Grouping and aggregation options

| Prop | Does |
| --- | --- |
| `rowGroupingColumnMode="multiple"` | One grouping column per grouped field |
| `groupingColDef` | Also takes `hideDescendantCount`, `leafField`, or a function of `{ groupingField }` |
| `isGroupExpandedByDefault` | Picks the groups that start expanded |
| `getAggregationPosition` | `'inline'`, `'footer'` or `null` per group; depth -1 is the grand total |
| `aggregationRowsScope="all"` | Aggregates the rows the filters hide too |
| `disableChildrenFiltering`, `disableChildrenSorting` | Tree data filters or sorts the top level only |
| `groupingValueGetter` (column) | Groups by another value than the cell's, such as the year of a date |

A group, and a tree data parent, aggregates the leaf rows below it. A parent's own values are left out of its total.

With `rowReordering`, tree data and grouped rows can be dragged, or moved with Alt+Arrow, among the rows of their own parent. Children move along with their parent. Dragging a grouped row onto a row or a group of another group moves it there: the grid copies the group's values into the row, or calls the column's `groupingValueSetter` when it has a `groupingValueGetter`. Tree rows move to another parent when you pass `setTreeDataPath`. Either way the changed rows go through `processRowUpdate` and can be undone.

From the keyboard, on a row's drag handle: Alt+Up/Down at the start or end of a group moves a grouped row into the group above or below. Alt+Shift+Right makes a tree row the last child of the row above it, and Alt+Shift+Left moves it out of its parent, right after the parent.

## Charts

Set `chartsIntegration` to add a Charts button to the toolbar. Its panel plots the rows as the grid shows them: after the filters and sorting, as groups with their aggregates when rows are grouped, or as the pivot table when pivoting.

```tsx
<DataGrid
  rows={rows}
  columns={columns}
  showToolbar
  chartsIntegration
  initialState={{ charts: { model: { type: 'column', categoryField: 'team', series: ['salary'] } } }}
/>
```

| Part | Detail |
| --- | --- |
| Types | `column`, `bar`, `line`, `area`, `pie` and `scatter`. Scatter plots the first series against the second |
| Series | Number columns. Pick them in the panel or in `series` |
| Categories | `categoryField`, or the first column that is not a number. Rows with the same category add up. With row grouping, each group is a category and its aggregate is the value, falling back to the sum of its rows |
| Limits | The first 100 categories are drawn |
| Control | `chartsModel` and `onChartsModelChange`, `apiRef.current.getChartsModel()`, `setChartsModel()` and `getChartData()`. The model is part of `exportState()` and `restoreState()` |
| Slot | `slots.chartsPanel` replaces the panel. `GridChart` is exported to draw a `GridChartData` anywhere |

The charts are SVG drawn by the grid in the theme colors, so no chart library is needed. The panel can download the chart as an SVG file.

## Pivoting extras

The pivot panel lists the unused fields at the top. Drag them into rows, columns or values, between those areas, or back to the list to remove them. The buttons still work from the keyboard. Date columns offer a year and a quarter field. Pass `getPivotDerivedColumns` to offer others, and `pivotingColDef` to change the generated value columns.

## Excel export

`excelOptions.columnsStyles` styles the cells of a column with a subset of the exceljs style (`numFmt`, `font`, `fill`, `alignment`), so styles written for MUI X carry over. With row grouping or tree data the export writes each group as a bold row with its aggregates and nests its rows in Excel outline levels. Pass `includeRowGroups: false` for flat rows.

## Other options

| Prop | Does |
| --- | --- |
| `listView`, `listViewColumn` | Shows each row as one full-width cell, without headers |
| `autoPageSize` | Fits the page size to the grid's height |
| `multipleColumnsSortingMode="always"` | Every header click adds to the sort |
| `filterDebounceMs`, `ignoreDiacritics`, `disableMultipleColumnsFiltering` | Filtering behaviour |
| `clipboardCopyCellDelimiter`, `splitClipboardPastedText` | Clipboard format |
| `isRowReorderable`, `headerFilterHeight` | Per-row reordering, header filter row height |
| `autosizeOnMount`, `autosizeOptions` | Fits columns to their content on mount, and sets the autosize defaults |
| `getDetailPanelHeight` returning `'auto'` | Sizes a detail panel to its content |

CSV exports prefix text that starts like a formula (`=`, `+`, `-`, `@`) with `'`. Pass `escapeFormulas: false` in `csvOptions` to turn it off.

## Keyboard

Arrow keys move between cells. Up from the first row moves into the column headers, where Left and Right move between headers, Enter sorts (Shift+Enter adds to the sort), Ctrl/Cmd+Enter or Alt+Down opens the column menu, and Down returns to the rows. The grid keeps one tab stop.

## Locales and right-to-left

Pass one of `frFR`, `deDE`, `esES`, `ptBR`, `jaJP`, `zhCN` or `arSD` to `localeText`, or spread one and override a few texts. To set it once for every grid, put it in the theme: `createTheme(theme, getGridLocalization(frFR))`. Any other prop can default from `theme.components.MuiDataGrid.defaultProps` too, as with MUI X. A grid's own props win, and its `localeText` overrides single texts of the theme's. A theme with `direction: 'rtl'` lays the grid out right to left: pinned columns, indents, resizing, scrolling and arrow keys follow the reading direction.

## More api methods

`apiRef.current` also has `showFilterPanel`, `hideFilterPanel`, `showPreferences`, `showColumnMenu`, `hideColumnMenu`, `toggleColumnMenu`, `upsertFilterItem(s)`, `deleteFilterItem`, `setFilterLogicOperator`, `sortColumn`, `getSortedRowIds`, `getSortedRows`, `getRowIdFromRowIndex`, `setColumnVisibilityModel`, `setEditCellValue`, `getCellMode`, `getRowMode`, `getRowParams`, `getCellParams`, `getColumnHeaderParams`, `getRowNode`, `getRowGroupChildren`, `addRowGroupingCriteria`, `removeRowGroupingCriteria`, `setRowGroupingCriteriaIndex`, `setColumnHeaderFocus`, `setRows`, `updateColumns`, `selectRowRange`, `selectCellRange`, `setExpandedDetailPanels`, `setAllRowChildrenExpansion`, `isColumnPinned`, `getColumnPosition`, `getRootDimensions`, `getLocaleText`, `getRowElement`, `getCellElement`, `getColumnHeaderElement`, `getRowValue`, `getRowFormattedValue`, `isRowSelectable`, `publishEvent`, `getAggregationModel`, `getRowGroupingModel` and `getColumnVisibilityModel`.

## Styling and theming like MUI X

The grid's parts carry MUI X's class names (`MuiDataGrid-root`, `MuiDataGrid-row`, `MuiDataGrid-cell`, `MuiDataGrid-columnHeader` and the rest of `gridClasses`), so CSS written for MUI X carries over. `theme.components.MuiDataGrid` takes `defaultProps` and `styleOverrides` by those slots:

```tsx
import type {} from '@dna/data-grid/themeAugmentation';

const theme = createTheme({
  components: {
    MuiDataGrid: {
      defaultProps: { density: 'compact' },
      styleOverrides: { columnHeader: { fontWeight: 700 }, cell: ({ theme }) => ({ color: theme.palette.text.secondary }) },
    },
  },
});
```

The `themeAugmentation` import types `MuiDataGrid` in the theme. Leave it out in a project that also imports MUI X's, since both declare the same key.

## State, selectors and custom slots

`apiRef.current.state` holds the grid state, and selectors with MUI X's names read it, such as `gridSortModelSelector`, `gridFilteredSortedRowIdsSelector`, `gridPaginatedVisibleSortedGridRowIdsSelector`, `gridRowSelectionStateSelector` and `gridVisibleColumnFieldsSelector`. Inside a custom slot, `useGridApiContext()` returns the grid's `apiRef`, `useGridSelector(apiRef, selector)` keeps a value up to date, `useGridApiEventHandler(apiRef, event, handler)` listens to an event, and `useGridRootProps()` returns the grid's props.

`subscribeEvent` also reports `stateChange` and the model events MUI X publishes: `sortModelChange`, `filterModelChange`, `paginationModelChange`, `rowSelectionChange`, `columnVisibilityModelChange`, `densityChange`, `columnOrderChange`, `columnWidthChange`, `pinnedColumnsChange`, `rowGroupingModelChange`, `aggregationModelChange`, `detailPanelsExpandedRowIdsChange`, `rowExpansionChange`, `cellFocusIn` and `columnHeaderFocus`.

## Scripts

| Command | Description |
| --- | --- |
| `pnpm build` | Build all packages and apps |
| `pnpm dev` | Watch the library and run the playground |
| `pnpm typecheck` | Type-check every workspace |
| `pnpm test` | Run unit tests |
