import type { RichTextDocument } from '../types/rich-text.js';
import { isSafeUrl } from '../utils/url.js';

/** Most levels of links nested inside links that a document may use. */
export const MAX_INLINE_DEPTH = 8;
/** Most block and inline nodes (and list items) in one document. */
export const MAX_NODE_COUNT = 10_000;
/** Largest document, measured as serialized JSON characters. */
export const MAX_DOCUMENT_LENGTH = 1_000_000;

const MAX_CSS_CLASS_LENGTH = 200;
const CSS_CLASS_PATTERN = /^[A-Za-z0-9 _-]+$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Walks a document once, remembering how many nodes it has seen. */
class Validator {
  private nodeCount = 0;

  /** Returns a description of the first problem found, or null if valid. */
  check(value: unknown): string | null {
    if (!isObject(value)) return 'must be an object';
    if (value.version !== 1) return '"version" must be 1';
    if (!Array.isArray(value.nodes)) return '"nodes" must be an array';

    for (const [index, node] of value.nodes.entries()) {
      const problem = this.checkBlock(node, `nodes[${index}]`);
      if (problem) return problem;
    }

    // Counting nodes first bounds the work this serialization does.
    const length = JSON.stringify(value).length;
    if (length > MAX_DOCUMENT_LENGTH) {
      return `is ${length} characters when serialized, over the ${MAX_DOCUMENT_LENGTH} limit`;
    }
    return null;
  }

  private countNode(path: string): string | null {
    this.nodeCount += 1;
    return this.nodeCount > MAX_NODE_COUNT
      ? `has more than ${MAX_NODE_COUNT} nodes (stopped at ${path})`
      : null;
  }

  private checkCssClass(node: Record<string, unknown>, path: string) {
    if (node.cssClass === undefined) return null;
    const cssClass = node.cssClass;
    if (
      typeof cssClass !== 'string' ||
      cssClass.length > MAX_CSS_CLASS_LENGTH ||
      !CSS_CLASS_PATTERN.test(cssClass)
    ) {
      return `${path}.cssClass must be letters, digits, spaces, "-" or "_" (at most ${MAX_CSS_CLASS_LENGTH} characters)`;
    }
    return null;
  }

  private checkInlineList(value: unknown, path: string, depth: number) {
    if (!Array.isArray(value)) return `${path} must be an array`;
    for (const [index, child] of value.entries()) {
      const problem = this.checkInline(child, `${path}[${index}]`, depth);
      if (problem) return problem;
    }
    return null;
  }

  private checkInline(
    value: unknown,
    path: string,
    depth: number,
  ): string | null {
    const counted = this.countNode(path);
    if (counted) return counted;
    if (!isObject(value)) return `${path} must be an object`;

    if (value.type === 'text') {
      return typeof value.text === 'string'
        ? null
        : `${path}.text must be a string`;
    }

    if (value.type === 'link') {
      if (depth >= MAX_INLINE_DEPTH) {
        return `${path} nests links more than ${MAX_INLINE_DEPTH} levels deep`;
      }
      if (typeof value.href !== 'string' || !isSafeUrl(value.href)) {
        return `${path}.href must be an http(s) URL or a root-relative path such as "/page"`;
      }
      return this.checkInlineList(
        value.children,
        `${path}.children`,
        depth + 1,
      );
    }

    return `${path}.type must be "text" or "link"`;
  }

  private checkBlock(value: unknown, path: string): string | null {
    const counted = this.countNode(path);
    if (counted) return counted;
    if (!isObject(value)) return `${path} must be an object`;

    const classProblem = this.checkCssClass(value, path);
    if (classProblem) return classProblem;

    switch (value.type) {
      case 'paragraph':
      case 'blockquote':
        return this.checkInlineList(value.children, `${path}.children`, 0);

      case 'heading':
        if (
          !Number.isInteger(value.level) ||
          (value.level as number) < 1 ||
          (value.level as number) > 6
        ) {
          return `${path}.level must be an integer from 1 to 6`;
        }
        return this.checkInlineList(value.children, `${path}.children`, 0);

      case 'image':
        if (typeof value.alt !== 'string') {
          return `${path}.alt must be a string`;
        }
        if (typeof value.src !== 'string' || !isSafeUrl(value.src)) {
          return `${path}.src must be an http(s) URL or a root-relative path such as "/uploads/photo.jpg"`;
        }
        return null;

      case 'list': {
        if (typeof value.ordered !== 'boolean') {
          return `${path}.ordered must be a boolean`;
        }
        if (!Array.isArray(value.items))
          return `${path}.items must be an array`;
        for (const [index, item] of value.items.entries()) {
          const itemPath = `${path}.items[${index}]`;
          const itemCounted = this.countNode(itemPath);
          if (itemCounted) return itemCounted;
          const problem = this.checkInlineList(item, itemPath, 0);
          if (problem) return problem;
        }
        return null;
      }

      default:
        return `${path}.type must be paragraph, heading, image, list or blockquote`;
    }
  }
}

/**
 * Returns true if `value` is a valid {@link RichTextDocument}.
 * Use this at system boundaries (e.g. API input) before persisting content.
 *
 * Beyond the shape, it enforces the rules that make a document safe to
 * render and bounded to store: link and image URLs must be `http:` / `https:`
 * or root-relative, `cssClass` values may only hold letters, digits, spaces,
 * `-` and `_`, and nesting depth, node count and total size are capped.
 */
export function isRichTextDocument(value: unknown): value is RichTextDocument {
  return new Validator().check(value) === null;
}

/**
 * Throws a `TypeError` naming the first problem if `value` is not a valid
 * {@link RichTextDocument}. See {@link isRichTextDocument} for the rules.
 */
export function assertRichTextDocument(
  value: unknown,
): asserts value is RichTextDocument {
  const problem = new Validator().check(value);
  if (problem) {
    throw new TypeError(`Invalid RichTextDocument: ${problem}`);
  }
}
