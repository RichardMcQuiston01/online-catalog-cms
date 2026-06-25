import type {
  BlockquoteNode,
  HeadingNode,
  InlineNode,
  LinkNode,
  ListNode,
  ParagraphNode,
  RichTextDocument,
  RichTextImageNode,
  TextNode,
} from '../types/rich-text.js';

/** Create a plain text inline node. */
export function text(
  content: string,
  options: { bold?: boolean; italic?: boolean; code?: boolean } = {},
): TextNode {
  return { type: 'text', text: content, ...options };
}

/** Create a hyperlink inline node. */
export function link(href: string, children: InlineNode[]): LinkNode {
  return { type: 'link', href, children };
}

/** Create a paragraph block node. */
export function paragraph(
  children: InlineNode[],
  cssClass?: string,
): ParagraphNode {
  return { type: 'paragraph', children, ...(cssClass ? { cssClass } : {}) };
}

/** Create a heading block node (h1–h6). */
export function heading(
  level: 1 | 2 | 3 | 4 | 5 | 6,
  children: InlineNode[],
  cssClass?: string,
): HeadingNode {
  return {
    type: 'heading',
    level,
    children,
    ...(cssClass ? { cssClass } : {}),
  };
}

/** Create an inline image node. */
export function image(
  src: string,
  alt: string,
  cssClass?: string,
): RichTextImageNode {
  return { type: 'image', src, alt, ...(cssClass ? { cssClass } : {}) };
}

/** Create an unordered list node. */
export function unorderedList(
  items: InlineNode[][],
  cssClass?: string,
): ListNode {
  return {
    type: 'list',
    ordered: false,
    items,
    ...(cssClass ? { cssClass } : {}),
  };
}

/** Create an ordered list node. */
export function orderedList(
  items: InlineNode[][],
  cssClass?: string,
): ListNode {
  return {
    type: 'list',
    ordered: true,
    items,
    ...(cssClass ? { cssClass } : {}),
  };
}

/** Create a blockquote node. */
export function blockquote(
  children: InlineNode[],
  cssClass?: string,
): BlockquoteNode {
  return {
    type: 'blockquote',
    children,
    ...(cssClass ? { cssClass } : {}),
  };
}

/** Wrap an array of block nodes into a complete RichTextDocument. */
export function document(nodes: RichTextDocument['nodes']): RichTextDocument {
  return { version: 1, nodes };
}
