import { describe, expect, it } from 'vitest';
import type { GridColDef } from '../DataGrid.types';
import { buildXlsx, columnLetter, crc32, toExcelSerial, zipStore } from './xlsx';
import { unzip } from './unzip.testutil';

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

describe('styles and outline', () => {
  const rows: Row[] = [{ id: 1, name: 'Ada', qty: 3, paid: true, joined: new Date(2024, 0, 2), team: 'r' }];

  it('writes column styles with their number format, font, fill and alignment', () => {
    const files = unzip(
      buildXlsx(rows, columns, {
        columnsStyles: {
          qty: { numFmt: '#,##0.00', font: { bold: true, color: { argb: 'FFFF0000' } }, fill: { fgColor: { argb: '00FF00' } }, alignment: { horizontal: 'center' } },
        },
      }),
    );
    const styles = files['xl/styles.xml'] as string;
    expect(styles).toContain('<numFmt numFmtId="164" formatCode="#,##0.00"/>');
    expect(styles).toContain('<color rgb="FFFF0000"/>');
    expect(styles).toContain('<fgColor rgb="FF00FF00"/>');
    expect(styles).toContain('<alignment horizontal="center"/>');
    const sheet = files['xl/worksheets/sheet1.xml'] as string;
    const qtyCell = sheet.match(/<c r="B2" s="(\d+)"><v>3<\/v><\/c>/);
    expect(qtyCell).not.toBeNull();
    const xfs = (styles.match(/<cellXfs[^>]*>(.*)<\/cellXfs>/)?.[1] ?? '').match(/<xf [^>]*?(\/>|>.*?<\/xf>)/g) ?? [];
    expect(xfs[Number(qtyCell?.[1])]).toContain('numFmtId="164"');
  });

  it('nests entries in outline levels with bold group rows', () => {
    const sheet = unzip(
      buildXlsx([], columns, {
        entries: [
          { kind: 'group', label: 'Red', level: 0, values: { qty: 3 } },
          { kind: 'row', row: rows[0] as Row, level: 1, label: '' },
        ],
      }),
    )['xl/worksheets/sheet1.xml'] as string;
    expect(sheet).toContain('<outlinePr summaryBelow="0"/>');
    expect(sheet).toContain('outlineLevelRow="1"');
    expect(sheet).toMatch(/<row r="2"><c r="A2" t="inlineStr" s="\d+"><is><t xml:space="preserve">Red<\/t>/);
    expect(sheet).toContain('<row r="3" outlineLevel="1">');
  });
});
