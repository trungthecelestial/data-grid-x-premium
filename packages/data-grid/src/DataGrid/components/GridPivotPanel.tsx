import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import CloseIcon from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { GridColDef, GridPivotModel, GridPivotPanelSlotProps, GridValidRowModel } from '../DataGrid.types';

type Zone = keyof GridPivotModel;

function moveItem<T>(items: readonly T[], index: number, step: number): T[] {
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(index + step, 0, item as T);
  return next;
}

export function GridPivotPanel<R extends GridValidRowModel = GridValidRowModel>(props: GridPivotPanelSlotProps<R>) {
  const { columns, active, onActiveChange, model, onModelChange, getAvailableFunctions, getFunctionLabel, localeText } = props;

  const pivotable = columns.filter((column) => column.pivotable !== false && column.type !== 'actions');
  const nameOf = (column: GridColDef<R>) => column.headerName ?? column.field;
  const columnOf = (field: string) => columns.find((column) => column.field === field);

  // A field splits the table along one axis only, and shows once among the values.
  const isOfferedFor = (zone: Zone, column: GridColDef<R>) => {
    const used = (list: readonly { field: string }[]) => list.some((item) => item.field === column.field);
    return zone === 'values'
      ? !used(model.values) && getAvailableFunctions(column).length > 0
      : !used(model.rows) && !used(model.columns);
  };

  const addField = (zone: Zone, field: string) => {
    const column = columnOf(field);
    if (!column) {
      return;
    }
    if (zone === 'values') {
      const aggFunc = getAvailableFunctions(column)[0];
      if (aggFunc) {
        onModelChange({ ...model, values: [...model.values, { field, aggFunc }] });
      }
    } else {
      onModelChange({ ...model, [zone]: [...model[zone], { field }] });
    }
  };

  const renderZone = (zone: Zone, title: string) => {
    const items = model[zone];
    const offered = pivotable.filter((column) => isOfferedFor(zone, column));
    const replaceItems = (next: readonly { field: string }[]) => onModelChange({ ...model, [zone]: next });
    return (
      <Box component="section" aria-label={title} sx={{ mt: 2 }}>
        <Typography variant="subtitle2" component="h3" sx={{ mb: 0.5 }}>
          {title}
        </Typography>
        {items.map((item, index) => {
          const column = columnOf(item.field);
          const name = column ? nameOf(column) : item.field;
          return (
            <Box key={item.field} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minHeight: 40 }}>
              <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
                {name}
              </Typography>
              {zone === 'values' && column && (
                <TextField
                  select
                  size="small"
                  variant="standard"
                  value={model.values[index]?.aggFunc ?? ''}
                  onChange={(event) =>
                    onModelChange({
                      ...model,
                      values: model.values.map((value, position) => (position === index ? { ...value, aggFunc: event.target.value } : value)),
                    })
                  }
                  slotProps={{ htmlInput: { 'aria-label': `${name} ${localeText.columnMenuAggregation}` } }}
                  sx={{ minWidth: 88 }}
                >
                  {getAvailableFunctions(column).map((fn) => (
                    <MenuItem key={fn} value={fn}>
                      {getFunctionLabel(fn)}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              <IconButton size="small" disabled={index === 0} aria-label={`${localeText.pivotMoveUp} ${name}`} onClick={() => replaceItems(moveItem(items, index, -1))}>
                <ArrowUpwardIcon fontSize="inherit" />
              </IconButton>
              <IconButton
                size="small"
                disabled={index === items.length - 1}
                aria-label={`${localeText.pivotMoveDown} ${name}`}
                onClick={() => replaceItems(moveItem(items, index, 1))}
              >
                <ArrowDownwardIcon fontSize="inherit" />
              </IconButton>
              <IconButton
                size="small"
                aria-label={`${localeText.pivotRemove} ${name}`}
                onClick={() => replaceItems(items.filter((_, position) => position !== index))}
              >
                <CloseIcon fontSize="inherit" />
              </IconButton>
            </Box>
          );
        })}
        <TextField
          select
          fullWidth
          size="small"
          label={localeText.pivotAddField}
          value=""
          disabled={offered.length === 0}
          onChange={(event) => addField(zone, event.target.value)}
          slotProps={{ htmlInput: { 'aria-label': `${title} ${localeText.pivotAddField}` } }}
          sx={{ mt: 0.5 }}
        >
          {offered.map((column) => (
            <MenuItem key={column.field} value={column.field}>
              {nameOf(column)}
            </MenuItem>
          ))}
        </TextField>
      </Box>
    );
  };

  return (
    <Box sx={{ p: 2, width: 320, maxHeight: 560, overflow: 'auto' }}>
      <FormControlLabel
        control={<Switch size="small" checked={active} onChange={(event) => onActiveChange(event.target.checked)} />}
        label={localeText.pivotPanelActive}
      />
      {renderZone('rows', localeText.pivotRows)}
      {renderZone('columns', localeText.pivotColumns)}
      {renderZone('values', localeText.pivotValues)}
    </Box>
  );
}
