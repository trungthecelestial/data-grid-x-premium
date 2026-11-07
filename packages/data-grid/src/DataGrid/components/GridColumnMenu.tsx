import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import FunctionsIcon from '@mui/icons-material/Functions';
import LastPageIcon from '@mui/icons-material/LastPage';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import ViewWeekIcon from '@mui/icons-material/ViewWeek';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import WorkspacesIcon from '@mui/icons-material/Workspaces';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import type { ReactNode } from 'react';
import type {
  GridAggregationFunction,
  GridColDef,
  GridLocaleText,
  GridSortDirection,
  GridValidRowModel,
} from '../DataGrid.types';

export interface GridColumnMenuProps<R extends GridValidRowModel> {
  column: GridColDef<R>;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  localeText: GridLocaleText;
  /** Omit to leave sorting out of the menu. */
  sortDirection?: GridSortDirection;
  onSort?: (direction: GridSortDirection) => void;
  onFilter?: () => void;
  /** Functions offered for the column. Omit or pass an empty list to leave aggregation out of the menu. */
  aggregationFunctions?: readonly GridAggregationFunction[];
  aggregation?: GridAggregationFunction;
  onAggregationChange?: (fn: GridAggregationFunction | undefined) => void;
  grouped?: boolean;
  onToggleGroup?: () => void;
  /** Columns the rows are grouped by, each offered as "Stop grouping by". Used in the grouping column's menu. */
  groupedColumns?: readonly GridColDef<R>[];
  onUngroup?: (field: string) => void;
  onHide?: () => void;
  onManageColumns?: () => void;
  /** Side the column is pinned to. */
  pinned?: 'left' | 'right' | null;
  /** Omit to leave the pin actions out of the menu. */
  onPin?: (side: 'left' | 'right' | null) => void;
}

/** Aggregation functions that make sense for a column type. */
export function getAvailableAggregationFunctions(column: GridColDef<any>): GridAggregationFunction[] {
  switch (column.type) {
    case 'number':
      return ['sum', 'avg', 'min', 'max', 'size'];
    case 'date':
    case 'dateTime':
      return ['min', 'max', 'size'];
    case 'actions':
      return [];
    default:
      return ['size'];
  }
}

export function GridColumnMenu<R extends GridValidRowModel>(props: GridColumnMenuProps<R>) {
  const {
    column,
    anchorEl,
    onClose,
    localeText,
    sortDirection,
    onSort,
    onFilter,
    aggregationFunctions = [],
    aggregation,
    onAggregationChange,
    grouped = false,
    onToggleGroup,
    groupedColumns = [],
    onUngroup,
    onHide,
    onManageColumns,
    pinned = null,
    onPin,
  } = props;

  const name = column.headerName ?? column.field;
  const run = (action: () => void) => () => {
    action();
    onClose();
  };
  const item = (key: string, label: ReactNode, icon: ReactNode, onClick: () => void, selected = false) => (
    <MenuItem key={key} selected={selected} onClick={run(onClick)}>
      <ListItemIcon>{icon}</ListItemIcon>
      <ListItemText>{label}</ListItemText>
    </MenuItem>
  );

  const sections: ReactNode[][] = [];
  if (onSort) {
    sections.push([
      item('sort-asc', localeText.columnMenuSortAsc, <ArrowUpwardIcon fontSize="small" />, () => onSort(sortDirection === 'asc' ? null : 'asc'), sortDirection === 'asc'),
      item('sort-desc', localeText.columnMenuSortDesc, <ArrowDownwardIcon fontSize="small" />, () => onSort(sortDirection === 'desc' ? null : 'desc'), sortDirection === 'desc'),
    ]);
  }
  if (onFilter) {
    sections.push([item('filter', localeText.columnMenuFilter, <FilterAltIcon fontSize="small" />, onFilter)]);
  }
  if (onAggregationChange && aggregationFunctions.length > 0) {
    sections.push([
      <Box
        key="aggregation"
        // The menu moves focus on letter keys, which would steal them from the select.
        onKeyDown={(event) => event.stopPropagation()}
        sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1 }}
      >
        {/* Same width as the other items' icons so the field lines up with their text. */}
        <ListItemIcon sx={{ minWidth: 36, flexShrink: 0 }}>
          <FunctionsIcon fontSize="small" />
        </ListItemIcon>
        <TextField
          select
          size="small"
          fullWidth
          label={localeText.columnMenuAggregation}
          value={aggregation ?? ''}
          onChange={(event) => {
            const value = event.target.value as GridAggregationFunction | '';
            onAggregationChange(value === '' ? undefined : value);
            onClose();
          }}
        >
          <MenuItem value="">
            <em>{localeText.columnMenuAggregationNone}</em>
          </MenuItem>
          {aggregationFunctions.map((fn) => (
            <MenuItem key={fn} value={fn}>
              {localeText.aggregationFunctions[fn]}
            </MenuItem>
          ))}
        </TextField>
      </Box>,
    ]);
  }
  if (onToggleGroup) {
    sections.push([
      item(
        'group',
        grouped ? localeText.columnMenuUngroupBy(name) : localeText.columnMenuGroupBy(name),
        <WorkspacesIcon fontSize="small" />,
        onToggleGroup,
      ),
    ]);
  }
  if (onUngroup && groupedColumns.length > 0) {
    sections.push(
      groupedColumns.map((groupedColumn) =>
        item(
          `ungroup-${groupedColumn.field}`,
          localeText.columnMenuUngroupBy(groupedColumn.headerName ?? groupedColumn.field),
          <WorkspacesIcon fontSize="small" />,
          () => onUngroup(groupedColumn.field),
        ),
      ),
    );
  }
  if (onPin) {
    const pinItems = [
      item('pin-left', localeText.columnMenuPinLeft, <FirstPageIcon fontSize="small" />, () => onPin('left'), pinned === 'left'),
      item('pin-right', localeText.columnMenuPinRight, <LastPageIcon fontSize="small" />, () => onPin('right'), pinned === 'right'),
    ];
    if (pinned) {
      pinItems.push(item('unpin', localeText.columnMenuUnpin, <PushPinOutlinedIcon fontSize="small" />, () => onPin(null)));
    }
    sections.push(pinItems);
  }
  const columnItems: ReactNode[] = [];
  if (onHide) {
    columnItems.push(item('hide', localeText.columnMenuHideColumn, <VisibilityOffIcon fontSize="small" />, onHide));
  }
  if (onManageColumns) {
    columnItems.push(item('manage', localeText.columnMenuManageColumns, <ViewWeekIcon fontSize="small" />, onManageColumns));
  }
  if (columnItems.length > 0) {
    sections.push(columnItems);
  }

  return (
    <Menu
      open={anchorEl !== null}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      slotProps={{ paper: { sx: { minWidth: 240 } }, list: { 'aria-label': `${name} ${localeText.columnMenuLabel}` } }}
    >
      {sections.flatMap((section, index) => (index > 0 ? [<Divider key={`divider-${index}`} />, ...section] : section))}
    </Menu>
  );
}
