import { deflateSync } from "node:zlib";

const table = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
const crc32 = (value) => {
  let crc = 0xffffffff;
  for (const byte of value) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};
const chunk = (type, value) => {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4); length.writeUInt32BE(value.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([name, value])));
  return Buffer.concat([length, name, value, checksum]);
};

export function point13Png({ transparent = true } = {}) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0); header.writeUInt32BE(2, 4);
  header[8] = 8; header[9] = 6;
  const alpha = transparent ? [255, 0, 255, 128] : [255, 255, 255, 255];
  const raw = Buffer.from([
    0, 245, 45, 30, alpha[0], 0, 0, 0, alpha[1],
    0, 10, 210, 75, alpha[2], 30, 80, 240, alpha[3],
  ]);
  return Buffer.concat([signature, chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
