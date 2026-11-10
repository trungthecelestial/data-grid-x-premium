import type { GridColDef, GridExcelCellStyle, GridValidRowModel } from '../DataGrid.types';
import { getCellValue, getFormattedValue } from './columns';

export const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface XlsxOptions {
  /** Worksheet name. Defaults to `Sheet1`. */
  sheetName?: string;
  /** Writes a bold, frozen header row. Defaults to true. */
  includeHeaders?: boolean;
  /** Column widths in px, by field. Used to size the sheet's columns. */
  columnWidths?: Readonly<Record<string, number>>;
  /** Cell styles by field. */
  columnsStyles?: Readonly<Record<string, GridExcelCellStyle>>;
  /**
   * Replaces `rows` with rows that carry an outline level, and group rows written in bold.
   * A group row writes `label` in the first column and its `values` (by field) in the others.
   */
  entries?: readonly XlsxEntry<any>[];
}

export type XlsxEntry<R extends GridValidRowModel> =
  | { kind: 'row'; row: R; level: number; label?: string }
  | { kind: 'group'; label: string; level: number; values: Readonly<Record<string, unknown>> };

// --- zip -------------------------------------------------------------------------------------------------------------

let crcTable: Uint32Array | undefined;

export function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (crcTable[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const encoder = new TextEncoder();

// 1980-01-01 00:00, the zip epoch, so the archive is the same every time.
const DOS_TIME = 0;
const DOS_DATE = 0x21;

/** Packs files into a zip archive without compression. Spreadsheet files are small, and every reader accepts stored entries. */
export function zipStore(files: readonly { name: string; content: string }[]): Uint8Array {
  const entries = files.map((file) => {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    return { name, data, crc: crc32(data) };
  });

  const localSize = entries.reduce((total, entry) => total + 30 + entry.name.length + entry.data.length, 0);
  const centralSize = entries.reduce((total, entry) => total + 46 + entry.name.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let offset = 0;
  const offsets: number[] = [];

  for (const entry of entries) {
    offsets.push(offset);
    view.setUint32(offset, 0x04034b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 0x0800, true); // UTF-8 names
    view.setUint16(offset + 8, 0, true); // stored
    view.setUint16(offset + 10, DOS_TIME, true);
    view.setUint16(offset + 12, DOS_DATE, true);
    view.setUint32(offset + 14, entry.crc, true);
    view.setUint32(offset + 18, entry.data.length, true);
    view.setUint32(offset + 22, entry.data.length, true);
    view.setUint16(offset + 26, entry.name.length, true);
    view.setUint16(offset + 28, 0, true);
    out.set(entry.name, offset + 30);
    out.set(entry.data, offset + 30 + entry.name.length);
    offset += 30 + entry.name.length + entry.data.length;
  }

  const centralStart = offset;
  entries.forEach((entry, index) => {
    view.setUint32(offset, 0x02014b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 20, true);
    view.setUint16(offset + 8, 0x0800, true);
    view.setUint16(offset + 10, 0, true);
    view.setUint16(offset + 12, DOS_TIME, true);
    view.setUint16(offset + 14, DOS_DATE, true);
    view.setUint32(offset + 16, entry.crc, true);
    view.setUint32(offset + 20, entry.data.length, true);
    view.setUint32(offset + 24, entry.data.length, true);
    view.setUint16(offset + 28, entry.name.length, true);
    view.setUint16(offset + 30, 0, true);
    view.setUint16(offset + 32, 0, true);
    view.setUint16(offset + 34, 0, true);
    view.setUint16(offset + 36, 0, true);
    view.setUint32(offset + 38, 0, true);
    view.setUint32(offset + 42, offsets[index] as number, true);
    out.set(entry.name, offset + 46);
    offset += 46 + entry.name.length;
  });

  view.setUint32(offset, 0x06054b50, true);
  view.setUint16(offset + 4, 0, true);
  view.setUint16(offset + 6, 0, true);
  view.setUint16(offset + 8, entries.length, true);
  view.setUint16(offset + 10, entries.length, true);
  view.setUint32(offset + 12, offset - centralStart, true);
  view.setUint32(offset + 16, centralStart, true);
  view.setUint16(offset + 20, 0, true);
  return out;
}

// --- sheet -----------------------------------------------------------------------------------------------------------

const escapeXml = (value: string) =>
  value
    // Control characters other than tab and line breaks are not allowed in XML 1.0.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** 0 becomes A, 25 becomes Z, 26 becomes AA. */
export function columnLetter(index: number): string {
  let letters = '';
  let n = index;
  while (n >= 0) {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  }
  return letters;
}

/** Excel stores a date as the number of days since 1899-12-30, in the local time of the sheet. */
export function toExcelSerial(date: Date): number {
  return (date.getTime() - date.getTimezoneOffset() * 60000) / 86400000 + 25569;
}

const sanitizeSheetName = (name: string | undefined) => {
  const cleaned = (name ?? '').replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31);
  return cleaned === '' ? 'Sheet1' : cleaned;
};

/** Collects the fonts, fills, number formats and cell formats a sheet uses, and writes them as styles.xml. */
class StyleSheet {
  private fonts = ['<font><sz val="11"/><name val="Calibri"/></font>'];
  private fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  private numFmts: string[] = [];
  private xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];

  private indexOf(list: string[], entry: string): number {
    const index = list.indexOf(entry);
    if (index !== -1) {
      return index;
    }
    list.push(entry);
    return list.length - 1;
  }

  /** The index of the cell format for a style, `0` being the default. `numFmtId` is a built-in format such as 14 for dates. */
  get(style: GridExcelCellStyle | undefined, builtInFormat = 0, bold = false): number {
    const font = { ...style?.font, bold: Boolean(style?.font?.bold) || bold };
    const fontXml =
      '<font>' +
      (font.bold ? '<b/>' : '') +
      (font.italic ? '<i/>' : '') +
      (font.underline ? '<u/>' : '') +
      `<sz val="${font.size ?? 11}"/>` +
      (font.color?.argb ? `<color rgb="${toArgb(font.color.argb)}"/>` : '') +
      '<name val="Calibri"/></font>';
    const fontId = this.indexOf(this.fonts, fontXml);
    const fillColor = style?.fill?.fgColor?.argb;
    const fillId = fillColor
      ? this.indexOf(this.fills, `<fill><patternFill patternType="solid"><fgColor rgb="${toArgb(fillColor)}"/><bgColor indexed="64"/></patternFill></fill>`)
      : 0;
    const numFmtId = style?.numFmt ? 164 + this.indexOf(this.numFmts, style.numFmt) : builtInFormat;
    const alignment = style?.alignment;
    const alignmentXml =
      alignment && (alignment.horizontal || alignment.vertical || alignment.wrapText)
        ? `<alignment${alignment.horizontal ? ` horizontal="${alignment.horizontal}"` : ''}${
            alignment.vertical ? ` vertical="${alignment.vertical === 'middle' ? 'center' : alignment.vertical}"` : ''
          }${alignment.wrapText ? ' wrapText="1"' : ''}/>`
        : '';
    const xf =
      `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="0" xfId="0"` +
      `${numFmtId ? ' applyNumberFormat="1"' : ''}${fontId ? ' applyFont="1"' : ''}${fillId ? ' applyFill="1"' : ''}` +
      (alignmentXml ? ` applyAlignment="1">${alignmentXml}</xf>` : '/>');
    return this.indexOf(this.xfs, xf);
  }

  toXml(): string {
    const numFmts = this.numFmts.length
      ? `<numFmts count="${this.numFmts.length}">${this.numFmts
          .map((format, index) => `<numFmt numFmtId="${164 + index}" formatCode="${escapeXml(format)}"/>`)
          .join('')}</numFmts>`
      : '';
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      numFmts +
      `<fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts>` +
      `<fills count="${this.fills.length}">${this.fills.join('')}</fills>` +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>'
    );
  }
}

