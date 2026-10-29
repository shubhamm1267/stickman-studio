import { inflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_PNG_BYTES = 1_500_000;
const MAX_DIMENSION = 2048;
const MAX_INFLATED_BYTES = 24 * 1024 * 1024;
const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

/** Validate a bounded, non-interlaced 8-bit PNG and prove it has visible pixels and real transparency. */
export function inspectTransparentPng(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input || []);
  if (bytes.length < 45 || bytes.length > MAX_PNG_BYTES || !bytes.subarray(0, 8).equals(PNG_SIGNATURE))
    throw new TypeError("Raster asset must be a bounded PNG file.");
  let offset = 8, width, height, bitDepth, colorType, interlace;
  const idat = [];
  let sawHeader = false, sawEnd = false;
  while (offset + 12 <= bytes.length) {
    const size = bytes.readUInt32BE(offset);
    if (size > MAX_PNG_BYTES || offset + size + 12 > bytes.length) throw new TypeError("PNG chunk length is invalid.");
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const payload = bytes.subarray(offset + 8, offset + 8 + size);
    const expectedCrc = bytes.readUInt32BE(offset + 8 + size);
    if (crc32(bytes.subarray(offset + 4, offset + 8 + size)) !== expectedCrc)
      throw new TypeError(`PNG ${type} chunk checksum is invalid.`);
    if (type === "IHDR") {
      if (sawHeader || size !== 13) throw new TypeError("PNG must have one valid IHDR chunk.");
      width = payload.readUInt32BE(0); height = payload.readUInt32BE(4);
      bitDepth = payload[8]; colorType = payload[9]; interlace = payload[12]; sawHeader = true;
      if (!width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION || bitDepth !== 8 || ![4, 6].includes(colorType) || interlace !== 0)
        throw new TypeError("PNG must be non-interlaced 8-bit grayscale-alpha or RGBA within 2048x2048.");
    } else if (type === "IDAT") {
      if (!sawHeader || sawEnd) throw new TypeError("PNG IDAT ordering is invalid.");
      idat.push(payload);
    } else if (type === "IEND") {
      if (size !== 0 || !sawHeader) throw new TypeError("PNG IEND chunk is invalid.");
      sawEnd = true; offset += size + 12; break;
    } else if (type[0] === type[0].toUpperCase()) {
      // Reject unknown critical chunks; ancillary chunks are ignored.
      if (!["PLTE"].includes(type)) throw new TypeError(`Unsupported critical PNG chunk ${type}.`);
    }
    offset += size + 12;
  }
  if (!sawHeader || !sawEnd || offset !== bytes.length || idat.length === 0)
    throw new TypeError("PNG is truncated or contains trailing data.");
  const channels = colorType === 6 ? 4 : 2;
  const stride = width * channels;
  let raw;
  try {
    raw = inflateSync(Buffer.concat(idat), { maxOutputLength: MAX_INFLATED_BYTES });
  } catch {
    throw new TypeError("PNG image data could not be safely decoded.");
  }
  if (raw.length !== height * (stride + 1)) throw new TypeError("PNG decoded dimensions do not match its header.");
  let transparent = false, visible = false;
  const previous = Buffer.alloc(stride);
  let cursor = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[cursor++];
    if (filter > 4) throw new TypeError("PNG uses an unsupported scanline filter.");
    const row = Buffer.from(raw.subarray(cursor, cursor + stride)); cursor += stride;
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? row[i - channels] : 0;
      const up = previous[i];
      const upperLeft = i >= channels ? previous[i - channels] : 0;
      if (filter === 1) row[i] = (row[i] + left) & 255;
      else if (filter === 2) row[i] = (row[i] + up) & 255;
      else if (filter === 3) row[i] = (row[i] + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) {
        const p = left + up - upperLeft;
        const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upperLeft);
        row[i] = (row[i] + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upperLeft)) & 255;
      }
    }
    for (let x = 0; x < width; x++) {
      const alpha = row[x * channels + channels - 1];
      if (alpha === 0) transparent = true;
      if (alpha > 0) visible = true;
    }
    row.copy(previous);
  }
  if (!transparent || !visible) throw new TypeError("PNG must contain both transparent and visible pixels.");
  return { width, height, alphaVerified: true, bytes: bytes.length };
}

export function inspectPngDataUri(value) {
  if (typeof value !== "string" || value.length > 2_000_000 || !value.startsWith("data:image/png;base64,"))
    throw new TypeError("Raster visual nodes require a bounded PNG data URI.");
  const encoded = value.slice("data:image/png;base64,".length);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))
    throw new TypeError("Raster data URI is not canonical base64.");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.toString("base64") !== encoded) throw new TypeError("Raster data URI is not canonical base64.");
  return inspectTransparentPng(bytes);
}
