export interface VirtualRange {
  start: number;
  /** Exclusive. */
  end: number;
  offsetTop: number;
  offsetBottom: number;
}

/** Prefix sums of item heights: `offsets[i]` is the top of item `i` and the last entry is the total height. */
export function getOffsets(heights: readonly number[]): number[] {
  const offsets = new Array<number>(heights.length + 1);
  offsets[0] = 0;
  for (let index = 0; index < heights.length; index += 1) {
    offsets[index + 1] = (offsets[index] ?? 0) + (heights[index] ?? 0);
  }
  return offsets;
}

export function getVirtualRange(
  offsets: readonly number[],
  scrollTop: number,
  viewportHeight: number,
  overscan: number,
): VirtualRange {
  const count = offsets.length - 1;
  const total = offsets[count] ?? 0;
  if (count <= 0) {
    return { start: 0, end: 0, offsetTop: 0, offsetBottom: 0 };
  }

  const findIndex = (position: number) => {
    let low = 0;
    let high = count - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if ((offsets[middle] ?? 0) <= position) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }
    return low;
  };

  const first = findIndex(Math.max(0, scrollTop));
  const last = findIndex(Math.max(0, scrollTop + viewportHeight));
  const start = Math.max(0, first - overscan);
  const end = Math.min(count, last + 1 + overscan);
  const offsetTop = offsets[start] ?? 0;
  const offsetBottom = total - (offsets[end] ?? total);
  return { start, end, offsetTop, offsetBottom };
}
