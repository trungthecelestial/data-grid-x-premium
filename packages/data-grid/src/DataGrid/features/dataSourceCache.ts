import type { GridDataSourceCache, GridDataSourceGetRowsParams, GridDataSourceGetRowsResult } from '../DataGrid.types';

const DEFAULT_TTL = 5 * 60 * 1000;

/** Keeps responses in memory for `ttl` milliseconds, five minutes by default. */
export class GridDataSourceCacheDefault implements GridDataSourceCache {
  private readonly ttl: number;

  private readonly entries = new Map<string, { response: GridDataSourceGetRowsResult<any>; expiry: number }>();

  constructor(options: { ttl?: number } = {}) {
    this.ttl = options.ttl ?? DEFAULT_TTL;
  }

  get(params: GridDataSourceGetRowsParams) {
    const key = JSON.stringify(params);
    const entry = this.entries.get(key);
    if (entry && entry.expiry <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry?.response;
  }

  set(params: GridDataSourceGetRowsParams, response: GridDataSourceGetRowsResult<any>) {
    this.entries.set(JSON.stringify(params), { response, expiry: Date.now() + this.ttl });
  }

  clear() {
    this.entries.clear();
  }
}
