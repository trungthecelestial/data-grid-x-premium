import ClearIcon from '@mui/icons-material/Clear';
import SearchIcon from '@mui/icons-material/Search';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import type { GridColDef, GridColumnVisibilityModel, GridLocaleText, GridValidRowModel } from '../DataGrid.types';

export interface GridColumnsPanelProps<R extends GridValidRowModel> {
  columns: readonly GridColDef<R>[];
  columnVisibilityModel: GridColumnVisibilityModel;
  onColumnVisibilityModelChange: (model: GridColumnVisibilityModel) => void;
  localeText: GridLocaleText;
}

const rowSx = { mx: 0, '& .MuiCheckbox-root': { p: 0.75, mr: 0.75 } } as const;

export function GridColumnsPanel<R extends GridValidRowModel>(props: GridColumnsPanelProps<R>) {
  const { columns, columnVisibilityModel, onColumnVisibilityModelChange, localeText } = props;
  const [search, setSearch] = useState('');
  // Reset goes back to the visibility the panel opened with, as in MUI X.
  const [openedModel] = useState(columnVisibilityModel);

  const hideable = columns.filter((column) => column.hideable !== false);
  const matches = hideable.filter((column) =>
    (column.headerName ?? column.field).toLowerCase().includes(search.trim().toLowerCase()),
  );
  const isVisible = (model: GridColumnVisibilityModel, field: string) => model[field] !== false;
  const visibleCount = hideable.filter((column) => isVisible(columnVisibilityModel, column.field)).length;
  const changed = hideable.some(
    (column) => isVisible(columnVisibilityModel, column.field) !== isVisible(openedModel, column.field),
  );

  const setAll = (visible: boolean) => {
    const next = { ...columnVisibilityModel };
    for (const column of hideable) {
      next[column.field] = visible;
    }
    onColumnVisibilityModelChange(next);
  };

  return (
    <Box sx={{ width: 300, maxHeight: 480, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ px: 1.5, pt: 1.5, pb: 1 }}>
        <TextField
          size="small"
          fullWidth
          placeholder={localeText.columnsPanelSearch}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          slotProps={{
            htmlInput: { 'aria-label': localeText.columnsPanelSearch },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
              endAdornment: search ? (
                <InputAdornment position="end">
                  <IconButton size="small" edge="end" aria-label={localeText.toolbarQuickFilterClear} onClick={() => setSearch('')}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            },
          }}
        />
      </Box>
      <Box sx={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', px: 1.5, pb: 1 }}>
        {matches.map((column) => (
          <FormControlLabel
            key={column.field}
            label={column.headerName ?? column.field}
            sx={rowSx}
            control={
              <Checkbox
                size="small"
                checked={isVisible(columnVisibilityModel, column.field)}
                onChange={(event) =>
                  onColumnVisibilityModelChange({ ...columnVisibilityModel, [column.field]: event.target.checked })
                }
              />
            }
          />
        ))}
      </Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: 1,
          borderColor: 'divider',
          pl: 1.5,
          pr: 1,
          py: 1,
        }}
      >
        <FormControlLabel
          label={localeText.columnsPanelShowHideAll}
          sx={rowSx}
          control={
            <Checkbox
              size="small"
              checked={hideable.length > 0 && visibleCount === hideable.length}
              indeterminate={visibleCount > 0 && visibleCount < hideable.length}
              onChange={() => setAll(visibleCount < hideable.length)}
            />
          }
        />
        <Button size="small" disabled={!changed} onClick={() => onColumnVisibilityModelChange(openedModel)}>
          {localeText.columnsPanelReset}
        </Button>
      </Box>
    </Box>
  );
}
