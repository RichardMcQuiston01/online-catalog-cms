import type {
  InlineNode,
  RichTextDocument,
  RichTextNode,
} from '../types/rich-text.js';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInlineNode(value: unknown): value is InlineNode {
  if (!isObject(value)) return false;
  if (value.type === 'text') {
    return typeof value.text === 'string';
  }
  if (value.type === 'link') {
    return (
      typeof value.href === 'string' &&
      Array.isArray(value.children) &&
      (value.children as unknown[]).every(isInlineNode)
    );
  }
  return false;
}

function isRichTextNode(value: unknown): value is RichTextNode {
  if (!isObject(value)) return false;
  const type = value.type;

  if (type === 'paragraph' || type === 'blockquote') {
    return (
      Array.isArray(value.children) &&
      (value.children as unknown[]).every(isInlineNode)
    );
  }

  if (type === 'heading') {
    const level = value.level;
    return (
      typeof level === 'number' &&
      level >= 1 &&
      level <= 6 &&
      Array.isArray(value.children) &&
      (value.children as unknown[]).every(isInlineNode)
    );
  }

  if (type === 'image') {
    return typeof value.src === 'string' && typeof value.alt === 'string';
  }

  if (type === 'list') {
    return (
      typeof value.ordered === 'boolean' &&
      Array.isArray(value.items) &&
      (value.items as unknown[]).every(
        (item) =>
          Array.isArray(item) && (item as unknown[]).every(isInlineNode),
      )
    );
  }

  return false;
}

/**
 * Returns true if `value` is a valid {@link RichTextDocument}.
 * Use this at system boundaries (e.g. API input) before persisting content.
 */
export function isRichTextDocument(value: unknown): value is RichTextDocument {
  if (!isObject(value)) return false;
  if (value.version !== 1) return false;
  if (!Array.isArray(value.nodes)) return false;
  return (value.nodes as unknown[]).every(isRichTextNode);
}

/**
 * Throws a `TypeError` if `value` is not a valid {@link RichTextDocument}.
 */
export function assertRichTextDocument(
  value: unknown,
): asserts value is RichTextDocument {
  if (!isRichTextDocument(value)) {
    throw new TypeError(
      'Invalid RichTextDocument: must be { version: 1, nodes: RichTextNode[] }',
    );
  }
}
