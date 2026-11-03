import Checkbox from '@mui/material/Checkbox';
import InputBase from '@mui/material/InputBase';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import type { FocusEvent, KeyboardEvent } from 'react';
import type { GridColDef, GridValidRowModel } from '../DataGrid.types';
import { getValueOptions } from '../features/columns';

export interface GridCellEditorProps<R extends GridValidRowModel> {
  colDef: GridColDef<R>;
  value: unknown;
  autoFocus?: boolean;
  /** Saves when focus leaves the editor. Used by cell edit mode. */
  commitOnBlur?: boolean;
  onChange: (value: unknown) => void;
  onCommit: () => void;
  onCancel: () => void;
}

const pad = (value: number) => String(value).padStart(2, '0');

function toInputValue(value: unknown, withTime: boolean): string {
  if (value == null || value === '') {
    return '';
  }
  const date = value instanceof Date ? value : new Date(value as string | number);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return withTime ? `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}` : day;
}

export function GridCellEditor<R extends GridValidRowModel>(props: GridCellEditorProps<R>) {
  const { colDef, value, autoFocus, commitOnBlur, onChange, onCommit, onCancel } = props;

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      onCommit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  };

  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    if (commitOnBlur && !event.currentTarget.contains(event.relatedTarget as Node | null)) {
      onCommit();
    }
  };

  switch (colDef.type) {
    case 'boolean':
      return (
        <Checkbox
          size="small"
          autoFocus={autoFocus}
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
        />
      );
    case 'singleSelect':
      return (
        <Select
          size="small"
          variant="standard"
          fullWidth
          autoFocus={autoFocus}
          value={value ?? ''}
          onChange={(event) => {
            onChange(event.target.value);
            if (commitOnBlur) {
              onCommit();
            }
          }}
          onKeyDown={handleKeyDown}
        >
          {getValueOptions(colDef).map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </Select>
      );
    case 'number':
      return (
        <InputBase
          fullWidth
          autoFocus={autoFocus}
          type="number"
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          inputProps={{ 'aria-label': colDef.headerName ?? colDef.field }}
          sx={{ font: 'inherit' }}
        />
      );
    case 'date':
    case 'dateTime': {
      const withTime = colDef.type === 'dateTime';
      return (
        <InputBase
          fullWidth
          autoFocus={autoFocus}
          type={withTime ? 'datetime-local' : 'date'}
          value={toInputValue(value, withTime)}
          onChange={(event) => onChange(event.target.value === '' ? null : new Date(event.target.value))}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          inputProps={{ 'aria-label': colDef.headerName ?? colDef.field }}
          sx={{ font: 'inherit' }}
        />
      );
    }
    default:
      return (
        <InputBase
          fullWidth
          autoFocus={autoFocus}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          inputProps={{ 'aria-label': colDef.headerName ?? colDef.field }}
          sx={{ font: 'inherit' }}
        />
      );
  }
}