/** Excel wants ARGB. A six digit RGB color gets a full alpha. */
const toArgb = (color: string) => {
  const hex = color.replace(/^#/, '').toUpperCase();
  return hex.length === 6 ? `FF${hex}` : hex;
};

const BUILT_IN_DATE = 14;
const BUILT_IN_DATE_TIME = 22;

function textCell(reference: string, text: string, style = 0): string {
  const styleAttribute = style ? ` s="${style}"` : '';
  return `<c r="${reference}" t="inlineStr"${styleAttribute}><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
}

function valueCell<R extends GridValidRowModel>(
  reference: string,
  value: unknown,
  row: R,
  column: GridColDef<R>,
  styles: StyleSheet,
  columnStyle: GridExcelCellStyle | undefined,
  bold: boolean,
  formatted?: string,
): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  const style = styles.get(columnStyle, 0, bold);
  const styleAttribute = style ? ` s="${style}"` : '';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? `<c r="${reference}"${styleAttribute}><v>${value}</v></c>` : '';
  }
  if (typeof value === 'boolean') {
    return `<c r="${reference}" t="b"${styleAttribute}><v>${value ? 1 : 0}</v></c>`;
  }
  if (column.type === 'date' || column.type === 'dateTime' || value instanceof Date) {
    const date = value instanceof Date ? value : new Date(value as string | number);
    if (!Number.isNaN(date.getTime())) {
      const dateStyle = styles.get(columnStyle, column.type === 'dateTime' ? BUILT_IN_DATE_TIME : BUILT_IN_DATE, bold);
      return `<c r="${reference}" s="${dateStyle}"><v>${toExcelSerial(date)}</v></c>`;
    }
  }
  const text = formatted ?? getFormattedValue(row, column, value);
  return text === '' ? '' : textCell(reference, text, style);
}

/**
 * Builds an .xlsx workbook with one sheet. Numbers, booleans and dates keep their type so Excel can calculate with them.
 * With `entries`, rows are nested in outline levels that Excel can collapse.
 */
export function buildXlsx<R extends GridValidRowModel>(
  rows: readonly R[],
  columns: readonly GridColDef<R>[],
  { sheetName, includeHeaders = true, columnWidths = {}, columnsStyles = {}, entries }: XlsxOptions = {},
): Uint8Array {
  const styles = new StyleSheet();
  const sheetRows: string[] = [];
  let rowNumber = 0;
  let maxLevel = 0;

  if (includeHeaders) {
    rowNumber += 1;
    const headerStyle = styles.get(undefined, 0, true);
    const cells = columns.map((column, index) =>
      textCell(`${columnLetter(index)}${rowNumber}`, column.headerName ?? column.field, headerStyle),
    );
    sheetRows.push(`<row r="${rowNumber}">${cells.join('')}</row>`);
  }
  const rowEntries: readonly XlsxEntry<R>[] = entries ?? rows.map((row) => ({ kind: 'row' as const, row, level: 0 }));
  for (const entry of rowEntries) {
    rowNumber += 1;
    maxLevel = Math.max(maxLevel, entry.level);
    const bold = entry.kind === 'group';
    const cells = columns
      .map((column, index) => {
        const reference = `${columnLetter(index)}${rowNumber}`;
        const columnStyle = columnsStyles[column.field];
        // The first column carries the group label, or the row's place in the tree.
        if (index === 0 && entry.label !== undefined) {
          return entry.label === '' ? '' : textCell(reference, entry.label, styles.get(columnStyle, 0, bold));
        }
        if (entry.kind === 'group') {
          return column.field in entry.values
            ? valueCell(reference, entry.values[column.field], {} as R, column, styles, columnStyle, true, undefined)
            : '';
        }
        return valueCell(reference, getCellValue(entry.row, column), entry.row, column, styles, columnStyle, false);
      })
      .join('');
    const outline = entry.level > 0 ? ` outlineLevel="${Math.min(7, entry.level)}"` : '';
    sheetRows.push(`<row r="${rowNumber}"${outline}>${cells}</row>`);
  }

  const cols = columns
    .map((column, index) => {
      // Roughly seven pixels per character of the default font.
      const width = Math.max(8, Math.min(80, Math.round((columnWidths[column.field] ?? column.width ?? 100) / 7)));
      return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
    })
    .join('');
  const view = includeHeaders
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : '';
  const lastReference = `${columnLetter(Math.max(0, columns.length - 1))}${Math.max(1, rowNumber)}`;

  // Group rows sit above their children, so the outline's expand button belongs above too.
  const outlineProperties = maxLevel > 0 ? '<sheetPr><outlinePr summaryBelow="0"/></sheetPr>' : '';
  const format = maxLevel > 0 ? `<sheetFormatPr defaultRowHeight="15" outlineLevelRow="${Math.min(7, maxLevel)}"/>` : '';
  const sheet =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `${outlineProperties}<dimension ref="A1:${lastReference}"/>${view}${format}<cols>${cols}</cols><sheetData>${sheetRows.join('')}</sheetData></worksheet>`;

  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets><sheet name="${escapeXml(sanitizeSheetName(sheetName))}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  return zipStore([
    {
      name: '[Content_Types].xml',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>',
    },
    {
      name: '_rels/.rels',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    },
    { name: 'xl/workbook.xml', content: workbook },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>',
    },
    { name: 'xl/styles.xml', content: styles.toXml() },
    { name: 'xl/worksheets/sheet1.xml', content: sheet },
  ]);
}
