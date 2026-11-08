import { DataGrid, GRID_AGGREGATION_FUNCTIONS, useGridApiRef, type GridAggregationFunctionDef, type GridColDef, type GridDataSource } from '@dna/data-grid';
import { dnaTheme } from '@dna/dna-ui';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CssBaseline from '@mui/material/CssBaseline';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { ThemeProvider } from '@mui/material/styles';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';

interface Employee {
  id: number;
  name: string;
  team: string;
  role: string;
  age: number;
  salary: number;
  remote: boolean;
  joined: Date;
}

const TEAMS = ['Platform', 'Design', 'Data', 'Growth'];
const ROLES = ['Engineer', 'Designer', 'Analyst', 'Manager'];
const NAMES = ['Ada', 'Alan', 'Grace', 'Linus', 'Margaret', 'Dennis', 'Barbara', 'Ken', 'Radia', 'Tim'];

const employees: Employee[] = Array.from({ length: 1000 }, (_, index) => ({
  id: index + 1,
  name: `${NAMES[index % NAMES.length]} ${String.fromCharCode(65 + (index % 26))}.`,
  team: TEAMS[index % TEAMS.length] as string,
  role: ROLES[(index * 7) % ROLES.length] as string,
  age: 22 + ((index * 13) % 40),
  salary: 50000 + ((index * 7919) % 70000),
  remote: index % 3 === 0,
  joined: new Date(2015 + (index % 10), index % 12, 1 + (index % 27)),
}));

const currency = (value: number) => `$${value.toLocaleString()}`;

const columns: GridColDef<Employee>[] = [
  { field: 'id', headerName: 'ID', width: 80, type: 'number', editable: false },
  { field: 'name', headerName: 'Name', flex: 1, minWidth: 140, editable: true },
  { field: 'team', headerName: 'Team', width: 130, type: 'singleSelect', valueOptions: TEAMS, editable: true },
  { field: 'role', headerName: 'Role', width: 130, type: 'singleSelect', valueOptions: ROLES, editable: true },
  { field: 'age', headerName: 'Age', width: 90, type: 'number', editable: true },
  { field: 'salary', headerName: 'Salary', width: 130, type: 'number', valueFormatter: currency, editable: true },
  { field: 'remote', headerName: 'Remote', width: 100, type: 'boolean', editable: true },
  { field: 'joined', headerName: 'Joined', width: 140, type: 'date', editable: true },
];

function Overview() {
  const apiRef = useGridApiRef();
  return (
    <>
      <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
        <Button size="small" variant="outlined" onClick={() => apiRef.current.exportDataAsCsv({ fileName: 'employees' })}>
          Export CSV via apiRef
        </Button>
      </Box>
      <DataGrid
        apiRef={apiRef}
        rows={employees}
        columns={columns}
        showToolbar
        checkboxSelection
        headerFilters
        height={520}
        pageSizeOptions={[25, 50, 100, { value: -1, label: 'All' }]}
        initialState={{
          pinnedColumns: { left: ['name'] },
          sorting: { sortModel: [{ field: 'salary', sort: 'desc' }] },
          pagination: { paginationModel: { page: 0, pageSize: 25 } },
          aggregation: { model: { salary: 'avg', age: 'max' } },
        }}
        columnGroupingModel={[
          { groupId: 'person', headerName: 'Person', children: [{ field: 'name' }, { field: 'age' }] },
          { groupId: 'work', headerName: 'Work', children: [{ field: 'team' }, { field: 'role' }, { field: 'salary' }] },
        ]}
      />
    </>
  );
}

function Virtualized() {
  return (
    <DataGrid
      rows={employees}
      columns={columns}
      pagination={false}
      height={520}
      showToolbar
      density="compact"
    />
  );
}

const wideColumns: GridColDef<Record<string, number>>[] = Array.from({ length: 60 }, (_, index) => ({
  field: `col${index}`,
  headerName: `Column ${index + 1}`,
  type: 'number',
  width: 120,
}));
const wideRows = Array.from({ length: 200 }, (_, row) => ({
  id: row + 1,
  ...Object.fromEntries(wideColumns.map((column, index) => [column.field, row * 100 + index])),
}));

function WideColumns() {
  return <DataGrid rows={wideRows} columns={wideColumns} pagination={false} height={420} headerFilters initialState={{ pinnedColumns: { left: ['col0'] } }} />;
}

const reorderRows = employees.slice(0, 12);

