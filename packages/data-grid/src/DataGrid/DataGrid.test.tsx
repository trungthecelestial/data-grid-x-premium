import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DataGrid } from './DataGrid';
import type { GridColDef, GridFilterModel, GridRowSelectionModel, GridSortModel } from './DataGrid.types';

type Person = { id: number; name: string; age: number; team: string; active: boolean };

const people: Person[] = [
  { id: 1, name: 'Ada', age: 36, team: 'red', active: true },
  { id: 2, name: 'Alan', age: 41, team: 'blue', active: false },
  { id: 3, name: 'Grace', age: 30, team: 'red', active: true },
  { id: 4, name: 'Linus', age: 25, team: 'blue', active: false },
];

const columns: GridColDef<Person>[] = [
  { field: 'name', headerName: 'Name', editable: true },
  { field: 'age', headerName: 'Age', type: 'number', editable: true },
  { field: 'team', headerName: 'Team' },
  { field: 'active', headerName: 'Active', type: 'boolean' },
];

const bodyNames = () =>
  screen
    .getAllByRole('row', { hidden: true })
    .slice(1)
    .map((row) => within(row).queryAllByRole('gridcell', { hidden: true })[0]?.textContent)
    .filter(Boolean);

describe('DataGrid', () => {
  it('renders headers and rows', () => {
    render(<DataGrid rows={people} columns={columns} />);

    expect(screen.getByRole('columnheader', { name: 'Name', hidden: true })).toBeTruthy();
    expect(screen.getByRole('gridcell', { name: 'Ada' })).toBeTruthy();
    expect(screen.getByRole('grid').getAttribute('aria-colcount')).toBe('4');
  });

  it('shows the empty state', () => {
    render(<DataGrid rows={[]} columns={columns} />);
    expect(screen.getByText('No rows')).toBeTruthy();
  });

  it('sorts on header click and reports the model', () => {
    const onChange = vi.fn();
    render(<DataGrid rows={people} columns={columns} onSortModelChange={onChange} />);

    fireEvent.click(screen.getByRole('columnheader', { name: 'Age' }));
    expect(bodyNames()).toEqual(['Linus', 'Grace', 'Ada', 'Alan']);
    expect(onChange).toHaveBeenLastCalledWith([{ field: 'age', sort: 'asc' }]);
    expect(screen.getByRole('columnheader', { name: 'Age' }).getAttribute('aria-sort')).toBe('ascending');

    fireEvent.click(screen.getByRole('columnheader', { name: 'Age' }));
    expect(bodyNames()).toEqual(['Alan', 'Ada', 'Grace', 'Linus']);

    fireEvent.click(screen.getByRole('columnheader', { name: 'Age' }));
    expect(bodyNames()).toEqual(['Ada', 'Alan', 'Grace', 'Linus']);
  });

  it('follows a controlled sort model', () => {
    const Controlled = () => {
      const [model, setModel] = useState<GridSortModel>([{ field: 'name', sort: 'desc' }]);
      return <DataGrid rows={people} columns={columns} sortModel={model} onSortModelChange={setModel} />;
    };
    render(<Controlled />);

    expect(bodyNames()).toEqual(['Linus', 'Grace', 'Alan', 'Ada']);
    fireEvent.click(screen.getByRole('columnheader', { name: 'Name' }));
    expect(bodyNames()).toEqual(['Ada', 'Alan', 'Grace', 'Linus']);
  });

  it('paginates and changes page', () => {
    render(<DataGrid rows={people} columns={columns} pageSizeOptions={[2, 4]} />);

    expect(bodyNames()).toEqual(['Ada', 'Alan']);
    fireEvent.click(screen.getByRole('button', { name: /next page/i }));
    expect(bodyNames()).toEqual(['Grace', 'Linus']);
  });

  it('applies a controlled filter model', () => {
    const filterModel: GridFilterModel = { items: [{ field: 'team', operator: 'equals', value: 'red' }] };
    render(<DataGrid rows={people} columns={columns} filterModel={filterModel} />);
    expect(bodyNames()).toEqual(['Ada', 'Grace']);
  });

  it('filters through the toolbar quick filter', () => {
    render(<DataGrid rows={people} columns={columns} showToolbar />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search keywords' }), { target: { value: 'linus' } });
    expect(bodyNames()).toEqual(['Linus']);
  });

  it('builds a filter from the filter panel', async () => {
    render(<DataGrid rows={people} columns={columns} showToolbar />);

    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add filter' }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Value' }), { target: { value: 'gra' } });

    expect(bodyNames()).toEqual(['Grace']);
  });

  it('hides columns from the columns panel', async () => {
    render(<DataGrid rows={people} columns={columns} showToolbar />);

    fireEvent.click(screen.getByRole('button', { name: /columns/i }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Team' }));

    await waitFor(() => expect(screen.queryByRole('columnheader', { name: 'Team', hidden: true })).toBeNull());
    expect(screen.getByRole('columnheader', { name: 'Name', hidden: true })).toBeTruthy();
  });

  it('respects a column visibility model', () => {
    render(<DataGrid rows={people} columns={columns} columnVisibilityModel={{ age: false }} />);
    expect(screen.queryByRole('columnheader', { name: 'Age' })).toBeNull();
  });

  it('selects rows with checkboxes, select all and the footer count', () => {
    const onChange = vi.fn();
    render(<DataGrid rows={people} columns={columns} checkboxSelection onRowSelectionModelChange={onChange} />);

    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Select row' })[1] as HTMLElement);
    expect(onChange).toHaveBeenLastCalledWith([2]);
    expect(screen.getByText('1 row selected')).toBeTruthy();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all rows' }));
    expect(onChange).toHaveBeenLastCalledWith([1, 2, 3, 4]);
    expect(screen.getByText('4 rows selected')).toBeTruthy();
  });

  it('selects a row on click and extends with ctrl and shift', () => {
    const Controlled = () => {
      const [model, setModel] = useState<GridRowSelectionModel>([]);
      return (
        <>
          <span data-testid="selection">{model.join(',')}</span>
          <DataGrid rows={people} columns={columns} rowSelectionModel={model} onRowSelectionModelChange={setModel} />
        </>
      );
    };
    render(<Controlled />);

    fireEvent.click(screen.getByRole('gridcell', { name: 'Ada' }));
    expect(screen.getByTestId('selection').textContent).toBe('1');
    fireEvent.click(screen.getByRole('gridcell', { name: 'Grace' }), { ctrlKey: true });
    expect(screen.getByTestId('selection').textContent).toBe('1,3');
    fireEvent.click(screen.getByRole('gridcell', { name: 'Linus' }), { shiftKey: true });
    expect(screen.getByTestId('selection').textContent).toBe('3,4');
  });

  it('does not select rows when rowSelection is off', () => {
    const onChange = vi.fn();
    render(<DataGrid rows={people} columns={columns} rowSelection={false} onRowSelectionModelChange={onChange} />);
    fireEvent.click(screen.getByRole('gridcell', { name: 'Ada' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('edits a cell and commits through processRowUpdate', async () => {
    const processRowUpdate = vi.fn((row: Person) => row);
    render(<DataGrid rows={people} columns={columns} processRowUpdate={processRowUpdate} />);

    fireEvent.doubleClick(screen.getByRole('gridcell', { name: 'Ada' }));
    const input = screen.getByRole('textbox', { name: 'Name' });
    fireEvent.change(input, { target: { value: 'Ada L.' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(screen.getByRole('gridcell', { name: 'Ada L.' })).toBeTruthy());
    expect(processRowUpdate).toHaveBeenCalledWith({ ...people[0], name: 'Ada L.' }, people[0]);
  });

  it('discards a cell edit on Escape', () => {
    render(<DataGrid rows={people} columns={columns} />);

    fireEvent.doubleClick(screen.getByRole('gridcell', { name: 'Ada' }));
    const input = screen.getByRole('textbox', { name: 'Name' });
    fireEvent.change(input, { target: { value: 'Nope' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.getByRole('gridcell', { name: 'Ada' })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
  });

  it('keeps editing and reports the error when the update is rejected', async () => {
    const onError = vi.fn();
    render(
      <DataGrid
        rows={people}
        columns={columns}
        processRowUpdate={() => {
          throw new Error('nope');
        }}
        onProcessRowUpdateError={onError}
      />,
    );

    fireEvent.doubleClick(screen.getByRole('gridcell', { name: 'Ada' }));
    const input = screen.getByRole('textbox', { name: 'Name' });
    fireEvent.change(input, { target: { value: 'Bad' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeTruthy();
  });

  it('edits every editable cell of a row in row edit mode', async () => {
    const processRowUpdate = vi.fn((row: Person) => row);
    render(<DataGrid rows={people} columns={columns} editMode="row" processRowUpdate={processRowUpdate} />);

    fireEvent.doubleClick(screen.getByRole('gridcell', { name: 'Ada' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Ada L.' } });
    const age = screen.getByRole('spinbutton', { name: 'Age' });
    fireEvent.change(age, { target: { value: '37' } });
    fireEvent.keyDown(age, { key: 'Enter' });

    await waitFor(() => expect(processRowUpdate).toHaveBeenCalled());
    expect(processRowUpdate).toHaveBeenCalledWith({ ...people[0], name: 'Ada L.', age: 37 }, people[0]);
  });

  it('moves focus with the keyboard and starts editing on Enter', () => {
    render(<DataGrid rows={people} columns={columns} />);

    const first = screen.getByRole('gridcell', { name: 'Ada' });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('gridcell', { name: 'Alan' }));

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Enter' });
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeTruthy();
  });

  it('virtualizes rows', () => {
    const many = Array.from({ length: 500 }, (_, index) => ({ id: index, name: `Row ${index}` }));
    render(<DataGrid rows={many} columns={[{ field: 'name' }]} pagination={false} height={200} rowBufferCount={1} />);

    const rendered = screen.getAllByRole('row').length;
    expect(rendered).toBeLessThan(20);
    expect(screen.getByRole('gridcell', { name: 'Row 0' })).toBeTruthy();
    expect(screen.queryByRole('gridcell', { name: 'Row 300' })).toBeNull();
  });

  it('renders every row when virtualization is disabled', () => {
    const many = Array.from({ length: 60 }, (_, index) => ({ id: index, name: `Row ${index}` }));
    render(<DataGrid rows={many} columns={[{ field: 'name' }]} pagination={false} disableVirtualization />);
    expect(screen.getByRole('gridcell', { name: 'Row 59' })).toBeTruthy();
  });

  it('renders column groups above the headers', () => {
    render(
      <DataGrid
        rows={people}
        columns={columns}
        columnGroupingModel={[{ groupId: 'who', headerName: 'Who', children: [{ field: 'name' }, { field: 'age' }] }]}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Who' }).getAttribute('aria-colspan')).toBe('2');
  });

  it('pins rows above and below', () => {
    render(
      <DataGrid
        rows={people}
        columns={columns}
        pinnedRows={{ top: [{ id: 100, name: 'Top', age: 1, team: 'x', active: true }], bottom: [{ id: 101, name: 'Bottom', age: 2, team: 'x', active: true }] }}
      />,
    );
    expect(screen.getByRole('gridcell', { name: 'Top' })).toBeTruthy();
    expect(screen.getByRole('gridcell', { name: 'Bottom' })).toBeTruthy();
  });

  it('shows an aggregation footer', () => {
    render(<DataGrid rows={people} columns={columns} aggregationModel={{ age: 'sum' }} />);
    expect(screen.getByText('132')).toBeTruthy();
    expect(screen.getByText('sum')).toBeTruthy();
  });

  it('expands and collapses tree data', () => {
    const rows = [
      { id: 1, path: ['Docs'] },
      { id: 2, path: ['Docs', 'a.txt'] },
      { id: 3, path: ['Docs', 'b.txt'] },
    ];
    render(<DataGrid rows={rows} columns={[{ field: 'id' }]} treeData getTreeDataPath={(row) => row.path} />);

    expect(screen.getByText('Docs')).toBeTruthy();
    expect(screen.queryByText('a.txt')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Expand or collapse' }));
    expect(screen.getByText('a.txt')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Expand or collapse' })[0] as HTMLElement);
    expect(screen.queryByText('a.txt')).toBeNull();
  });

  it('expands tree data by default depth', () => {
    const rows = [
      { id: 1, path: ['Docs'] },
      { id: 2, path: ['Docs', 'a.txt'] },
    ];
    render(
      <DataGrid
        rows={rows}
        columns={[{ field: 'id' }]}
        treeData
        getTreeDataPath={(row) => row.path}
        defaultGroupingExpansionDepth={-1}
      />,
    );
    expect(screen.getByText('a.txt')).toBeTruthy();
  });

  it('groups rows by a column with counts and aggregation', () => {
    render(
      <DataGrid
        rows={people}
        columns={columns}
        rowGroupingModel={['team']}
        aggregationModel={{ age: 'max' }}
        defaultGroupingExpansionDepth={1}
      />,
    );

    expect(screen.getByText('red (2)')).toBeTruthy();
    expect(screen.getByText('blue (2)')).toBeTruthy();
    expect(screen.getByText('36 (max)')).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Team' })).toBeNull();
    expect(screen.getByRole('gridcell', { name: 'Ada' })).toBeTruthy();
  });

  it('opens a master-detail panel', () => {
    render(
      <DataGrid
        rows={people}
        columns={columns}
        getDetailPanelContent={({ row }) => <div>Details for {row.name}</div>}
      />,
    );

    expect(screen.queryByText('Details for Ada')).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Toggle detail panel' })[0] as HTMLElement);
    expect(screen.getByText('Details for Ada')).toBeTruthy();
  });

  it('changes density from the toolbar', async () => {
    render(<DataGrid rows={people} columns={columns} showToolbar />);

    fireEvent.click(screen.getByRole('button', { name: /density/i }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Compact' }));
    const row = screen.getByRole('gridcell', { name: 'Ada' }).closest('tr') as HTMLElement;
    await waitFor(() => expect(getComputedStyle(row).height).toBe('36px'));
  });

  it('exposes CSV export through apiRef-free toolbar and the api', () => {
    const apiRef = { current: {} as import('./DataGrid.types').GridApi };
    render(<DataGrid rows={people} columns={columns} apiRef={apiRef} columnVisibilityModel={{ team: false }} />);

    expect(apiRef.current.getDataAsCsv()).toBe('Name,Age,Active\r\nAda,36,true\r\nAlan,41,false\r\nGrace,30,true\r\nLinus,25,false');
  });

  it('shows the loading indicator and custom locale text', () => {
    render(<DataGrid rows={[]} columns={columns} loading localeText={{ noRowsLabel: 'Nothing here' }} />);
    expect(screen.getByRole('progressbar')).toBeTruthy();
    expect(screen.queryByText('Nothing here')).toBeNull();
  });

  it('uses server pagination row count', () => {
    render(
      <DataGrid
        rows={people.slice(0, 2)}
        columns={columns}
        paginationMode="server"
        rowCount={40}
        paginationModel={{ page: 0, pageSize: 10 }}
      />,
    );
    expect(screen.getByText('1–10 of 40')).toBeTruthy();
    expect(bodyNames()).toEqual(['Ada', 'Alan']);
  });
});
