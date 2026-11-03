import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { DataGrid } from './DataGrid';

it('renders a header and a row per item', () => {
  render(<DataGrid rows={[{ id: 1, name: 'Ada' }]} columns={[{ field: 'name', headerName: 'Name' }]} />);

  expect(screen.getByRole('columnheader', { name: 'Name' })).toBeTruthy();
  expect(screen.getByRole('cell', { name: 'Ada' })).toBeTruthy();
});