function RowReordering() {
  return (
    <>
      <Typography variant="body2" sx={{ mb: 1 }}>
        Drag a handle, or press Alt+Arrow on it. Sorting and filtering switch reordering off.
      </Typography>
      <DataGrid
        rows={reorderRows}
        columns={columns.slice(0, 4)}
        rowReordering
        onRowOrderChange={({ row, targetIndex }) => console.log('moved', row.name, 'to', targetIndex)}
        pagination={false}
        height={520}
      />
    </>
  );
}

const cellRows = employees.slice(0, 15);

function CellSelection() {
  return (
    <>
      <Typography variant="body2" sx={{ mb: 1 }}>
        Drag, Shift+click or Shift+Arrow to select a range, Ctrl/Cmd+click to toggle a cell. Ctrl/Cmd+C copies it, Ctrl/Cmd+V pastes tab separated text into editable cells.
      </Typography>
      <DataGrid rows={cellRows} columns={columns} cellSelection pagination={false} height={520} />
    </>
  );
}

const fileRows = [
  { id: 1, path: ['src'], size: 0 },
  { id: 2, path: ['src', 'index.ts'], size: 1200 },
  { id: 3, path: ['src', 'components'], size: 0 },
  { id: 4, path: ['src', 'components', 'Grid.tsx'], size: 5400 },
  { id: 5, path: ['src', 'components', 'Toolbar.tsx'], size: 2100 },
  { id: 6, path: ['docs', 'README.md'], size: 800 },
];

function TreeData() {
  return (
    <DataGrid
      rows={fileRows}
      columns={[{ field: 'size', headerName: 'Size (bytes)', type: 'number', flex: 1 }]}
      treeData
      getTreeDataPath={(row) => row.path}
      groupingColDef={{ headerName: 'Files', width: 280 }}
      defaultGroupingExpansionDepth={-1}
      pagination={false}
      height={320}
    />
  );
}

function RowGrouping() {
  return (
    <DataGrid
      rows={employees.slice(0, 200)}
      columns={columns}
      initialState={{ rowGrouping: { model: ['team', 'role'] }, aggregation: { model: { salary: 'avg', age: 'max' } } }}
      defaultGroupingExpansionDepth={1}
      pagination={false}
      height={480}
      showToolbar
    />
  );
}

function MasterDetail() {
  return (
    <DataGrid
      rows={employees.slice(0, 30)}
      columns={columns}
      getDetailPanelContent={({ row }) => (
        <Box sx={{ p: 2 }}>
          <Typography variant="subtitle2">{row.name}</Typography>
          <Typography variant="body2">
            {row.role} on {row.team}, joined {row.joined.toLocaleDateString()}, earns {currency(row.salary)}.
          </Typography>
        </Box>
      )}
      getDetailPanelHeight={() => 90}
      pinnedRows={{ top: [{ ...employees[0], id: -1, name: 'Pinned top' } as Employee] }}
      pagination={false}
      height={480}
    />
  );
}

const aggregationFunctions: Record<string, GridAggregationFunctionDef> = {
  ...GRID_AGGREGATION_FUNCTIONS,
  median: {
    label: 'Median',
    columnTypes: ['number'],
    apply: ({ values }) => {
      const sorted = values.filter((value) => value != null).sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)] ?? null;
    },
  },
};

function Pivoting() {
  return (
    <>
      <Typography variant="body2" sx={{ mb: 1 }}>
        Open Pivot in the toolbar to change the table. Filters apply to the source rows, and Median is a custom aggregation function.
      </Typography>
      <DataGrid
        rows={employees}
        columns={columns}
        aggregationFunctions={aggregationFunctions}
        showToolbar
        pagination={false}
        height={520}
        defaultGroupingExpansionDepth={-1}
        initialState={{
          pivoting: {
            enabled: true,
            model: {
              rows: [{ field: 'team' }, { field: 'role' }],
              columns: [{ field: 'remote' }],
              values: [
                { field: 'salary', aggFunc: 'median' },
                { field: 'age', aggFunc: 'avg' },
              ],
            },
          },
        }}
      />
    </>
  );
}

const SENTENCE = 'Measured row heights let long text wrap instead of being cut off, however wide the column is. ';
const notes = employees.map((employee, index) => ({ id: employee.id, name: employee.name, note: SENTENCE.repeat(1 + (index % 6)) }));

