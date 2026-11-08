import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataGrid, useGridApiRef } from './DataGrid';
import type { GridApi, GridColDef } from './DataGrid.types';

type Item = { id: number; text: string };

const items: Item[] = Array.from({ length: 200 }, (_, index) => ({ id: index + 1, text: `Item ${index + 1}` }));
const columns: GridColDef<Item>[] = [{ field: 'text', headerName: 'Text' }];

const dataRows = () => screen.getAllByRole('row').filter((row) => row.getAttribute('aria-rowindex') && row.querySelector('[role="gridcell"]'));
const bottomSpacer = () =>
  [...document.querySelectorAll<HTMLElement>('tr[role="presentation"]')].at(-1) as HTMLElement;
const scroller = () => document.querySelector<HTMLElement>('.MuiTableContainer-root') as HTMLElement;

let rowHeight = 200;
let observers: { callback: ResizeObserverCallback; observed: Set<Element> }[] = [];

beforeEach(() => {
  rowHeight = 200;
  observers = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      entry: { callback: ResizeObserverCallback; observed: Set<Element> };
      constructor(callback: ResizeObserverCallback) {
        this.entry = { callback, observed: new Set() };
        observers.push(this.entry);
      }
      observe(element: Element) {
        this.entry.observed.add(element);
      }
      unobserve(element: Element) {
        this.entry.observed.delete(element);
      }
      disconnect() {
        this.entry.observed.clear();
      }
    },
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const height = this.getAttribute('role') === 'row' ? rowHeight : 0;
    // Rows end above the bottom edge of the header, as if scrolled out of view.
    const bottom = this.tagName === 'THEAD' ? 0 : -500 + height;
    return { height, top: -500, bottom, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const autoHeight = () => 'auto' as const;

/** Sends the resize observer a new height for every row it watches. */
function resizeObservedRows(height: number) {
  rowHeight = height;
  act(() => {
    for (const { callback, observed } of observers) {
      const entries = [...observed].map((target) => ({ target, borderBoxSize: [{ blockSize: height, inlineSize: 0 }] }));
      if (entries.length > 0) {
        callback(entries as unknown as ResizeObserverEntry[], {} as ResizeObserver);
      }
    }
  });
}

describe("getRowHeight returning 'auto'", () => {
  const grid = (props = {}) => <DataGrid rows={items} columns={columns} pagination={false} getRowHeight={autoHeight} {...props} />;

  it('lets the row size itself and wraps its text', () => {
    render(grid());
    const row = dataRows()[0] as HTMLElement;
    expect(getComputedStyle(row).height).toBe('auto');
    expect(getComputedStyle(row.querySelector('span') as HTMLElement).whiteSpace).toBe('normal');
  });

  it('keeps fixed rows as they were', () => {
    render(<DataGrid rows={items} columns={columns} pagination={false} getRowHeight={() => 90} />);
    expect(getComputedStyle(dataRows()[0] as HTMLElement).height).toBe('90px');
  });

  it('renders fewer rows once it knows they are tall', () => {
    render(grid());
    // A 400px viewport fits 3 rows of 200px, plus the buffer below.
    expect(dataRows().length).toBeLessThan(10);
  });

  it('includes measured heights in the scrollable height', () => {
    render(grid());
    // The first pass renders 11 rows at the 52px estimate. Once measured at 200px only 6 fit, and the 5 rows pushed out keep their measured height.
    expect(dataRows()).toHaveLength(6);
    expect(parseFloat(getComputedStyle(bottomSpacer()).height)).toBe(189 * 52 + 5 * 200);
  });

  it('uses getEstimatedRowHeight for rows not rendered yet', () => {
    render(grid({ getEstimatedRowHeight: () => 150 }));
    expect(parseFloat(getComputedStyle(bottomSpacer()).height)).toBe((items.length - dataRows().length) * 150);
  });

  it('follows later content changes through the resize observer', () => {
    render(grid());
    const tallCount = dataRows().length;
    resizeObservedRows(60);
    expect(dataRows().length).toBeGreaterThan(tallCount);
  });

  it('ignores a height of zero from a hidden grid', () => {
    render(grid());
    const count = dataRows().length;
    resizeObservedRows(0);
    expect(dataRows()).toHaveLength(count);
  });

  it('keeps the view in place when rows above it change height', () => {
    render(grid());
    const element = scroller();
    element.scrollTop = 5000;
    // The mocked rows all end above the viewport, so each newly measured one moves the scroll position by its growth.
    fireEvent.scroll(element);
    expect(element.scrollTop).toBeGreaterThan(5000);
  });

  it('does not change the scroll position at the top', () => {
    render(grid());
    expect(scroller().scrollTop).toBe(0);
  });

  it('forgets measurements through resetRowHeights and measures what is on screen again', () => {
    const holder: { ref: { current: GridApi } | null } = { ref: null };
    function Harness() {
      const apiRef = useGridApiRef();
      holder.ref = apiRef;
      return grid({ apiRef });
    }
    render(<Harness />);
    rowHeight = 300;
    act(() => holder.ref?.current.resetRowHeights());
    expect(dataRows().length).toBeLessThan(8);
  });

  it('renders every column while rows are auto', () => {
    const wide: GridColDef<Item>[] = Array.from({ length: 40 }, (_, index) => ({ field: `c${index}`, headerName: `C${index}`, width: 200 }));
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(600);
    render(<DataGrid rows={items.slice(0, 3)} columns={wide} pagination={false} getRowHeight={autoHeight} />);
    expect(dataRows()[0]?.querySelectorAll('[role="gridcell"]')).toHaveLength(40);
  });

  it('does not merge cells of auto rows under rowSpanning', () => {
    render(<DataGrid rows={[{ id: 1, text: 'same' }, { id: 2, text: 'same' }]} columns={columns} pagination={false} rowSpanning getRowHeight={autoHeight} />);
    expect(screen.getAllByText('same')).toHaveLength(2);
  });

  it('leaves group rows at the default height', () => {
    render(
      <DataGrid
        rows={items.slice(0, 2)}
        columns={columns}
        pagination={false}
        getRowHeight={autoHeight}
        initialState={{ rowGrouping: { model: ['text'] } }}
      />,
    );
    expect(getComputedStyle(dataRows()[0] as HTMLElement).height).toBe('52px');
  });
});
