import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataGrid, useGridApiRef } from './DataGrid';
import type { GridApi, GridColDef } from './DataGrid.types';

type Person = { id: number; name: string; age: number };

const people: Person[] = Array.from({ length: 12 }, (_, index) => ({ id: index + 1, name: `Person ${index + 1}`, age: 20 + index }));

const columns: GridColDef<Person>[] = [
  { field: 'name', headerName: 'Name' },
  { field: 'age', headerName: 'Age', type: 'number' },
];

const nameCells = () => screen.queryAllByRole('gridcell').filter((cell) => cell.textContent?.startsWith('Person'));

function renderWithApi(props: Partial<React.ComponentProps<typeof DataGrid<Person>>> = {}) {
  const holder: { ref: { current: GridApi } | null } = { ref: null };
  function Harness() {
    const apiRef = useGridApiRef();
    holder.ref = apiRef;
    return <DataGrid rows={people} columns={columns} apiRef={apiRef} {...props} />;
  }
  const view = render(<Harness />);
  return { ...view, api: () => (holder.ref as { current: GridApi }).current };
}

describe('"All" page size', () => {
  it('shows every row when the All option is chosen', async () => {
    render(
      <DataGrid
        rows={people}
        columns={columns}
        pageSizeOptions={[5, 10, { value: -1, label: 'All' }]}
        disableVirtualization
      />,
    );
    expect(nameCells()).toHaveLength(5);

    fireEvent.mouseDown(screen.getByRole('combobox', { name: /rows per page/i }));
    fireEvent.click(await screen.findByRole('option', { name: 'All' }));

    expect(nameCells()).toHaveLength(12);
  });

  it('can start on All and keeps a single page', () => {
    render(
      <DataGrid
        rows={people}
        columns={columns}
        pageSizeOptions={[{ value: -1, label: 'All' }, 5]}
        disableVirtualization
      />,
    );

    expect(nameCells()).toHaveLength(12);
    expect(screen.getByText(/1–12 of 12/)).toBeTruthy();
  });

  it('reports -1 as the page size and works through the api', () => {
    const onPaginationModelChange = vi.fn();
    const { api } = renderWithApi({
      pageSizeOptions: [5, { value: -1, label: 'All' }],
      onPaginationModelChange,
      disableVirtualization: true,
    });

    act(() => api().setPageSize(-1));
    expect(onPaginationModelChange).toHaveBeenLastCalledWith({ page: 0, pageSize: -1 });
    expect(nameCells()).toHaveLength(12);
  });
});

describe('getRowSpacing', () => {
  it('adds space above and below rows and counts it in the row slot', () => {
    const getRowSpacing = vi.fn(({ isFirstVisible, isLastVisible }: { isFirstVisible: boolean; isLastVisible: boolean }) => ({
      top: isFirstVisible ? 0 : 6,
      bottom: isLastVisible ? 0 : 4,
    }));
    render(<DataGrid rows={people.slice(0, 3)} columns={columns} rowHeight={40} getRowSpacing={getRowSpacing} disableVirtualization />);

    const rowOf = (name: string) => screen.getByRole('gridcell', { name }).closest('tr') as HTMLElement;
    const first = getComputedStyle(rowOf('Person 1'));
    const middle = getComputedStyle(rowOf('Person 2'));
    const last = getComputedStyle(rowOf('Person 3'));

    expect([first.height, first.paddingTop, first.paddingBottom]).toEqual(['44px', '0px', '4px']);
    expect([middle.height, middle.paddingTop, middle.paddingBottom]).toEqual(['50px', '6px', '4px']);
    expect([last.height, last.paddingTop, last.paddingBottom]).toEqual(['46px', '6px', '0px']);
    expect(getRowSpacing).toHaveBeenCalledWith(expect.objectContaining({ id: 2, indexRelativeToCurrentPage: 1 }));
  });

  it('leaves rows alone without the prop', () => {
    render(<DataGrid rows={people.slice(0, 2)} columns={columns} rowHeight={40} disableVirtualization />);

    const row = screen.getByRole('gridcell', { name: 'Person 1' }).closest('tr') as HTMLElement;
    expect(getComputedStyle(row).height).toBe('40px');
  });
});

describe('Excel export', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let clicked: HTMLAnchorElement[];

  beforeEach(() => {
    clicked = [];
    createObjectURL = vi.fn(() => 'blob:test');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns the workbook bytes with the chosen fields and rows', () => {
    const { api } = renderWithApi();

    const bytes = api().getDataAsExcel({ fields: ['age', 'name'], getRowsToExport: () => [3, 1], sheetName: 'People' });
    const text = new TextDecoder().decode(bytes);

    // Zip signature, then the sheet in the order that was asked for.
    expect(Array.from(bytes.subarray(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(text).toContain('name="People"');
    const sheet = text.slice(text.indexOf('<worksheet'));
    expect(sheet.indexOf('>Age<')).toBeLessThan(sheet.indexOf('>Name<'));
    expect(sheet.indexOf('Person 3')).toBeLessThan(sheet.indexOf('Person 1'));
    expect(sheet).not.toContain('Person 2');
    expect(sheet).toContain('<c r="A2"><v>22</v></c>');
  });

  it('downloads a .xlsx file', () => {
    const { api } = renderWithApi();

    act(() => api().exportDataAsExcel({ fileName: 'people' }));

    expect(clicked).toHaveLength(1);
    expect(clicked[0]?.download).toBe('people.xlsx');
    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });

  it('is offered by the toolbar export menu and uses excelOptions', async () => {
    render(<DataGrid rows={people} columns={columns} showToolbar excelOptions={{ fileName: 'team' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Download as Excel' }));

    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(clicked[0]?.download).toBe('team.xlsx');
  });

  it('can be hidden from the toolbar', async () => {
    render(<DataGrid rows={people} columns={columns} showToolbar disableExcelExport />);

    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: 'Download as Excel' })).toBeNull();
    expect(within(menu).getByRole('menuitem', { name: 'Download as CSV' })).toBeTruthy();
  });
});
