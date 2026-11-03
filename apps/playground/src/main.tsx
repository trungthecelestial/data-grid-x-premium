import { DataGrid, type GridColDef } from '@dna/data-grid';
import { dnaTheme } from '@dna/dna-ui';
import CssBaseline from '@mui/material/CssBaseline';
import Typography from '@mui/material/Typography';
import { ThemeProvider } from '@mui/material/styles';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const columns: GridColDef[] = [
  { field: 'id', headerName: 'ID', width: 90 },
  { field: 'firstName', headerName: 'First name', flex: 1, minWidth: 130 },
  { field: 'lastName', headerName: 'Last name', flex: 1, minWidth: 130 },
  { field: 'age', headerName: 'Age', width: 90, align: 'right' },
  {
    field: 'fullName',
    headerName: 'Full name',
    flex: 1.5,
    minWidth: 160,
    valueGetter: (row) => `${row.firstName ?? ''} ${row.lastName ?? ''}`,
  },
];

const rows = [
  { id: 1, lastName: 'Snow', firstName: 'Jon', age: 14 },
  { id: 2, lastName: 'Lannister', firstName: 'Cersei', age: 31 },
  { id: 3, lastName: 'Lannister', firstName: 'Jaime', age: 31 },
  { id: 4, lastName: 'Stark', firstName: 'Arya', age: 11 },
  { id: 5, lastName: 'Targaryen', firstName: 'Daenerys', age: 22 },
  { id: 6, lastName: 'Melisandre', firstName: null, age: 150 },
  { id: 7, lastName: 'Clifford', firstName: 'Ferrara', age: 44 },
  { id: 8, lastName: 'Frances', firstName: 'Rossini', age: 36 },
  { id: 9, lastName: 'Roxie', firstName: 'Harvey', age: 65 },
];

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={dnaTheme}>
      <CssBaseline />
      <div style={{ maxWidth: 960, margin: '24px auto', padding: '0 24px' }}>
        <Typography variant="h5" component="h1" gutterBottom>
          DNA Data Grid
        </Typography>
        <DataGrid rows={rows} columns={columns} pageSizeOptions={[5, 10]} />
      </div>
    </ThemeProvider>
  </StrictMode>,
);
