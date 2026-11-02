import { DataGrid, type GridColDef } from '@dna/data-grid';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const columns: GridColDef[] = [
  { field: 'id', headerName: 'ID', width: 80 },
  { field: 'name', headerName: 'Name', width: 160 },
  { field: 'age', headerName: 'Age', width: 80 },
];

const rows = [
  { id: 1, name: 'Ada Lovelace', age: 36 },
  { id: 2, name: 'Alan Turing', age: 41 },
];

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DataGrid rows={rows} columns={columns} />
  </StrictMode>,
);
