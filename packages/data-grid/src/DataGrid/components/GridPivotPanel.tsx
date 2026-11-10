import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import CloseIcon from '@mui/icons-material/Close';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useRef, useState, type DragEvent } from 'react';
import type { GridColDef, GridPivotModel, GridPivotPanelSlotProps, GridValidRowModel } from '../DataGrid.types';

type Zone = keyof GridPivotModel;
/** Where a dragged field comes from or goes to. `fields` is the list of unused fields. */
type DropArea = Zone | 'fields';

const DRAG_TYPE = 'application/x-dna-pivot-field';

/**
 * The model after moving `field` from one area to another, before the item at `index` (or at the end).
 * A field sits on one axis only, so going to rows or columns takes it off the other. Dropping on the field list removes it.
 */
export function movePivotField(
  model: GridPivotModel,
  field: string,
  from: DropArea,
  to: DropArea,
  index: number | null,
  defaultAggFunc: string | undefined,
): GridPivotModel {
  const insert = <T,>(items: readonly T[], item: T, at: number | null) => {
    const next = [...items];
    next.splice(at === null ? next.length : Math.max(0, Math.min(next.length, at)), 0, item);
    return next;
  };
  const position = (items: readonly { field: string }[]) => items.findIndex((item) => item.field === field);
  // Moving down within one list counts positions without the moved item.
  const adjust = (items: readonly { field: string }[]) =>
    index !== null && from === to && position(items) !== -1 && position(items) < index ? index - 1 : index;

  if (to === 'values') {
    const existing = model.values.find((item) => item.field === field);
    const aggFunc = existing?.aggFunc ?? defaultAggFunc;
    if (!aggFunc) {
      return model;
    }
    const at = adjust(model.values);
    const values = insert(model.values.filter((item) => item.field !== field), { field, aggFunc }, at);
    return {
      ...model,
      values,
      rows: from === 'rows' ? model.rows.filter((item) => item.field !== field) : model.rows,
      columns: from === 'columns' ? model.columns.filter((item) => item.field !== field) : model.columns,
    };
  }
  if (to === 'fields') {
    return from === 'fields' ? model : { ...model, [from]: model[from].filter((item) => item.field !== field) };
  }
  const previous = model.columns.find((item) => item.field === field);
  const at = adjust(model[to]);
  const rows = model.rows.filter((item) => item.field !== field);
  const columns = model.columns.filter((item) => item.field !== field);
  const values = from === 'values' ? model.values.filter((item) => item.field !== field) : model.values;
  return to === 'rows'
    ? { rows: insert(rows, { field }, at), columns, values }
    : { rows, columns: insert(columns, previous ?? { field }, at), values };
}

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
  const dragRef = useRef<{ field: string; from: DropArea } | null>(null);
  const [dropArea, setDropArea] = useState<DropArea | null>(null);

  const startDrag = (field: string, from: DropArea) => (event: DragEvent) => {
    dragRef.current = { field, from };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(DRAG_TYPE, field);
  };
  const endDrag = () => {
    dragRef.current = null;
    setDropArea(null);
  };
  const dropTargetProps = (area: DropArea, index: number | null) => ({
    onDragOver: (event: DragEvent) => {
      if (!dragRef.current) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDropArea(area);
    },
    onDrop: (event: DragEvent) => {
      const drag = dragRef.current;
      if (!drag) {
        return;
      }
      event.preventDefault();
      // An item inside a zone handles its drop, so the zone around it does not append the field as well.
      event.stopPropagation();
      const column = columnOf(drag.field);
      if (column) {
        const next = movePivotField(model, drag.field, drag.from, area, index, getAvailableFunctions(column)[0]);
        if (next !== model) {
          onModelChange(next);
        }
      }
      endDrag();
    },
  });

  const used = new Set([...model.rows, ...model.columns, ...model.values].map((item) => item.field));
  const unusedFields = pivotable.filter((column) => !used.has(column.field));

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
      <Box
        component="section"
        aria-label={title}
        {...dropTargetProps(zone, null)}
        onDragLeave={() => setDropArea((current) => (current === zone ? null : current))}
        sx={{
          mt: 2,
          p: 0.5,
          mx: -0.5,
          borderRadius: 1,
          outline: dropArea === zone ? '2px dashed' : '2px dashed transparent',
          outlineColor: dropArea === zone ? 'primary.main' : 'transparent',
        }}
      >
        <Typography variant="subtitle2" component="h3" sx={{ mb: 0.5 }}>
          {title}
        </Typography>
        {items.map((item, index) => {
          const column = columnOf(item.field);
          const name = column ? nameOf(column) : item.field;
          return (
            <Box
              key={item.field}
              draggable
              onDragStart={startDrag(item.field, zone)}
              onDragEnd={endDrag}
              {...dropTargetProps(zone, index)}
              data-pivot-item={item.field}
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minHeight: 40, cursor: 'grab' }}
            >
              <DragIndicatorIcon fontSize="small" sx={{ color: 'text.secondary', flexShrink: 0 }} />
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
      <Box
        component="section"
        aria-label={localeText.pivotFields}
        {...dropTargetProps('fields', null)}
        sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5, minHeight: 32, p: 0.5, mx: -0.5, borderRadius: 1, bgcolor: dropArea === 'fields' ? 'action.hover' : undefined }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ width: '100%' }}>
          {localeText.pivotFields}
        </Typography>
        {unusedFields.map((column) => (
          <Chip
            key={column.field}
            size="small"
            variant="outlined"
            label={nameOf(column)}
            draggable
            data-pivot-field={column.field}
            onDragStart={startDrag(column.field, 'fields')}
            onDragEnd={endDrag}
            sx={{ cursor: 'grab' }}
          />
        ))}
      </Box>
      {renderZone('rows', localeText.pivotRows)}
      {renderZone('columns', localeText.pivotColumns)}
      {renderZone('values', localeText.pivotValues)}
    </Box>
  );
}
