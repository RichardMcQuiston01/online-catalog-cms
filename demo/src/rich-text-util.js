/**
 * Minimal rich-text helpers for the demo:
 * - htmlToRichText: converts contenteditable HTML → RichTextDocument
 * - richTextToHtml: renders RichTextDocument → HTML string for display
 */

/** @param {string} html */
export function htmlToRichText(html) {
  const div = document.createElement('div');
  div.innerHTML = html;

  /** @param {Node} node @returns {import('../../src/types/rich-text.js').InlineNode[]} */
  function parseInlines(node) {
    const nodes = [];
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent ?? '';
        if (text) nodes.push({ type: 'text', text });
      } else if (child.nodeName === 'STRONG' || child.nodeName === 'B') {
        const inner = parseInlines(child);
        for (const n of inner) {
          if (n.type === 'text') nodes.push({ ...n, bold: true });
          else nodes.push(n);
        }
      } else if (child.nodeName === 'EM' || child.nodeName === 'I') {
        const inner = parseInlines(child);
        for (const n of inner) {
          if (n.type === 'text') nodes.push({ ...n, italic: true });
          else nodes.push(n);
        }
      } else if (child.nodeName === 'CODE') {
        const text = child.textContent ?? '';
        if (text) nodes.push({ type: 'text', text, code: true });
      } else if (child.nodeName === 'A') {
        nodes.push({
          type: 'link',
          href: child.getAttribute('href') ?? '#',
          children: parseInlines(child),
        });
      } else {
        nodes.push(...parseInlines(child));
      }
    }
    return nodes;
  }

  const richNodes = [];
  for (const child of div.childNodes) {
    if (child.nodeName === 'P') {
      const children = parseInlines(child);
      if (children.length > 0) richNodes.push({ type: 'paragraph', children });
    } else if (/^H[1-6]$/.test(child.nodeName)) {
      richNodes.push({
        type: 'heading',
        level: parseInt(child.nodeName[1], 10),
        children: parseInlines(child),
      });
    } else if (child.nodeName === 'UL' || child.nodeName === 'OL') {
      const items = [];
      for (const li of child.querySelectorAll('li')) {
        items.push(parseInlines(li));
      }
      richNodes.push({ type: 'list', ordered: child.nodeName === 'OL', items });
    } else if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
      richNodes.push({
        type: 'paragraph',
        children: [{ type: 'text', text: child.textContent }],
      });
    }
  }

  return { version: 1, nodes: richNodes };
}

/**
 * @param {import('../../src/types/rich-text.js').RichTextDocument} doc
 * @returns {string}
 */
export function richTextToHtml(doc) {
  if (!doc?.nodes?.length) return '';

  function renderInlines(inlines) {
    return inlines
      .map((n) => {
        if (n.type === 'text') {
          let t = escapeHtml(n.text);
          if (n.bold) t = `<strong>${t}</strong>`;
          if (n.italic) t = `<em>${t}</em>`;
          if (n.code) t = `<code>${t}</code>`;
          return t;
        }
        if (n.type === 'link') {
          return `<a href="${escapeAttr(n.href)}">${renderInlines(n.children)}</a>`;
        }
        return '';
      })
      .join('');
  }

  return doc.nodes
    .map((node) => {
      switch (node.type) {
        case 'paragraph':
          return `<p>${renderInlines(node.children)}</p>`;
        case 'heading':
          return `<h${node.level}>${renderInlines(node.children)}</h${node.level}>`;
        case 'list': {
          const tag = node.ordered ? 'ol' : 'ul';
          const items = node.items.map((i) => `<li>${renderInlines(i)}</li>`).join('');
          return `<${tag}>${items}</${tag}>`;
        }
        case 'blockquote':
          return `<blockquote>${renderInlines(node.children)}</blockquote>`;
        case 'image':
          return `<img src="${escapeAttr(node.src)}" alt="${escapeAttr(node.alt)}" />`;
        default:
          return '';
      }
    })
    .join('\n');
}

/** @param {RichTextDocument} doc */
export function richTextToEditableHtml(doc) {
  // Convert RichTextDocument back to contenteditable HTML
  if (!doc?.nodes?.length) return '';

  function renderInlines(inlines) {
    return inlines
      .map((n) => {
        if (n.type === 'text') {
          let t = escapeHtml(n.text);
          if (n.bold) t = `<strong>${t}</strong>`;
          if (n.italic) t = `<em>${t}</em>`;
          return t;
        }
        if (n.type === 'link') {
          return `<a href="${escapeAttr(n.href)}">${renderInlines(n.children)}</a>`;
        }
        return '';
      })
      .join('');
  }

  return doc.nodes
    .map((node) => {
      switch (node.type) {
        case 'paragraph':
          return `<p>${renderInlines(node.children)}</p>`;
        case 'heading':
          return `<h${node.level}>${renderInlines(node.children)}</h${node.level}>`;
        case 'list': {
          const tag = node.ordered ? 'ol' : 'ul';
          const items = node.items.map((i) => `<li>${renderInlines(i)}</li>`).join('');
          return `<${tag}>${items}</${tag}>`;
        }
        default:
          return '';
      }
    })
    .join('');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
