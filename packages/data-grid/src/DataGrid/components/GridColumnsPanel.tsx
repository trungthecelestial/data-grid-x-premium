import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import type { GridColDef, GridColumnVisibilityModel, GridLocaleText, GridValidRowModel } from '../DataGrid.types';

export interface GridColumnsPanelProps<R extends GridValidRowModel> {
  columns: readonly GridColDef<R>[];
  columnVisibilityModel: GridColumnVisibilityModel;
  onColumnVisibilityModelChange: (model: GridColumnVisibilityModel) => void;
  localeText: GridLocaleText;
}

export function GridColumnsPanel<R extends GridValidRowModel>(props: GridColumnsPanelProps<R>) {
  const { columns, columnVisibilityModel, onColumnVisibilityModelChange, localeText } = props;
  const [search, setSearch] = useState('');

  const hideable = columns.filter((column) => column.hideable !== false);
  const matches = hideable.filter((column) =>
    (column.headerName ?? column.field).toLowerCase().includes(search.trim().toLowerCase()),
  );

  const setAll = (visible: boolean) => {
    const next = { ...columnVisibilityModel };
    for (const column of hideable) {
      next[column.field] = visible;
    }
    onColumnVisibilityModelChange(next);
  };

  return (
    <Box sx={{ p: 2, minWidth: 240, maxHeight: 360, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <TextField
        size="small"
        variant="standard"
        placeholder={localeText.columnsPanelSearch}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        inputProps={{ 'aria-label': localeText.columnsPanelSearch }}
      />
      <Box sx={{ overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {matches.map((column) => (
          <FormControlLabel
            key={column.field}
            label={column.headerName ?? column.field}
            control={
              <Checkbox
                size="small"
                checked={columnVisibilityModel[column.field] !== false}
                onChange={(event) =>
                  onColumnVisibilityModelChange({ ...columnVisibilityModel, [column.field]: event.target.checked })
                }
              />
            }
          />
        ))}
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Button size="small" onClick={() => setAll(true)}>
          {localeText.columnsPanelShowAll}
        </Button>
        <Button size="small" onClick={() => setAll(false)}>
          {localeText.columnsPanelHideAll}
        </Button>
      </Box>
    </Box>
  );
}
