/**
 * Opt-in theme typing, as `@mui/x-data-grid/themeAugmentation` does. Import it once in a project that themes the grid:
 *
 *   import type {} from '@dna/data-grid/themeAugmentation';
 *
 * Then `createTheme({ components: { MuiDataGrid: { defaultProps, styleOverrides } } })` type-checks.
 * Leave it out in a project that also uses MUI X's augmentation, since both declare `MuiDataGrid`.
 */
import type { ComponentsOverrides, ComponentsVariants } from '@mui/material/styles';
import type { DataGridProps } from './DataGrid/DataGrid.types';
import type { GridClassKey } from './DataGrid/gridClasses';

declare module '@mui/material/styles' {
  interface ComponentsPropsList {
    MuiDataGrid: Partial<DataGridProps<any>>;
  }
  interface ComponentNameToClassKey {
    MuiDataGrid: GridClassKey;
  }
  interface Components<Theme = unknown> {
    MuiDataGrid?: {
      defaultProps?: ComponentsPropsList['MuiDataGrid'];
      styleOverrides?: ComponentsOverrides<Theme>['MuiDataGrid'];
      variants?: ComponentsVariants<Theme>['MuiDataGrid'];
    };
  }
}

export {};
