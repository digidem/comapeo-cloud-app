import JSZip from 'jszip';

export type ArchiveEntryBody = string | Uint8Array;

export const WGS84_PRJ =
  'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]';

export const WEB_MERCATOR_PRJ =
  'PROJCS["WGS_1984_Web_Mercator_Auxiliary_Sphere",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.0174532925199433]],PROJECTION["Mercator_Auxiliary_Sphere"],PARAMETER["False_Easting",0],PARAMETER["False_Northing",0],PARAMETER["Central_Meridian",0],PARAMETER["Standard_Parallel_1",0],PARAMETER["Auxiliary_Sphere_Type",0],UNIT["Meter",1]]';

export const WGS84_UTM_23S_PRJ =
  'PROJCS["WGS 84 / UTM zone 23S",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",-45],PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],PARAMETER["false_northing",10000000],UNIT["metre",1]]';

export const SIRGAS_2000_UTM_23S_PRJ =
  'PROJCS["SIRGAS 2000 / UTM zone 23S",GEOGCS["SIRGAS 2000",DATUM["Sistema_de_Referencia_Geocentrico_para_las_AmericaS_2000",SPHEROID["GRS 1980",6378137,298.257222101]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",-45],PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],PARAMETER["false_northing",10000000],UNIT["metre",1]]';

export function pointShp(x: number, y: number): Uint8Array {
  const bytes = new Uint8Array(128);
  const view = new DataView(bytes.buffer);
  view.setInt32(0, 9994, false);
  view.setInt32(24, 64, false);
  view.setInt32(28, 1000, true);
  view.setInt32(32, 1, true);
  view.setFloat64(36, x, true);
  view.setFloat64(44, y, true);
  view.setFloat64(52, x, true);
  view.setFloat64(60, y, true);
  view.setInt32(100, 1, false);
  view.setInt32(104, 10, false);
  view.setInt32(108, 1, true);
  view.setFloat64(112, x, true);
  view.setFloat64(120, y, true);
  return bytes;
}

type DbfField = {
  name: string;
  type: 'C' | 'D' | 'N';
  length: number;
  bytes: Uint8Array;
};

function oneRecordDbfFromFields(fields: readonly DbfField[]): Uint8Array {
  const headerLength = 32 + fields.length * 32 + 1;
  const recordLength = 1 + fields.reduce((sum, field) => sum + field.length, 0);
  const bytes = new Uint8Array(headerLength + recordLength + 1);
  const view = new DataView(bytes.buffer);
  bytes[0] = 0x03;
  bytes[1] = 126;
  bytes[2] = 9;
  bytes[3] = 4;
  view.setUint32(4, 1, true);
  view.setUint16(8, headerLength, true);
  view.setUint16(10, recordLength, true);

  let descriptorOffset = 32;
  for (const field of fields) {
    const encodedName = new TextEncoder().encode(field.name);
    bytes.set(encodedName.subarray(0, 11), descriptorOffset);
    bytes[descriptorOffset + 11] = field.type.charCodeAt(0);
    bytes[descriptorOffset + 16] = field.length;
    descriptorOffset += 32;
  }
  bytes[headerLength - 1] = 0x0d;
  bytes[headerLength] = 0x20;

  let valueOffset = headerLength + 1;
  for (const field of fields) {
    bytes.fill(0x20, valueOffset, valueOffset + field.length);
    bytes.set(field.bytes.subarray(0, field.length), valueOffset);
    valueOffset += field.length;
  }
  bytes[bytes.length - 1] = 0x1a;
  return bytes;
}

export function oneRecordDbf(value = 'community'): Uint8Array {
  return oneRecordDbfFromFields([
    {
      name: 'name',
      type: 'C',
      length: 20,
      bytes: new TextEncoder().encode(value),
    },
  ]);
}

export function oneDateDbf(date = '20260906'): Uint8Array {
  return oneRecordDbfFromFields([
    {
      name: 'surveyed',
      type: 'D',
      length: 8,
      bytes: new TextEncoder().encode(date),
    },
  ]);
}

export function oneCp1252Dbf(): Uint8Array {
  return oneRecordDbfFromFields([
    {
      name: 'name',
      type: 'C',
      length: 20,
      bytes: new Uint8Array([0x43, 0x61, 0x66, 0xe9]),
    },
  ]);
}

export function oneNonFiniteNumberDbf(): Uint8Array {
  return oneRecordDbfFromFields([
    {
      name: 'value',
      type: 'N',
      length: 10,
      bytes: new TextEncoder().encode('NaN'),
    },
  ]);
}

export function dbfWithDeclaredRecordCount(recordCount: number): Uint8Array {
  const bytes = oneRecordDbf();
  new DataView(bytes.buffer).setUint32(4, recordCount, true);
  return bytes;
}

export async function makeArchiveBytes(
  entries: ReadonlyArray<readonly [string, ArchiveEntryBody]>,
  compression: 'DEFLATE' | 'STORE' = 'DEFLATE',
): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [name, body] of entries) zip.file(name, body);
  return zip.generateAsync({ type: 'uint8array', compression });
}

export async function makeArchiveFile(
  entries: ReadonlyArray<readonly [string, ArchiveEntryBody]>,
  options: {
    name: string;
    type: string;
    compression?: 'DEFLATE' | 'STORE';
  },
): Promise<File> {
  const bytes = await makeArchiveBytes(entries, options.compression);
  const body = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new File([body], options.name, { type: options.type });
}

type ZipRecord = {
  name: string;
  centralOffset: number;
  localOffset: number;
};

function findEocd(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = bytes.byteLength - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error('EOCD not found');
}

