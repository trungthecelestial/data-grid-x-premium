import { describe, expect, it } from 'vitest';
import type { GridColDef } from '../DataGrid.types';
import { buildXlsx, columnLetter, crc32, toExcelSerial, zipStore } from './xlsx';

const decoder = new TextDecoder();

/** Reads a stored zip archive back into a name to text map, checking each entry's CRC. */
function unzip(bytes: Uint8Array): Record<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files: Record<string, string> = {};
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    const crc = view.getUint32(offset + 14, true);
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const name = decoder.decode(bytes.subarray(offset + 30, offset + 30 + nameLength));
    const data = bytes.subarray(offset + 30 + nameLength, offset + 30 + nameLength + size);
    expect(crc32(data)).toBe(crc);
    files[name] = decoder.decode(data);
    offset += 30 + nameLength + size;
  }
  // What follows the local entries must be a central directory and an end record that agree on the entry count.
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  expect(view.getUint16(end + 10, true)).toBe(Object.keys(files).length);
  expect(view.getUint32(offset, true)).toBe(0x02014b50);
  return files;
}

type Row = { id: number; name: string; qty: number; paid: boolean; joined: Date; team: string };

const columns: GridColDef<Row>[] = [
  { field: 'name', headerName: 'Name' },
  { field: 'qty', headerName: 'Qty', type: 'number' },
  { field: 'paid', headerName: 'Paid', type: 'boolean' },
  { field: 'joined', headerName: 'Joined', type: 'date' },
  { field: 'team', headerName: 'Team', type: 'singleSelect', valueOptions: [{ value: 'r', label: 'Red team' }] },
];

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('round trips files, including non-ASCII text', () => {
    const files = unzip(zipStore([{ name: 'a.txt', content: 'héllo' }, { name: 'dir/b.txt', content: '' }]));
    expect(files).toEqual({ 'a.txt': 'héllo', 'dir/b.txt': '' });
  });
});

describe('xlsx helpers', () => {
  it('names columns like a spreadsheet', () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnLetter)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
  });

  it('converts dates to Excel serial numbers in local time', () => {
    expect(toExcelSerial(new Date(1970, 0, 1))).toBe(25569);
    expect(toExcelSerial(new Date(2024, 0, 1, 12))).toBe(45292.5);
  });
});

describe('buildXlsx', () => {
  const rows: Row[] = [
    { id: 1, name: 'Ada & <Co>', qty: 3.5, paid: true, joined: new Date(2024, 0, 1), team: 'r' },
    { id: 2, name: '', qty: Number.NaN, paid: false, joined: new Date(Number.NaN), team: 'x' },
  ];

  it('writes every part of a workbook', () => {
    const files = unzip(buildXlsx(rows, columns));

    expect(Object.keys(files).sort()).toEqual(
      ['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml'].sort(),
    );
    expect(files['xl/workbook.xml']).toContain('<sheet name="Sheet1" sheetId="1" r:id="rId1"/>');
  });

  it('writes a bold frozen header row and typed cells', () => {
    const sheet = unzip(buildXlsx(rows, columns))['xl/worksheets/sheet1.xml'] as string;

    expect(sheet).toContain('<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">Name</t></is></c>');
    expect(sheet).toContain('state="frozen"');
    // Text is escaped, numbers and booleans keep their type, dates become serial numbers with a date style.
    expect(sheet).toContain('Ada &amp; &lt;Co&gt;');
    expect(sheet).toContain('<c r="B2"><v>3.5</v></c>');
    expect(sheet).toContain('<c r="C2" t="b"><v>1</v></c>');
    expect(sheet).toContain('<c r="D2" s="2"><v>45292</v></c>');
    // A select shows its label, and a value with no option falls back to the value.
    expect(sheet).toContain('Red team');
    expect(sheet).toContain('>x<');
    expect(sheet).toContain('<c r="C3" t="b"><v>0</v></c>');
  });

  it('leaves empty, invalid and non-finite values out', () => {
    const sheet = unzip(buildXlsx(rows, columns))['xl/worksheets/sheet1.xml'] as string;

    expect(sheet).not.toContain('r="A3"');
    expect(sheet).not.toContain('r="B3"');
    expect(sheet).not.toContain('r="D3"');
    expect(sheet).not.toContain('NaN');
  });

  it('can leave out the header and name the sheet', () => {
    const files = unzip(buildXlsx(rows, columns, { includeHeaders: false, sheetName: 'Data: [2024]/Q1' }));

    expect(files['xl/worksheets/sheet1.xml']).toContain('<row r="1"><c r="A1" t="inlineStr"');
    expect(files['xl/worksheets/sheet1.xml']).not.toContain('frozen');
    expect(files['xl/workbook.xml']).toContain('name="Data   2024  Q1"');
  });

  it('strips characters XML cannot hold', () => {
    const sheet = unzip(buildXlsx([{ id: 1, name: 'a\u0001b\tc', qty: 0, paid: false, joined: new Date(), team: '' }], columns))[
      'xl/worksheets/sheet1.xml'
    ] as string;

    expect(sheet).toContain('ab\tc');
  });

  it('sizes sheet columns from the given widths', () => {
    const sheet = unzip(buildXlsx(rows, columns, { columnWidths: { name: 350 } }))['xl/worksheets/sheet1.xml'] as string;

    expect(sheet).toContain('<col min="1" max="1" width="50" customWidth="1"/>');
  });

  it('writes a valid empty sheet', () => {
    const files = unzip(buildXlsx([], columns));
    expect(files['xl/worksheets/sheet1.xml']).toContain('<dimension ref="A1:E1"/>');
  });
});
