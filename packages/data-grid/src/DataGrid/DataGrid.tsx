import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import { useState } from 'react';
import type { DataGridProps, GridColDef, GridRowId, GridValidRowModel } from './DataGrid.types';

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
const DEFAULT_COLUMN_WIDTH = 100;

// The DNA theme lays table parts out with flexbox, so header and body cells must share the same flex sizing to line up.
function getColumnSx(column: GridColDef<any>) {
  if (column.flex) {
    return { flex: `${column.flex} 1 0px`, minWidth: column.minWidth ?? 50 };
  }
  const width = column.width ?? DEFAULT_COLUMN_WIDTH;
  return { flex: `0 0 ${width}px`, minWidth: column.minWidth ?? width };
}

const tableSx = {
  display: 'block',
  width: '100%',
  '& .MuiTableHead-root, & .MuiTableBody-root': { display: 'block', padding: 0 },
  '& .MuiTableRow-root': { width: '100%' },
};

export function DataGrid<R extends GridValidRowModel = GridValidRowModel>(props: DataGridProps<R>) {
  const {
    rows,
    columns,
    getRowId = (row: R): GridRowId => row.id,
    pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
    hideFooter = false,
    sx,
  } = props;

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(pageSizeOptions[0] ?? DEFAULT_PAGE_SIZE_OPTIONS[0]);

  const visibleRows = hideFooter ? rows : rows.slice(page * pageSize, page * pageSize + pageSize);

  return (
    <Paper variant="outlined" sx={sx}>
      <TableContainer>
        <Table aria-rowcount={rows.length + 1} aria-colcount={columns.length} sx={tableSx}>
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell key={column.field} align={column.align} sx={getColumnSx(column)}>
                  {column.headerName ?? column.field}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleRows.map((row) => (
              <TableRow key={getRowId(row)} hover>
                {columns.map((column) => (
                  <TableCell key={column.field} align={column.align} sx={getColumnSx(column)}>
                    {String(column.valueGetter ? column.valueGetter(row) : (row[column.field] ?? ''))}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} align="center" sx={{ flex: 1, justifyContent: "center" }}>
                  No rows
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {!hideFooter && (
        <TablePagination
          component="div"
          count={rows.length}
          page={page}
          rowsPerPage={pageSize}
          rowsPerPageOptions={[...pageSizeOptions]}
          onPageChange={(_, nextPage) => setPage(nextPage)}
          onRowsPerPageChange={(event) => {
            setPageSize(Number(event.target.value));
            setPage(0);
          }}
        />
      )}
    </Paper>
  );
}
