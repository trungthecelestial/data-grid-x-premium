import { expect } from 'vitest';
import { crc32 } from './xlsx';

const decoder = new TextDecoder();

/** Reads a stored zip archive back into a name to text map, checking each entry's CRC. */
export function unzip(bytes: Uint8Array): Record<string, string> {
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

