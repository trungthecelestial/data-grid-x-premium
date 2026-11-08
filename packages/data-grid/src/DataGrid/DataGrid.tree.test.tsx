import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DataGrid } from './DataGrid';
import type { GridRowId } from './DataGrid.types';

type Node = { id: number; path: string[]; kids?: number };

const rows: Node[] = [
  { id: 1, path: ['Docs'] },
  { id: 2, path: ['Docs', 'a.txt'] },
  { id: 3, path: ['Docs', 'b.txt'] },
  { id: 4, path: ['Pics'] },
];

const columns = [{ field: 'id' }];

function Harness({ propagation }: { propagation: { descendants?: boolean; parents?: boolean } }) {
  const [selection, setSelection] = useState<readonly GridRowId[]>([]);
  return (
    <>
      <output data-testid="selection">{[...selection].sort().join(',')}</output>
      <DataGrid
        rows={rows}
        columns={columns}
        treeData
        getTreeDataPath={(row) => row.path}
        defaultGroupingExpansionDepth={-1}
        checkboxSelection
        rowSelectionModel={selection}
        onRowSelectionModelChange={setSelection}
        rowSelectionPropagation={propagation}
        disableVirtualization
      />
    </>
  );
}

const selected = () => screen.getByTestId('selection').textContent;
const checkboxes = () => screen.getAllByRole('checkbox', { name: /select row/i }) as HTMLInputElement[];

describe('row selection propagation', () => {
  it('selects descendants with the parent', () => {
    render(<Harness propagation={{ descendants: true }} />);
    fireEvent.click(checkboxes()[0] as HTMLElement);
    expect(selected()).toBe('1,2,3');
  });

  it('selects the parent once all children are selected and drops it when one is cleared', () => {
    render(<Harness propagation={{ parents: true }} />);
    fireEvent.click(checkboxes()[1] as HTMLElement);
    expect(selected()).toBe('2');
    fireEvent.click(checkboxes()[2] as HTMLElement);
    expect(selected()).toBe('1,2,3');
    fireEvent.click(checkboxes()[1] as HTMLElement);
    expect(selected()).toBe('3');
  });

  it('shows an indeterminate parent when only some descendants are selected', () => {
    render(<Harness propagation={{ descendants: true, parents: true }} />);
    fireEvent.click(checkboxes()[1] as HTMLElement);
    expect(checkboxes()[0]?.indeterminate || checkboxes()[0]?.getAttribute('data-indeterminate') === 'true').toBe(true);
  });

  it('does not propagate by default', () => {
    function Plain() {
      const [selection, setSelection] = useState<readonly GridRowId[]>([]);
      return (
        <>
          <output data-testid="selection">{[...selection].join(',')}</output>
          <DataGrid
            rows={rows}
            columns={columns}
            treeData
            getTreeDataPath={(row) => row.path}
            defaultGroupingExpansionDepth={-1}
            checkboxSelection
            rowSelectionModel={selection}
            onRowSelectionModelChange={setSelection}
            disableVirtualization
          />
        </>
      );
    }
    render(<Plain />);
    fireEvent.click(checkboxes()[0] as HTMLElement);
    expect(selected()).toBe('1');
  });
});

describe('lazy tree children', () => {
  it('shows an expander for a row with missing children and fetches them once', async () => {
    const onFetchChildren = vi.fn(async () => undefined);
    const lazyRows: Node[] = [{ id: 1, path: ['Docs'], kids: 2 }];
    render(
      <DataGrid
        rows={lazyRows}
        columns={columns}
        treeData
        getTreeDataPath={(row) => row.path}
        getChildrenCount={(row) => row.kids ?? 0}
        onFetchChildren={onFetchChildren}
        disableVirtualization
      />,
    );

    const toggle = screen.getByRole('button', { name: 'Expand or collapse' });
    expect(onFetchChildren).not.toHaveBeenCalled();
    fireEvent.click(toggle);
    await waitFor(() => expect(onFetchChildren).toHaveBeenCalledTimes(1));
    expect(onFetchChildren).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));

    // Collapsing and expanding again does not fetch twice.
    fireEvent.click(screen.getByRole('button', { name: 'Expand or collapse' }));
    fireEvent.click(screen.getByRole('button', { name: 'Expand or collapse' }));
    expect(onFetchChildren).toHaveBeenCalledTimes(1);
  });

  it('shows the loaded children once the rows arrive', async () => {
    function Lazy() {
      const [data, setData] = useState<Node[]>([{ id: 1, path: ['Docs'], kids: 1 }]);
      return (
        <DataGrid
          rows={data}
          columns={columns}
          treeData
          getTreeDataPath={(row) => row.path}
          getChildrenCount={(row) => row.kids ?? 0}
          onFetchChildren={async () => setData((previous) => [...previous, { id: 2, path: ['Docs', 'a.txt'] }])}
          disableVirtualization
        />
      );
    }
    render(<Lazy />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand or collapse' }));
    await waitFor(() => expect(screen.getByText('a.txt')).toBeTruthy());
  });
});

describe('onStateChange', () => {
  it('reports changes but not the initial state', () => {
    const onStateChange = vi.fn();
    render(
      <DataGrid
        rows={rows}
        columns={[{ field: 'id', headerName: 'ID' }]}
        onStateChange={onStateChange}
        disableVirtualization
      />,
    );
    expect(onStateChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('columnheader', { name: /ID/ }));
    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange.mock.calls[0]?.[0].sorting.sortModel).toEqual([{ field: 'id', sort: 'asc' }]);
  });
});
