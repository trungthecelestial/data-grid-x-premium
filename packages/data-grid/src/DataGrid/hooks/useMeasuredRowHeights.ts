import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { GridRowId } from '../DataGrid.types';

type RowRef = (element: HTMLElement | null) => void;
type Sample = { id: GridRowId; height: number; element: HTMLElement };

const NO_HEIGHTS: ReadonlyMap<GridRowId, number> = new Map();
/** Sub-pixel differences between layout passes must not cause another render. */
const HEIGHT_TOLERANCE = 0.5;

/**
 * Tracks the rendered height of rows whose height comes from their content.
 * Heights stay cached after a row scrolls away, so the scrollbar does not change when it comes back.
 *
 * @param getSlotHeight Height the grid currently reserves for a row, or `undefined` for rows outside the scrolling rows, such as pinned rows.
 * @param onScrollTopAdjusted Called after the scroll position was moved to make up for rows above the viewport changing height.
 */
export function useMeasuredRowHeights(
  scrollerRef: RefObject<HTMLElement | null>,
  getSlotHeight: RefObject<(id: GridRowId) => number | undefined>,
  onScrollTopAdjusted: (scrollTop: number) => void,
) {
  const [heights, setHeights] = useState(NO_HEIGHTS);
  const elementsRef = useRef(new Map<GridRowId, HTMLElement>());
  const idsRef = useRef(new WeakMap<Element, GridRowId>());
  const rowRefsRef = useRef(new Map<GridRowId, RowRef>());
  const observerRef = useRef<ResizeObserver | null>(null);
  const pendingScrollRef = useRef(0);

  const record = useCallback(
    (samples: readonly Sample[]) => {
      const scroller = scrollerRef.current;
      const canScrollUp = Boolean(scroller && scroller.scrollTop > 0);
      const header = canScrollUp ? scroller?.querySelector('thead') : null;
      const viewportTop = canScrollUp ? (header ?? scroller)?.getBoundingClientRect()[header ? 'bottom' : 'top'] ?? 0 : 0;

      const changes: Sample[] = [];
      for (const sample of samples) {
        const previous = getSlotHeight.current?.(sample.id);
        // A height of zero means the grid is hidden and says nothing about the row.
        if (sample.height > 0 && previous !== undefined && Math.abs(sample.height - previous) >= HEIGHT_TOLERANCE) {
          changes.push(sample);
          if (canScrollUp && sample.element.getBoundingClientRect().bottom <= viewportTop) {
            pendingScrollRef.current += sample.height - previous;
          }
        }
      }
      if (changes.length > 0) {
        setHeights((current) => {
          const next = new Map(current);
          changes.forEach(({ id, height }) => next.set(id, height));
          return next;
        });
      }
    },
    [scrollerRef, getSlotHeight],
  );

  // Rows above the viewport changed size, so the content moves by the same amount and what the user is looking at stays put.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller && pendingScrollRef.current !== 0) {
      scroller.scrollTop += pendingScrollRef.current;
      pendingScrollRef.current = 0;
      onScrollTopAdjusted(scroller.scrollTop);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heights]);

  // Catches size changes that do not come from a render of the grid, such as an image finishing loading.
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver((entries) => {
      record(
        entries.flatMap((entry) => {
          const id = idsRef.current.get(entry.target);
          const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height;
          return id === undefined ? [] : [{ id, height, element: entry.target as HTMLElement }];
        }),
      );
    });
    observerRef.current = observer;
    elementsRef.current.forEach((element) => observer.observe(element));
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [record]);

  /** A ref for the row element. It is stable while the row is mounted, so renders do not re-observe the row. */
  const getRowRef = useCallback((id: GridRowId): RowRef => {
    const existing = rowRefsRef.current.get(id);
    if (existing) {
      return existing;
    }
    const rowRef: RowRef = (element) => {
      const previous = elementsRef.current.get(id);
      if (previous) {
        observerRef.current?.unobserve(previous);
        elementsRef.current.delete(id);
      }
      if (element) {
        elementsRef.current.set(id, element);
        idsRef.current.set(element, id);
        observerRef.current?.observe(element);
      } else {
        rowRefsRef.current.delete(id);
      }
    };
    rowRefsRef.current.set(id, rowRef);
    return rowRef;
  }, []);

  /** Measures every mounted row. Call it from a layout effect so new rows are in place before the browser paints. */
  const measureRows = useCallback(() => {
    const samples: Sample[] = [];
    elementsRef.current.forEach((element, id) => samples.push({ id, height: element.getBoundingClientRect().height, element }));
    record(samples);
  }, [record]);

  const resetHeights = useCallback(() => setHeights(NO_HEIGHTS), []);

  return { measuredHeights: heights, getRowRef, measureRows, resetHeights };
}
