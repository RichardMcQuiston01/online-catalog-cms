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

describe('text', () => {
  it('creates a plain text node', () => {
    expect(text('hello')).toEqual({ type: 'text', text: 'hello' });
  });

  it('applies bold and italic flags', () => {
    expect(text('hi', { bold: true, italic: true })).toEqual({
      type: 'text',
      text: 'hi',
      bold: true,
      italic: true,
    });
  });
});

describe('link', () => {
  it('creates a link node with children', () => {
    const result = link('https://example.com', [text('click')]);
    expect(result).toEqual({
      type: 'link',
      href: 'https://example.com',
      children: [{ type: 'text', text: 'click' }],
    });
  });
});

describe('paragraph', () => {
  it('creates a paragraph with children', () => {
    const result = paragraph([text('hello')]);
    expect(result).toEqual({
      type: 'paragraph',
      children: [{ type: 'text', text: 'hello' }],
    });
  });

  it('attaches optional cssClass', () => {
    const result = paragraph([text('x')], 'lead');
    expect(result.cssClass).toBe('lead');
  });
});

describe('heading', () => {
  it('creates a heading with correct level', () => {
    const result = heading(2, [text('Title')]);
    expect(result.level).toBe(2);
    expect(result.type).toBe('heading');
  });
});

describe('image', () => {
  it('creates an image node', () => {
    const result = image('https://img.example.com/a.jpg', 'A photo');
    expect(result).toEqual({
      type: 'image',
      src: 'https://img.example.com/a.jpg',
      alt: 'A photo',
    });
  });
});

describe('unorderedList', () => {
  it('creates an unordered list', () => {
    const result = unorderedList([[text('item one')], [text('item two')]]);
    expect(result.ordered).toBe(false);
    expect(result.items).toHaveLength(2);
  });
});

describe('orderedList', () => {
  it('creates an ordered list', () => {
    const result = orderedList([[text('first')]]);
    expect(result.ordered).toBe(true);
  });
});

describe('blockquote', () => {
  it('creates a blockquote node', () => {
    const result = blockquote([text('quote')]);
    expect(result.type).toBe('blockquote');
    expect(result.children[0]).toEqual({ type: 'text', text: 'quote' });
  });
});

describe('document', () => {
  it('wraps nodes in a versioned document', () => {
    const doc = document([paragraph([text('hello')])]);
    expect(doc.version).toBe(1);
    expect(doc.nodes).toHaveLength(1);
  });
});
