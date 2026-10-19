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
      image('https://example.com/src.jpg', 'alt'),
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

describe('isRichTextDocument safety rules', () => {
  const paragraphWith = (children: unknown[], cssClass?: unknown) => ({
    version: 1,
    nodes: [{ type: 'paragraph', children, cssClass }],
  });

  it('rejects script-capable link and image URLs', () => {
    for (const href of [
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      '//evil.example.com',
      'vbscript:x',
    ]) {
      expect(
        isRichTextDocument(document([paragraph([link(href, [text('x')])])])),
      ).toBe(false);
      expect(isRichTextDocument(document([image(href, 'alt')]))).toBe(false);
    }
  });

  it('accepts root-relative image sources such as local uploads', () => {
    expect(isRichTextDocument(document([image('/uploads/a.jpg', 'a')]))).toBe(
      true,
    );
  });

  it('only allows plain css class tokens', () => {
    expect(isRichTextDocument(paragraphWith([], 'lead text-lg_1'))).toBe(true);
    expect(isRichTextDocument(paragraphWith([], '" onclick=alert(1)'))).toBe(
      false,
    );
    expect(isRichTextDocument(paragraphWith([], 5))).toBe(false);
    expect(isRichTextDocument(paragraphWith([], 'a'.repeat(201)))).toBe(false);
  });

  it('rejects non-integer heading levels', () => {
    expect(
      isRichTextDocument({
        version: 1,
        nodes: [{ type: 'heading', level: 2.5, children: [] }],
      }),
    ).toBe(false);
  });

  it('rejects deeply nested links without overflowing the stack', () => {
    let inner: unknown = text('deep');
    for (let i = 0; i < 100_000; i++) {
      inner = { type: 'link', href: 'https://example.com', children: [inner] };
    }
    expect(() => isRichTextDocument(paragraphWith([inner]))).not.toThrow();
    expect(isRichTextDocument(paragraphWith([inner]))).toBe(false);
  });

  it('allows nesting up to the limit', () => {
    let inner: unknown = text('ok');
    for (let i = 0; i < 8; i++) {
      inner = { type: 'link', href: 'https://example.com', children: [inner] };
    }
    expect(isRichTextDocument(paragraphWith([inner]))).toBe(true);
  });

  it('rejects documents with too many nodes', () => {
    const children = Array.from({ length: 10_001 }, () => text('x'));
    expect(isRichTextDocument(paragraphWith(children))).toBe(false);
  });

  it('rejects documents that are too large when serialized', () => {
    const big = document([paragraph([text('x'.repeat(1_000_001))])]);
    expect(isRichTextDocument(big)).toBe(false);
  });
});

describe('assertRichTextDocument', () => {
  it('names the problem and where it is', () => {
    const bad = document([
      paragraph([link('javascript:alert(1)', [text('x')])]),
    ]);
    expect(() => assertRichTextDocument(bad)).toThrow(
      'nodes[0].children[0].href',
    );
  });

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
