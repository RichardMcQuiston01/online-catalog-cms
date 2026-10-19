/** An image format the catalog accepts for uploads. */
export interface ImageType {
  mimeType: string;
  /** File extension including the dot, e.g. ".jpg". */
  extension: string;
}

const JPEG: ImageType = { mimeType: 'image/jpeg', extension: '.jpg' };
const PNG: ImageType = { mimeType: 'image/png', extension: '.png' };
const GIF: ImageType = { mimeType: 'image/gif', extension: '.gif' };
const WEBP: ImageType = { mimeType: 'image/webp', extension: '.webp' };
const AVIF: ImageType = { mimeType: 'image/avif', extension: '.avif' };

/** Bytes needed to tell every supported format apart. */
export const IMAGE_SNIFF_BYTES = 12;

function startsWith(bytes: Uint8Array, signature: number[], at = 0): boolean {
  return signature.every((value, index) => bytes[at + index] === value);
}

function asciiAt(bytes: Uint8Array, at: number, text: string): boolean {
  return startsWith(
    bytes,
    [...text].map((char) => char.charCodeAt(0)),
    at,
  );
}

/**
 * Identifies a raster image from its leading bytes. The filename and any
 * caller-supplied MIME type are never consulted, so a file cannot pass as an
 * image by being named `.jpg`. SVG is deliberately unsupported: browsers run
 * script inside it.
 */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return JPEG;
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return PNG;
  }
  if (asciiAt(bytes, 0, 'GIF87a') || asciiAt(bytes, 0, 'GIF89a')) return GIF;
  if (asciiAt(bytes, 0, 'RIFF') && asciiAt(bytes, 8, 'WEBP')) return WEBP;
  if (
    asciiAt(bytes, 4, 'ftyp') &&
    (asciiAt(bytes, 8, 'avif') || asciiAt(bytes, 8, 'avis'))
  ) {
    return AVIF;
  }
  return null;
}
