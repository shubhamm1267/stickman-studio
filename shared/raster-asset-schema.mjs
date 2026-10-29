const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/** Browser-safe structural gate; the server asset resolver performs full CRC, inflate, and pixel-alpha verification. */
export function inspectPngDataUriHeader(value) {
  if (typeof value !== "string" || value.length > 2_000_000 || !value.startsWith("data:image/png;base64,"))
    throw new TypeError("Raster visual nodes require a bounded PNG data URI.");
  const encoded = value.slice("data:image/png;base64,".length);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded) || encoded.length < 44)
    throw new TypeError("Raster data URI is not canonical base64 PNG data.");
  const header = atob(encoded.slice(0, 44));
  const bytes = Uint8Array.from(header, (character) => character.charCodeAt(0));
  if (bytes.length < 33 || SIGNATURE.some((byte, index) => bytes[index] !== byte))
    throw new TypeError("Raster data URI has no PNG signature.");
  const length = bytes[8] * 0x1000000 + (bytes[9] << 16) + (bytes[10] << 8) + bytes[11];
  if (length !== 13 || String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR")
    throw new TypeError("Raster data URI has no valid PNG IHDR header.");
  const width = bytes[16] * 0x1000000 + (bytes[17] << 16) + (bytes[18] << 8) + bytes[19];
  const height = bytes[20] * 0x1000000 + (bytes[21] << 16) + (bytes[22] << 8) + bytes[23];
  if (!width || !height || width > 2048 || height > 2048 || bytes[24] !== 8 || ![4, 6].includes(bytes[25]) || bytes[28] !== 0)
    throw new TypeError("Raster PNG header must describe bounded, non-interlaced 8-bit alpha pixels.");
  return { width, height, alphaChannelPresent: true };
}
