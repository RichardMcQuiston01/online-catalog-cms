/**
 * True for a URL that is safe to render as a link target or image source:
 * an absolute `http:` / `https:` URL with a host, or a root-relative path
 * such as `/uploads/photo.jpg`. Everything else is refused, including
 * `javascript:`, `data:`, `vbscript:`, protocol-relative (`//host`) and
 * bare relative values, whose meaning depends on the page they are rendered
 * on.
 */
export function isSafeUrl(value: string): boolean {
  const url = value.trim();
  if (url.length === 0) return false;
  // Control characters are stripped or reinterpreted by URL parsers.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: that is the point
  if (/[\u0000-\u001f\u007f]/.test(url)) return false;

  if (url.startsWith('/')) {
    // `//host` and `/\host` both mean "another host" to a browser.
    return !url.startsWith('//') && !url.startsWith('/\\');
  }

  try {
    const parsed = new URL(url);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.hostname.length > 0
    );
  } catch {
    return false;
  }
}
