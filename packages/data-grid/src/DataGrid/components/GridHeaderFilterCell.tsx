import FilterAltIcon from '@mui/icons-material/FilterAlt';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useState } from 'react';
import type { GridColDef, GridFilterItem, GridLocaleText, GridValidRowModel } from '../DataGrid.types';
import { getColumnFilterOperators, getInitialFilterValue } from '../features/filtering';
import { FilterValueInput } from './GridFilterPanel';

export interface GridHeaderFilterCellProps<R extends GridValidRowModel> {
  column: GridColDef<R>;
  /** The filter item this cell edits, if the column has one. */
  item: GridFilterItem | undefined;
  localeText: GridLocaleText;
  /** Receives the new item, or `null` to remove the column's filter. */
  onChange: (item: GridFilterItem | null) => void;
}

/** The filter id prefix that marks an item as created by a header filter cell. */
export const HEADER_FILTER_ID_PREFIX = 'header-filter-';

const isBlank = (value: unknown) =>
  value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);

export function GridHeaderFilterCell<R extends GridValidRowModel>(props: GridHeaderFilterCellProps<R>) {
  const { column, item, localeText, onChange } = props;
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const operators = getColumnFilterOperators(column);
  const operator = operators.find((candidate) => candidate.value === item?.operator) ?? operators[0];
  if (!operator) {
    return null;
  }
  const name = column.headerName ?? column.field;
  const valueless = operator.requiresFilterValue === false;
  const current: GridFilterItem = item ?? {
    id: `${HEADER_FILTER_ID_PREFIX}${column.field}`,
    field: column.field,
    operator: operator.value,
    value: getInitialFilterValue(operator),
  };

  const change = (next: GridFilterItem) => {
    const nextOperator = operators.find((candidate) => candidate.value === next.operator);
    // A cleared value drops the item, unless the operator needs none or the user picked a non-default operator to keep.
    const droppable = nextOperator?.requiresFilterValue !== false && nextOperator === operators[0];
    onChange(droppable && isBlank(next.value) ? null : next);
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', minWidth: 0, gap: 0.5 }}>
      <IconButton
        size="small"
        aria-label={`${name} ${localeText.headerFilterOperator}`}
        aria-haspopup="menu"
        color={item && (valueless || !isBlank(item.value)) ? 'primary' : 'default'}
        onClick={(event) => setAnchor(event.currentTarget)}
        sx={{ p: 0.25, flexShrink: 0 }}
      >
        <FilterAltIcon sx={{ fontSize: 18 }} />
      </IconButton>
      <Box sx={{ flex: 1, minWidth: 0 }} onKeyDown={(event) => event.stopPropagation()}>
        {valueless ? (
          <Box sx={{ color: 'text.secondary', fontSize: 12, ...ellipsis }}>
            {operator.label ?? localeText.filterOperators[operator.value] ?? operator.value}
          </Box>
        ) : (
          <FilterValueInput
            fullWidth
            variant="filled"
            column={column}
            operator={operator}
            item={current}
            localeText={localeText}
            onChange={(value) => change({ ...current, value })}
          />
        )}
      </Box>
      <Menu open={anchor !== null} anchorEl={anchor} onClose={() => setAnchor(null)}>
        {operators.map((candidate) => (
          <MenuItem
            key={candidate.value}
            selected={candidate.value === operator.value}
            onClick={() => {
              setAnchor(null);
              change({ ...current, operator: candidate.value, value: getInitialFilterValue(candidate) });
            }}
          >
            {candidate.label ?? localeText.filterOperators[candidate.value] ?? candidate.value}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}

const ellipsis = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;
