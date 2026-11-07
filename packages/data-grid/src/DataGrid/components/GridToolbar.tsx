import ClearIcon from '@mui/icons-material/Clear';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FilterListIcon from '@mui/icons-material/FilterList';
import SearchIcon from '@mui/icons-material/Search';
import TableRowsIcon from '@mui/icons-material/TableRows';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import ViewHeadlineIcon from '@mui/icons-material/ViewHeadline';
import ViewStreamIcon from '@mui/icons-material/ViewStream';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Popover from '@mui/material/Popover';
import TextField from '@mui/material/TextField';
import { useState, type MouseEvent } from 'react';
import type { GridDensity, GridToolbarProps, GridValidRowModel } from '../DataGrid.types';
import { countActiveFilters } from '../features/filtering';
import { GridColumnsPanel } from './GridColumnsPanel';
import { GridFilterPanel } from './GridFilterPanel';

type PanelName = 'columns' | 'filters' | 'density' | 'export' | null;

export function GridToolbar<R extends GridValidRowModel = GridValidRowModel>(props: GridToolbarProps<R>) {
  const {
    columns,
    columnVisibilityModel,
    onColumnVisibilityModelChange,
    filterModel,
    onFilterModelChange,
    density,
    onDensityChange,
    localeText,
    exportDataAsCsv,
    exportDataAsExcel,
    print,
    disableColumnSelector,
    disableDensitySelector,
    disableFilterSelector,
    disableQuickFilter,
    disableExport,
  } = props;

  const [panel, setPanel] = useState<PanelName>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const open = (name: Exclude<PanelName, null>) => (event: MouseEvent<HTMLElement>) => {
    setAnchor(event.currentTarget);
    setPanel(name);
  };
  const close = () => setPanel(null);

  const activeFilters = countActiveFilters({ ...filterModel, quickFilterValues: [] });
  const quickValue = (filterModel.quickFilterValues ?? []).join(' ');

  const setQuickFilter = (value: string) =>
    onFilterModelChange({ ...filterModel, quickFilterValues: value.split(' ').filter((part) => part !== '') });

  const densities: { value: GridDensity; label: string; Icon: typeof TableRowsIcon }[] = [
    { value: 'compact', label: localeText.densityCompact, Icon: ViewHeadlineIcon },
    { value: 'standard', label: localeText.densityStandard, Icon: TableRowsIcon },
    { value: 'comfortable', label: localeText.densityComfortable, Icon: ViewStreamIcon },
  ];
  // The button shows the current density's icon, as in MUI X.
  const DensityIcon = densities.find((option) => option.value === density)?.Icon ?? TableRowsIcon;

  const buttonSx = { fontSize: 12, fontWeight: 500, '& .MuiButton-startIcon svg': { fontSize: 16 } };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: '4px 4px 0', mb: 1, flexWrap: 'wrap' }} role="toolbar">
      {!disableColumnSelector && (
        <Button size="small" color="inherit" sx={buttonSx} startIcon={<ViewColumnIcon />} onClick={open('columns')}>
          {localeText.toolbarColumns}
        </Button>
      )}
      {!disableFilterSelector && (
        <Button
          size="small"
          color="inherit"
          sx={buttonSx}
          startIcon={
            <Badge badgeContent={activeFilters} color="primary">
              <FilterListIcon />
            </Badge>
          }
          onClick={open('filters')}
        >
          {localeText.toolbarFilters}
        </Button>
      )}
      {!disableDensitySelector && (
        <Button size="small" color="inherit" sx={buttonSx} startIcon={<DensityIcon />} onClick={open('density')}>
          {localeText.toolbarDensity}
        </Button>
      )}
      {!disableExport && (
        <Button size="small" color="inherit" sx={buttonSx} startIcon={<FileDownloadIcon />} onClick={open('export')}>
          {localeText.toolbarExport}
        </Button>
      )}
      <Box sx={{ flex: 1, order: -1 }} />
      {!disableQuickFilter && (
        <TextField
          size="small"
          variant="filled"
          hiddenLabel
          placeholder={localeText.toolbarQuickFilterPlaceholder}
          value={quickValue}
          sx={{
            order: -2,
            minWidth: 240,
            '& .MuiInputBase-input': { paddingInline: '0px !important' },
            '& .MuiInputBase-root': {
              padding: '2px 12px !important',
              height: '32px',
              '& .MuiSvgIcon-root': { width: '20px !important', height: '20px !important' },
            },
            '& .MuiIconButton-sizeSmall': { padding: '2px !important' },
          }}
          onChange={(event) => setQuickFilter(event.target.value)}
          inputProps={{ 'aria-label': localeText.toolbarQuickFilterPlaceholder }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
            endAdornment: quickValue ? (
              <InputAdornment position="end">
                <IconButton size="small" aria-label={localeText.toolbarQuickFilterClear} onClick={() => setQuickFilter('')}>
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : null,
          }}
        />
      )}

      <Popover
        open={panel === 'columns'}
        anchorEl={anchor}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <GridColumnsPanel
          columns={columns}
          columnVisibilityModel={columnVisibilityModel}
          onColumnVisibilityModelChange={onColumnVisibilityModelChange}
          localeText={localeText}
        />
      </Popover>
      <Popover
        open={panel === 'filters'}
        anchorEl={anchor}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <GridFilterPanel
          columns={columns}
          filterModel={filterModel}
          onFilterModelChange={onFilterModelChange}
          localeText={localeText}
        />
      </Popover>
      <Menu open={panel === 'density'} anchorEl={anchor} onClose={close}>
        {densities.map((option) => (
          <MenuItem
            key={option.value}
            selected={density === option.value}
            onClick={() => {
              onDensityChange(option.value);
              close();
            }}
          >
            <ListItemIcon><option.Icon fontSize="small" /></ListItemIcon>
            <ListItemText>{option.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
      <Menu open={panel === 'export'} anchorEl={anchor} onClose={close}>
        <MenuItem
          onClick={() => {
            exportDataAsCsv();
            close();
          }}
        >
          {localeText.exportCsv}
        </MenuItem>
        {exportDataAsExcel && (
          <MenuItem
            onClick={() => {
              exportDataAsExcel();
              close();
            }}
          >
            {localeText.exportExcel}
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            print();
            close();
          }}
        >
          {localeText.exportPrint}
        </MenuItem>
      </Menu>
    </Box>
  );
}
