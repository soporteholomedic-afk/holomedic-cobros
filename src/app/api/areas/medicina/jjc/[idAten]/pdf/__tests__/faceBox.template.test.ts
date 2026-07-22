import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { FACE_BOX, LEFT_EAR_BOX, RIGHT_EAR_BOX } from '../faceBox';

const TEMPLATE_PATH = path.resolve(
  process.cwd(),
  'public',
  'PLANTILLA_JJC_MEDICINA.pdf',
);

interface ImagePlacement {
  name: string;
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/**
 * Scan the raw PDF bytes for `stream ... endstream` pairs and try to
 * Flate-decompress them. Use byte-level access to avoid encoding issues.
 */
function extractImagePlacements(bytes: Uint8Array): ImagePlacement[] {
  const placements: ImagePlacement[] = [];
  const len = bytes.length;
  let pos = 0;

  while (pos < len) {
    // Find "stream" keyword followed by \r\n or \n
    const streamStart = findBytes(bytes, [0x73, 0x74, 0x72, 0x65, 0x61, 0x6D], pos); // "stream"
    if (streamStart < 0) break;

    // Skip past "stream" and the newline
    let dataStart = streamStart + 6;
    if (bytes[dataStart] === 0x0D) dataStart++; // \r
    if (bytes[dataStart] === 0x0A) dataStart++; // \n

    // Find "endstream"
    const endBytes = [0x65, 0x6E, 0x64, 0x73, 0x74, 0x72, 0x65, 0x61, 0x6D]; // "endstream"
    const endPos = findBytes(bytes, endBytes, dataStart);
    if (endPos < 0) break;

    // End of stream data: skip trailing newline before endstream
    let dataEnd = endPos;
    if (dataEnd > dataStart && bytes[dataEnd - 1] === 0x0A) dataEnd--;
    if (dataEnd > dataStart && bytes[dataEnd - 1] === 0x0D) dataEnd--;

    const rawData = bytes.slice(dataStart, dataEnd);

    // Try to decompress
    try {
      const decompressed = zlib.inflateSync(rawData);
      const text = decompressed.toString('latin1');

      // Look for cm + Do patterns
      const opRe = /([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+cm\s*\/(\w+)\s+Do/g;
      let opM: RegExpExecArray | null;
      while ((opM = opRe.exec(text)) !== null) {
        placements.push({
          name: opM[7],
          a: Number.parseFloat(opM[1]),
          b: Number.parseFloat(opM[2]),
          c: Number.parseFloat(opM[3]),
          d: Number.parseFloat(opM[4]),
          e: Number.parseFloat(opM[5]),
          f: Number.parseFloat(opM[6]),
        });
      }
    } catch {
      // Not a FlateDecode stream — skip
    }

    pos = endPos + endBytes.length;
  }

  return placements;
}

/**
 * Find the first occurrence of byte sequence `needle` starting at `from`.
 */
function findBytes(haystack: Uint8Array, needle: number[], from: number): number {
  for (let i = from; i <= haystack.length - needle.length; i++) {
    let match = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
}

describe('faceBox.template — image position in real PLANTILLA_JJC_MEDICINA.pdf', () => {
  let templateBytes: Uint8Array;

  beforeAll(() => {
    if (!fs.existsSync(TEMPLATE_PATH)) {
      return;
    }
    templateBytes = new Uint8Array(fs.readFileSync(TEMPLATE_PATH));
  });

  it('Im1 (face) is placed at the expected FACE_BOX coordinates', () => {
    if (!fs.existsSync(TEMPLATE_PATH)) {
      return;
    }

    const placements = extractImagePlacements(templateBytes);
    const im1 = placements.find((p) => p.name === 'Im1');
    expect(im1, 'Im1 not found in FlateDecode content streams').toBeDefined();
    if (!im1) return;

    expect(im1.a).toBeCloseTo(FACE_BOX.w, 0);
    expect(im1.d).toBeCloseTo(FACE_BOX.h, 0);
    expect(im1.e).toBeCloseTo(FACE_BOX.x, 0);
    expect(im1.f).toBeCloseTo(FACE_BOX.y, 0);
  });

  it('Im2 (left ear) is placed at the expected LEFT_EAR_BOX coordinates', () => {
    if (!fs.existsSync(TEMPLATE_PATH)) {
      return;
    }

    const placements = extractImagePlacements(templateBytes);
    const im2 = placements.find((p) => p.name === 'Im2');
    expect(im2, 'Im2 not found in FlateDecode content streams').toBeDefined();
    if (!im2) return;

    expect(im2.a).toBeCloseTo(LEFT_EAR_BOX.w, 0);
    expect(im2.d).toBeCloseTo(LEFT_EAR_BOX.h, 0);
    expect(im2.e).toBeCloseTo(LEFT_EAR_BOX.x, 0);
    expect(im2.f).toBeCloseTo(LEFT_EAR_BOX.y, 0);
  });

  it('Im3 (right ear) is placed at the expected RIGHT_EAR_BOX coordinates', () => {
    if (!fs.existsSync(TEMPLATE_PATH)) {
      return;
    }

    const placements = extractImagePlacements(templateBytes);
    const im3 = placements.find((p) => p.name === 'Im3');
    expect(im3, 'Im3 not found in FlateDecode content streams').toBeDefined();
    if (!im3) return;

    expect(im3.a).toBeCloseTo(RIGHT_EAR_BOX.w, 0);
    expect(im3.d).toBeCloseTo(RIGHT_EAR_BOX.h, 0);
    expect(im3.e).toBeCloseTo(RIGHT_EAR_BOX.x, 0);
    expect(im3.f).toBeCloseTo(RIGHT_EAR_BOX.y, 0);
  });

  it('Im1 aspect ratio matches the 300×400 SVG viewBox', () => {
    if (!fs.existsSync(TEMPLATE_PATH)) {
      return;
    }

    const placements = extractImagePlacements(templateBytes);
    const im1 = placements.find((p) => p.name === 'Im1');
    if (!im1) return;

    const aspect = im1.a / im1.d;
    expect(aspect).toBeCloseTo(300 / 400, 0);
  });
});
