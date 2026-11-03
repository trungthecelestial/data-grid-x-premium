import type { SxProps, Theme } from '@mui/material/styles';

export type GridRowId = string | number;

export type GridValidRowModel = { [key: string]: any };

export interface GridColDef<R extends GridValidRowModel = GridValidRowModel> {
  /** Key of the row field this column displays. */
  field: string;
  headerName?: string;
  /** Column width in px. Ignored when `flex` is set. Defaults to 100. */
  width?: number;
  /** Share of the remaining space this column takes. */
  flex?: number;
  minWidth?: number;
  align?: 'left' | 'center' | 'right';
  valueGetter?: (row: R) => unknown;
}

export interface DataGridProps<R extends GridValidRowModel = GridValidRowModel> {
  rows: readonly R[];
  columns: readonly GridColDef<R>[];
  /** Returns the unique id of a row. Defaults to `row.id`. */
  getRowId?: (row: R) => GridRowId;
  /** Page sizes offered in the footer. Defaults to `[10, 25, 50]`. */
  pageSizeOptions?: readonly number[];
  /** Hides the pagination footer and shows every row. */
  hideFooter?: boolean;
  sx?: SxProps<Theme>;
}
