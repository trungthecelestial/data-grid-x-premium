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

Filters run on the source rows before pivoting, and sorting runs on the generated rows. Every subtotal and total is calculated from the source rows. Pivoting needs client-side rows, so it is unavailable with `dataSource` or a server mode.

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

## Scripts

| Command | Description |
| --- | --- |
| `pnpm build` | Build all packages and apps |
| `pnpm dev` | Watch the library and run the playground |
| `pnpm typecheck` | Type-check every workspace |
| `pnpm test` | Run unit tests |
