import type { DataGridProps, GridRowId, GridValidRowModel } from './DataGrid.types';

export function DataGrid<R extends GridValidRowModel = GridValidRowModel>(props: DataGridProps<R>) {
  const { rows, columns, getRowId = (row: R): GridRowId => row.id } = props;

  return (
    <div role="grid" aria-rowcount={rows.length + 1} aria-colcount={columns.length}>
      <div role="row">
        {columns.map((column) => (
          <div key={column.field} role="columnheader" style={{ width: column.width }}>
            {column.headerName ?? column.field}
          </div>
        ))}
      </div>
      {rows.map((row) => (
        <div key={getRowId(row)} role="row">
          {columns.map((column) => (
            <div key={column.field} role="gridcell" style={{ width: column.width }}>
              {String(column.valueGetter ? column.valueGetter(row) : (row[column.field] ?? ''))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
