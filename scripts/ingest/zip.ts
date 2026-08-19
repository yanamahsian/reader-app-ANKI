// Minimal, dependency-free ZIP reader for EPUB ingestion.
//
// An EPUB file IS a ZIP archive. Node ships no ZIP support in its
// standard library, but it DOES ship raw DEFLATE decompression via
// `zlib` -- the one real piece a hand-rolled ZIP central-directory
// reader needs. That is used here instead of adding a new npm
// dependency (jszip, adm-zip, ...) for something this small and
// precisely specified by a public standard.
//
// Deliberately supports only what a real EPUB actually contains:
// compression method 0 (stored) and 8 (deflate), a single-volume,
// unencrypted archive with no ZIP64 extension. That is a complete
// implementation of the actual input domain (every real EPUB is
// exactly this), not a partial general-purpose ZIP implementation.

import { inflateRawSync } from "node:zlib";

interface CentralDirectoryEntry {
  fileName: string;
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;

// A real ZIP/EPUB always starts with one of these three standard
// magic byte sequences (local file header, or -- for a technically
// valid but empty archive -- the end-of-central-directory record
// itself). Checking this first is a cheap, reliable way to reject
// something that isn't a ZIP at all before attempting to parse it as
// one.
export function hasZipSignature(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  return buffer[0] === 0x50 && buffer[1] === 0x4b && (
    (buffer[2] === 0x03 && buffer[3] === 0x04) ||
    (buffer[2] === 0x05 && buffer[3] === 0x06) ||
    (buffer[2] === 0x07 && buffer[3] === 0x08)
  );
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  // The EOCD record is a fixed 22-byte block at the very end of the
  // file, unless a ZIP comment is present -- search backward for its
  // signature, bounded to the ZIP spec's own maximum comment length
  // (65535 bytes) so this never scans more of the buffer than
  // necessary.
  const maxCommentLength = 65557; // 22 (EOCD) + 65535 (max comment)
  const searchStart = Math.max(0, buffer.length - maxCommentLength);
  for (let i = buffer.length - 22; i >= searchStart; i--) {
    if (i >= 0 && buffer.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  throw new Error("zip: End Of Central Directory record not found -- not a valid ZIP/EPUB file");
}

function readCentralDirectory(buffer: Buffer): Map<string, CentralDirectoryEntry> {

  const eocdOffset = findEndOfCentralDirectory(buffer);
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);

  const entries = new Map<string, CentralDirectoryEntry>();
  let offset = centralDirOffset;

  for (let i = 0; i < totalEntries; i++) {

    if (buffer.readUInt32LE(offset) !== CENTRAL_DIR_SIGNATURE) {
      throw new Error(`zip: central directory entry ${i} has a bad signature at offset ${offset} -- archive is corrupt or truncated`);
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraFieldLength = buffer.readUInt16LE(offset + 30);
    const fileCommentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer.toString("utf-8", offset + 46, offset + 46 + fileNameLength);

    entries.set(fileName, { fileName, compressionMethod, compressedSize, localHeaderOffset });

    offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;

  }

  return entries;

}

// Parses the central directory once at construction, then serves
// individual entry reads against the same in-memory buffer -- cheap
// enough for an EPUB (tens of entries, single-digit megabytes) that
// no streaming/incremental parsing is warranted at this scale.
export class ZipArchive {

  private readonly buffer: Buffer;
  private readonly entries: Map<string, CentralDirectoryEntry>;

  constructor(buffer: Buffer) {
    if (!hasZipSignature(buffer)) {
      throw new Error("zip: buffer does not start with a ZIP signature -- not a valid ZIP/EPUB file");
    }
    this.buffer = buffer;
    this.entries = readCentralDirectory(buffer);
  }

  listEntries(): string[] {
    return Array.from(this.entries.keys());
  }

  has(path: string): boolean {
    return this.entries.has(path);
  }

  // Returns the decompressed bytes for `path`, or null if the archive
  // has no entry at that exact path -- callers distinguish "missing
  // entry" (a normal, expected case for e.g. an optional NCX) from a
  // genuine parse error via this return value rather than a thrown
  // exception.
  read(path: string): Buffer | null {

    const entry = this.entries.get(path);
    if (!entry) return null;

    const localOffset = entry.localHeaderOffset;

    if (this.buffer.readUInt32LE(localOffset) !== LOCAL_FILE_SIGNATURE) {
      throw new Error(`zip: local file header for "${path}" has a bad signature -- archive is corrupt or truncated`);
    }

    const localFileNameLength = this.buffer.readUInt16LE(localOffset + 26);
    const localExtraFieldLength = this.buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localFileNameLength + localExtraFieldLength;
    const compressedData = this.buffer.subarray(dataStart, dataStart + entry.compressedSize);

    if (entry.compressionMethod === 0) {
      return Buffer.from(compressedData);
    }

    if (entry.compressionMethod === 8) {
      return inflateRawSync(compressedData);
    }

    throw new Error(`zip: entry "${path}" uses unsupported compression method ${entry.compressionMethod} (only stored=0 and deflate=8 are supported)`);

  }

}
