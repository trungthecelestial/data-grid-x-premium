import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import { useRef } from 'react';
import type {
  GridColDef,
  GridFilterItem,
  GridFilterModel,
  GridFilterOperator,
  GridLocaleText,
  GridValidRowModel,
} from '../DataGrid.types';
import { getValueOptions } from '../features/columns';
import { getColumnFilterOperators, getInitialFilterValue, isFilterable } from '../features/filtering';

export interface GridFilterPanelProps<R extends GridValidRowModel> {
  columns: readonly GridColDef<R>[];
  filterModel: GridFilterModel;
  onFilterModelChange: (model: GridFilterModel) => void;
  localeText: GridLocaleText;
}

export interface ValueInputProps<R extends GridValidRowModel> {
  column: GridColDef<R>;
  operator: GridFilterOperator<R> | undefined;
  item: GridFilterItem;
  localeText: GridLocaleText;
  onChange: (value: unknown) => void;
  /** Fills the width of the parent instead of the panel's fixed 140px. */
  fullWidth?: boolean;
  /** Defaults to `standard`. The header filter row uses `filled`, like the toolbar's quick filter. */
  variant?: 'standard' | 'filled';
}

// Same compact filled field as the toolbar's quick filter: 32px tall with 12px side padding.
// A text field carries the root styles on a child, while a select is the input root itself, so both selectors are needed.
const getFilledSx = (width: number | string) => ({
  width,
  '&.MuiInputBase-root, & .MuiInputBase-root': { height: 32 },
  '& .MuiSvgIcon-root': { width: 20, height: 20 },
  '& .MuiSelect-icon': { right: 8, top: 'calc(50% - 10px)' },
  '& .MuiInputBase-input': { py: 0, px: '12px', height: '32px', boxSizing: 'border-box' },
  '&& .MuiSelect-select': { display: 'flex', alignItems: 'center', height: '32px', minHeight: 0, py: 0, pl: '12px', pr: '32px', boxSizing: 'border-box' },
});

