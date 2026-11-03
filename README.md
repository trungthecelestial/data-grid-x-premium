# DNA Data Grid

A React data grid inspired by the features, structure and usage of [MUI X Data Grid](https://mui.com/x/react-data-grid/).

## Layout

| Path | Description |
| --- | --- |
| `packages/data-grid` | `@dna/data-grid`, the grid library |
| `packages/typescript-config` | Shared `tsconfig` presets |
| `apps/playground` | Vite app for trying the grid during development |

## Getting started

Requires Node 22.23.4+ and pnpm 10 (`npm i -g pnpm`, or `corepack enable` on Node 22-24).

```bash
pnpm install
pnpm dev
```

## Scripts

| Command | Description |
| --- | --- |
| `pnpm build` | Build all packages and apps |
| `pnpm dev` | Watch the library and run the playground |
| `pnpm typecheck` | Type-check every workspace |
| `pnpm test` | Run unit tests |
