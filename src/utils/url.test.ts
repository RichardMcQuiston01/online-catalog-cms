import { describe, expect, it } from 'bun:test';
import { isSafeUrl } from './url.js';

describe('isSafeUrl', () => {
  it('accepts http(s) URLs and root-relative paths', () => {
    for (const url of [
      'https://example.com',
      'http://example.com/a?b=c#d',
      '  https://example.com/padded  ',
      '/uploads/photo.jpg',
      '/',
    ]) {
      expect(isSafeUrl(url)).toBe(true);
    }
  });

  it('rejects script-capable and ambiguous values', () => {
    for (const url of [
      '',
      '   ',
      'javascript:alert(1)',
      ' JaVaScRiPt:alert(1)',
      'java\nscript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      '//evil.example.com/x.png',
      '/\\evil.example.com',
      'photo.jpg',
      '../photo.jpg',
      'ftp://example.com/file',
      'https://',
      'mailto:a@example.com',
    ]) {
      expect(isSafeUrl(url)).toBe(false);
    }
  });
});
