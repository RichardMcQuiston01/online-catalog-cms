/** A text node with optional inline formatting. */
export interface TextNode {
  type: 'text';
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

/** An inline hyperlink containing child inline nodes. */
export interface LinkNode {
  type: 'link';
  href: string;
  children: InlineNode[];
}

/** Union of all inline content nodes. */
export type InlineNode = TextNode | LinkNode;

/** A paragraph block. */
export interface ParagraphNode {
  type: 'paragraph';
  children: InlineNode[];
  cssClass?: string;
}

/** A heading block (h1–h6). */
export interface HeadingNode {
  type: 'heading';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: InlineNode[];
  cssClass?: string;
}

/** An inline image embedded in the document. */
export interface RichTextImageNode {
  type: 'image';
  src: string;
  alt: string;
  cssClass?: string;
}

/** An ordered or unordered list. Each item is an array of inline nodes. */
export interface ListNode {
  type: 'list';
  ordered: boolean;
  items: InlineNode[][];
  cssClass?: string;
}

/** A block-level quote. */
export interface BlockquoteNode {
  type: 'blockquote';
  children: InlineNode[];
  cssClass?: string;
}

/** Union of all block-level content nodes. */
export type RichTextNode =
  | ParagraphNode
  | HeadingNode
  | RichTextImageNode
  | ListNode
  | BlockquoteNode;

/**
 * The JSON document schema for rich-text descriptions.
 * CSS classes are per-node so consumers control styling without a theming API.
 */
export interface RichTextDocument {
  version: 1;
  nodes: RichTextNode[];
}
