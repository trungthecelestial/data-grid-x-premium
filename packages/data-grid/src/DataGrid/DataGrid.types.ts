export type GridRowId = string | number;

export type GridValidRowModel = { [key: string]: any };

export interface GridColDef<R extends GridValidRowModel = GridValidRowModel> {
  /** Key of the row field this column displays. */
  field: string;
  headerName?: string;
  width?: number;
  valueGetter?: (row: R) => unknown;
}

export interface DataGridProps<R extends GridValidRowModel = GridValidRowModel> {
  rows: readonly R[];
  columns: readonly GridColDef<R>[];
  /** Returns the unique id of a row. Defaults to `row.id`. */
  getRowId?: (row: R) => GridRowId;
}