export function FilterValueInput<R extends GridValidRowModel>(props: ValueInputProps<R>) {
  const { column, operator, item, localeText, onChange, fullWidth, variant = 'standard' } = props;
  const label = localeText.filterPanelValue;
  const width = fullWidth ? '100%' : 140;
  const filled = variant === 'filled';
  const fieldSx = filled ? getFilledSx(width) : { width };

  if (!operator || operator.requiresFilterValue === false) {
    return <Box sx={fieldSx} />;
  }

  if (operator.inputType === 'multi' && column.type === 'singleSelect') {
    return (
      <Select
        multiple
        size="small"
        variant={variant}
        sx={fieldSx}
        value={Array.isArray(item.value) ? item.value : []}
        onChange={(event) => onChange(event.target.value)}
        inputProps={{ 'aria-label': label }}
      >
        {getValueOptions(column).map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
    );
  }

  if (operator.inputType === 'multi') {
    return (
      <TextField
        size="small"
        variant={variant}
        hiddenLabel={filled}
        sx={fieldSx}
        placeholder="a, b, c"
        value={Array.isArray(item.value) ? item.value.join(', ') : ''}
        onChange={(event) =>
          onChange(
            event.target.value
              .split(',')
              .map((part) => part.trim())
              .filter(Boolean),
          )
        }
        inputProps={{ 'aria-label': label }}
      />
    );
  }

  if (operator.inputType === 'singleSelect' || operator.inputType === 'boolean') {
    const options =
      operator.inputType === 'boolean'
        ? [
            { value: 'true', label: localeText.booleanTrue },
            { value: 'false', label: localeText.booleanFalse },
          ]
        : getValueOptions(column);
    return (
      <Select
        size="small"
        variant={variant}
        displayEmpty
        sx={fieldSx}
        value={item.value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        inputProps={{ 'aria-label': label }}
      >
        <MenuItem value="">&nbsp;</MenuItem>
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
    );
  }

  return (
    <TextField
      size="small"
      variant={variant}
      hiddenLabel={filled}
      sx={fieldSx}
      type={operator.inputType ?? 'text'}
      value={item.value ?? ''}
      onChange={(event) => onChange(event.target.value)}
      inputProps={{ 'aria-label': label }}
      InputLabelProps={{ shrink: true }}
    />
  );
}

export function GridFilterPanel<R extends GridValidRowModel>(props: GridFilterPanelProps<R>) {
  const { columns, filterModel, onFilterModelChange, localeText } = props;
  const nextId = useRef(0);

  const filterable = columns.filter(isFilterable);
  const logicOperator = filterModel.logicOperator ?? 'and';

  const updateItems = (items: GridFilterItem[]) => onFilterModelChange({ ...filterModel, items });

  const addItem = () => {
    const column = filterable[0];
    if (!column) {
      return;
    }
    const operator = getColumnFilterOperators(column)[0];
    nextId.current += 1;
    updateItems([
      ...filterModel.items,
      {
        id: `filter-${Date.now()}-${nextId.current}`,
        field: column.field,
        operator: operator?.value ?? 'contains',
        value: getInitialFilterValue(operator),
      },
    ]);
  };

  const changeItem = (index: number, patch: Partial<GridFilterItem>) =>
    updateItems(filterModel.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));

  const operatorLabel = (operator: GridFilterOperator<R>) =>
    operator.label ?? localeText.filterOperators[operator.value] ?? operator.value;

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {filterModel.items.length === 0 && <Box sx={{ color: 'text.secondary' }}>{localeText.filterPanelNoFilters}</Box>}
      {filterModel.items.map((item, index) => {
        const column = filterable.find((candidate) => candidate.field === item.field) ?? filterable[0];
        const operators = column ? getColumnFilterOperators(column) : [];
        const operator = operators.find((candidate) => candidate.value === item.operator) ?? operators[0];
        return (
          <Box key={item.id ?? index} sx={{ display: 'flex', alignItems: 'flex-end', gap: 1.5 }}>
            <IconButton
              size="small"
              aria-label="Delete filter"
              onClick={() => updateItems(filterModel.items.filter((_, itemIndex) => itemIndex !== index))}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
            {index === 0 ? (
              <Box sx={{ width: 64 }} />
            ) : index === 1 ? (
              <Select
                size="small"
                variant="standard"
                sx={{ width: 64 }}
                value={logicOperator}
                onChange={(event) =>
                  onFilterModelChange({ ...filterModel, logicOperator: event.target.value as 'and' | 'or' })
                }
                inputProps={{ 'aria-label': 'Logic operator' }}
              >
                <MenuItem value="and">{localeText.filterPanelLogicAnd}</MenuItem>
                <MenuItem value="or">{localeText.filterPanelLogicOr}</MenuItem>
              </Select>
            ) : (
              <Box sx={{ width: 64, pb: 0.5 }}>{logicOperator === 'and' ? localeText.filterPanelLogicAnd : localeText.filterPanelLogicOr}</Box>
            )}
            <Select
              size="small"
              variant="standard"
              sx={{ width: 140 }}
              value={column?.field ?? ''}
              onChange={(event) => {
                const nextColumn = filterable.find((candidate) => candidate.field === event.target.value);
                const nextOperator = nextColumn ? getColumnFilterOperators(nextColumn)[0] : undefined;
                changeItem(index, {
                  field: String(event.target.value),
                  operator: nextOperator?.value ?? item.operator,
                  value: getInitialFilterValue(nextOperator),
                });
              }}
              inputProps={{ 'aria-label': localeText.filterPanelColumns }}
            >
              {filterable.map((candidate) => (
                <MenuItem key={candidate.field} value={candidate.field}>
                  {candidate.headerName ?? candidate.field}
                </MenuItem>
              ))}
            </Select>
            <Select
              size="small"
              variant="standard"
              sx={{ width: 140 }}
              value={operator?.value ?? ''}
              onChange={(event) => {
                const nextOperator = operators.find((candidate) => candidate.value === event.target.value);
                changeItem(index, { operator: String(event.target.value), value: getInitialFilterValue(nextOperator) });
              }}
              inputProps={{ 'aria-label': localeText.filterPanelOperator }}
            >
              {operators.map((candidate) => (
                <MenuItem key={candidate.value} value={candidate.value}>
                  {operatorLabel(candidate)}
                </MenuItem>
              ))}
            </Select>
            {column && (
              <FilterValueInput
                column={column}
                operator={operator}
                item={item}
                localeText={localeText}
                onChange={(value) => changeItem(index, { value })}
              />
            )}
          </Box>
        );
      })}
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Button size="small" startIcon={<AddIcon />} onClick={addItem}>
          {localeText.filterPanelAddFilter}
        </Button>
        {filterModel.items.length > 0 && (
          <Button size="small" onClick={() => updateItems([])}>
            {localeText.filterPanelRemoveAll}
          </Button>
        )}
      </Box>
    </Box>
  );
}
