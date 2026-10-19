import { describe, expect, it } from 'bun:test';
import { sniffImageType } from './imageType.js';

const ascii = (text: string): number[] =>
  [...text].map((char) => char.charCodeAt(0));

describe('sniffImageType', () => {
  it('recognizes each supported format', () => {
    const cases: [string, number[]][] = [
      ['image/jpeg', [0xff, 0xd8, 0xff, 0xdb]],
      ['image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
      ['image/gif', ascii('GIF89a')],
      ['image/gif', ascii('GIF87a')],
      ['image/webp', [...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WEBP')]],
      ['image/avif', [0, 0, 0, 0x1c, ...ascii('ftypavif')]],
    ];
    for (const [mimeType, bytes] of cases) {
      expect(sniffImageType(Uint8Array.from(bytes))?.mimeType).toBe(mimeType);
    }
  });

  it('rejects text, markup, other containers and empty input', () => {
    for (const bytes of [
      ascii('<svg></svg>'),
      ascii('<!doctype html>'),
      ascii('%PDF-1.7'),
      [...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WAVE')],
      [0, 0, 0, 0x1c, ...ascii('ftypmp42')],
      [],
    ]) {
      expect(sniffImageType(Uint8Array.from(bytes))).toBeNull();
    }
  });
});