function zipRecords(bytes: Uint8Array): ZipRecord[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(bytes);
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const records: ZipRecord[] = [];
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error('Central directory entry not found');
    }
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(
      bytes.subarray(offset + 46, offset + 46 + nameLength),
    );
    records.push({ name, centralOffset: offset, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return records;
}

function recordFor(bytes: Uint8Array, name: string): ZipRecord {
  const record = zipRecords(bytes).find((candidate) => candidate.name === name);
  if (!record) throw new Error(`ZIP record not found: ${name}`);
  return record;
}

export function patchZipEntryFlags(
  bytes: Uint8Array,
  name: string,
  flagMask: number,
): Uint8Array {
  const output = bytes.slice();
  const view = new DataView(output.buffer);
  const record = recordFor(output, name);
  view.setUint16(
    record.centralOffset + 8,
    view.getUint16(record.centralOffset + 8, true) | flagMask,
    true,
  );
  view.setUint16(
    record.localOffset + 6,
    view.getUint16(record.localOffset + 6, true) | flagMask,
    true,
  );
  return output;
}

export function patchZipEntryCompression(
  bytes: Uint8Array,
  name: string,
  method: number,
): Uint8Array {
  const output = bytes.slice();
  const view = new DataView(output.buffer);
  const record = recordFor(output, name);
  view.setUint16(record.centralOffset + 10, method, true);
  view.setUint16(record.localOffset + 8, method, true);
  return output;
}

export function patchZipEntryUncompressedSize(
  bytes: Uint8Array,
  name: string,
  size: number,
): Uint8Array {
  const output = bytes.slice();
  const view = new DataView(output.buffer);
  const record = recordFor(output, name);
  view.setUint32(record.centralOffset + 24, size, true);
  view.setUint32(record.localOffset + 22, size, true);
  return output;
}

export function patchZipEntryNameSameLength(
  bytes: Uint8Array,
  name: string,
  replacement: string,
): Uint8Array {
  const encoded = new TextEncoder().encode(replacement);
  const output = bytes.slice();
  const view = new DataView(output.buffer);
  const record = recordFor(output, name);
  const centralNameLength = view.getUint16(record.centralOffset + 28, true);
  const localNameLength = view.getUint16(record.localOffset + 26, true);
  if (
    encoded.byteLength !== centralNameLength ||
    encoded.byteLength !== localNameLength
  ) {
    throw new Error(
      'Replacement ZIP entry name must have the same byte length',
    );
  }
  output.set(encoded, record.centralOffset + 46);
  output.set(encoded, record.localOffset + 30);
  return output;
}

export function corruptZipEntryBody(
  bytes: Uint8Array,
  name: string,
): Uint8Array {
  const output = bytes.slice();
  const view = new DataView(output.buffer);
  const record = recordFor(output, name);
  const nameLength = view.getUint16(record.localOffset + 26, true);
  const extraLength = view.getUint16(record.localOffset + 28, true);
  const compressedSize = view.getUint32(record.localOffset + 18, true);
  if (compressedSize === 0) throw new Error('ZIP entry body is empty');
  const dataOffset = record.localOffset + 30 + nameLength + extraLength;
  const corruptOffset = dataOffset + Math.floor(compressedSize / 2);
  output[corruptOffset] = (output[corruptOffset] ?? 0) ^ 0xff;
  return output;
}

export function promoteZipToZip64(bytes: Uint8Array): Uint8Array {
  const eocdOffset = findEocd(bytes);
  const original = bytes.slice();
  const originalView = new DataView(
    original.buffer,
    original.byteOffset,
    original.byteLength,
  );
  const entryCount = originalView.getUint16(eocdOffset + 10, true);
  const centralSize = originalView.getUint32(eocdOffset + 12, true);
  const centralOffset = originalView.getUint32(eocdOffset + 16, true);
  const zip64Record = new Uint8Array(56);
  const zip64View = new DataView(zip64Record.buffer);
  zip64View.setUint32(0, 0x06064b50, true);
  zip64View.setBigUint64(4, 44n, true);
  zip64View.setUint16(12, 45, true);
  zip64View.setUint16(14, 45, true);
  zip64View.setUint32(16, 0, true);
  zip64View.setUint32(20, 0, true);
  zip64View.setBigUint64(24, BigInt(entryCount), true);
  zip64View.setBigUint64(32, BigInt(entryCount), true);
  zip64View.setBigUint64(40, BigInt(centralSize), true);
  zip64View.setBigUint64(48, BigInt(centralOffset), true);

  const locator = new Uint8Array(20);
  const locatorView = new DataView(locator.buffer);
  locatorView.setUint32(0, 0x07064b50, true);
  locatorView.setUint32(4, 0, true);
  locatorView.setBigUint64(8, BigInt(eocdOffset), true);
  locatorView.setUint32(16, 1, true);

  const output = new Uint8Array(
    original.byteLength + zip64Record.byteLength + locator.byteLength,
  );
  output.set(original.subarray(0, eocdOffset), 0);
  output.set(zip64Record, eocdOffset);
  output.set(locator, eocdOffset + zip64Record.byteLength);
  const newEocdOffset =
    eocdOffset + zip64Record.byteLength + locator.byteLength;
  output.set(original.subarray(eocdOffset), newEocdOffset);
  const outputView = new DataView(output.buffer);
  outputView.setUint16(newEocdOffset + 8, 0xffff, true);
  outputView.setUint16(newEocdOffset + 10, 0xffff, true);
  outputView.setUint32(newEocdOffset + 12, 0xffffffff, true);
  outputView.setUint32(newEocdOffset + 16, 0xffffffff, true);
  return output;
}
