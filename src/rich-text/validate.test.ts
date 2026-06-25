import { describe, expect, it } from 'vitest';
import {
  blockquote,
  document,
  heading,
  image,
  link,
  orderedList,
  paragraph,
  text,
  unorderedList,
} from './builders.js';
import { assertRichTextDocument, isRichTextDocument } from './validate.js';

describe('isRichTextDocument', () => {
  it('accepts a valid document', () => {
    const doc = document([paragraph([text('hello')])]);
    expect(isRichTextDocument(doc)).toBe(true);
  });

  it('accepts all node types', () => {
    const doc = document([
      paragraph([text('p')]),
      heading(1, [text('h1')]),
      image('src.jpg', 'alt'),
      unorderedList([[text('a')], [text('b')]]),
      orderedList([[text('1')]]),
      blockquote([text('q')]),
    ]);
    expect(isRichTextDocument(doc)).toBe(true);
  });

  it('accepts link inline nodes', () => {
    const doc = document([
      paragraph([link('https://example.com', [text('click')])]),
    ]);
    expect(isRichTextDocument(doc)).toBe(true);
  });

  it('rejects null', () => {
    expect(isRichTextDocument(null)).toBe(false);
  });

  it('rejects wrong version', () => {
    expect(isRichTextDocument({ version: 2, nodes: [] })).toBe(false);
  });

  it('rejects missing nodes array', () => {
    expect(isRichTextDocument({ version: 1 })).toBe(false);
  });

  it('rejects unknown node type', () => {
    expect(
      isRichTextDocument({ version: 1, nodes: [{ type: 'unknown' }] }),
    ).toBe(false);
  });

  it('rejects heading with invalid level', () => {
    expect(
      isRichTextDocument({
        version: 1,
        nodes: [{ type: 'heading', level: 7, children: [] }],
      }),
    ).toBe(false);
  });

  it('rejects text node missing text property', () => {
    expect(
      isRichTextDocument({
        version: 1,
        nodes: [{ type: 'paragraph', children: [{ type: 'text' }] }],
      }),
    ).toBe(false);
  });
});

describe('assertRichTextDocument', () => {
  it('does not throw for a valid document', () => {
    expect(() =>
      assertRichTextDocument(document([paragraph([text('ok')])])),
    ).not.toThrow();
  });

  it('throws TypeError for invalid input', () => {
    expect(() => assertRichTextDocument({ version: 2, nodes: [] })).toThrow(
      TypeError,
    );
  });
});
