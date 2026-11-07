/**
 * A minimal zip reader (stored and deflated entries, no zip64, no encryption): enough for addon release zips.
 * Reads the central directory, so entries are found by their real sizes and offsets.
 */
import { inflateRawSync } from "node:zlib";

export interface ZipEntry {
  /** The entry's path inside the zip, `/`-separated as zip stores it. */
  path: string;
  bytes: Uint8Array;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

/** Every file entry of the zip (directories left out), in central-directory order. */
export function unzip(zip: Uint8Array): ZipEntry[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  // End of central directory: 22 bytes plus a comment of up to 64 KiB, at the end of the file.
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a zip file (no end of central directory)");
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== CENTRAL_SIGNATURE) throw new Error("Corrupt zip central directory");
    const method = view.getUint16(at + 10, true);
    const compressedSize = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localOffset = view.getUint32(at + 42, true);
    const name = decoder.decode(zip.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith("/")) continue;
    if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) throw new Error(`Corrupt zip entry ${name}`);
    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    const raw = zip.subarray(dataStart, dataStart + compressedSize);
    let bytes: Uint8Array;
    if (method === 0) bytes = raw;
    else if (method === 8) bytes = new Uint8Array(inflateRawSync(raw));
    else throw new Error(`Zip entry ${name} uses compression method ${method}, which this reader can't unpack`);
    if (bytes.length !== size) throw new Error(`Zip entry ${name} unpacked to ${bytes.length} bytes, expected ${size}`);
    entries.push({ path: name, bytes });
  }
  return entries;
}