function AutoRowHeight() {
  return (
    <>
      <Typography variant="body2" sx={{ mb: 1 }}>
        Each row takes the height of its content. Resize the Note column, or scroll up from the bottom: the view holds still.
      </Typography>
      <DataGrid
        rows={notes}
        columns={[
          { field: 'name', headerName: 'Name', width: 160 },
          { field: 'note', headerName: 'Note', flex: 1, minWidth: 240 },
        ]}
        getRowHeight={() => 'auto'}
        getEstimatedRowHeight={() => 90}
        pagination={false}
        height={520}
      />
    </>
  );
}

type ServerRow = Partial<Omit<Employee, 'id'>> & { id: number | string; groupKey?: string; childCount?: number };

/** Stands in for a backend: it sorts, groups and sums on its side and answers after a delay. */
const fakeServer: GridDataSource<ServerRow> = {
  getGroupKey: (row) => row.groupKey ?? '',
  getChildrenCount: (row) => row.childCount ?? 0,
  getAggregatedValue: (row, field) => row[field as keyof Employee],
  updateRow: async ({ updatedRow }) => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return updatedRow;
  },
  getRows: async ({ sortModel, groupKeys, groupFields, start, end }) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    const inPath = employees.filter((row) => groupKeys.every((key, level) => String(row[groupFields[level] as keyof Employee]) === key));
    const sum = (rows: Employee[]) => rows.reduce((total, row) => total + row.salary, 0);
    const aggregateRow = { id: 'totals', salary: sum(employees) };
    const field = groupFields[groupKeys.length] as keyof Employee | undefined;
    if (field) {
      const keys = [...new Set(inPath.map((row) => String(row[field])))].sort();
      const groups = keys.map((key) => {
        const rows = inPath.filter((row) => String(row[field]) === key);
        return { id: [...groupKeys, key].join('/'), groupKey: key, childCount: groupKeys.length + 1 < groupFields.length ? new Set(rows.map((row) => row[groupFields[groupKeys.length + 1] as keyof Employee])).size : rows.length, salary: sum(rows) };
      });
      return { rows: groups, rowCount: groups.length, aggregateRow };
    }
    const sort = sortModel[0];
    const sorted = sort?.sort
      ? [...inPath].sort((a, b) => (String(a[sort.field as keyof Employee]) < String(b[sort.field as keyof Employee]) ? -1 : 1) * (sort.sort === 'desc' ? -1 : 1))
      : inPath;
    return { rows: groupKeys.length > 0 ? sorted : sorted.slice(start, end + 1), rowCount: sorted.length, aggregateRow };
  },
};

function ServerSide() {
  const [lazy, setLazy] = useState(false);
  const serverColumns = columns as unknown as GridColDef<ServerRow>[];
  return (
    <>
      <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Typography variant="body2">Every request takes 400ms. Group by a column from its menu, or switch to lazy loading and scroll.</Typography>
        <Button size="small" variant="outlined" onClick={() => setLazy((value) => !value)}>
          {lazy ? 'Use pages' : 'Use lazy loading'}
        </Button>
      </Box>
      <DataGrid
        key={String(lazy)}
        rows={[]}
        columns={serverColumns}
        dataSource={fakeServer}
        lazyLoading={lazy}
        showToolbar
        height={520}
        pageSizeOptions={[25, 50]}
        initialState={lazy ? { aggregation: { model: { salary: 'sum' } } } : { rowGrouping: { model: ['team', 'role'] }, aggregation: { model: { salary: 'sum' } } }}
      />
    </>
  );
}

const TABS = [
  { label: 'Overview', element: <Overview /> },
  { label: 'Server-side', element: <ServerSide /> },
  { label: 'Pivoting', element: <Pivoting /> },
  { label: 'Auto row height', element: <AutoRowHeight /> },
  { label: 'Virtualized (1000 rows)', element: <Virtualized /> },
  { label: 'Wide (60 columns)', element: <WideColumns /> },
  { label: 'Row reordering', element: <RowReordering /> },
  { label: 'Cell selection', element: <CellSelection /> },
  { label: 'Tree data', element: <TreeData /> },
  { label: 'Row grouping', element: <RowGrouping /> },
  { label: 'Master-detail', element: <MasterDetail /> },
];

function App() {
  const [tab, setTab] = useState(0);
  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto', p: 3 }}>
      <Typography variant="h5" component="h1" gutterBottom>
        DNA Data Grid
      </Typography>
      <Tabs value={tab} onChange={(_, value: number) => setTab(value)} variant="scrollable" sx={{ mb: 2 }}>
        {TABS.map((item) => (
          <Tab key={item.label} label={item.label} />
        ))}
      </Tabs>
      {TABS[tab]?.element}
    </Box>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={dnaTheme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>,
);
