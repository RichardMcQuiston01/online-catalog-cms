/**
 * Minimal in-memory database adapter for the browser demo.
 * Stores data in localStorage so it survives page reloads.
 * Matches the DatabaseAdapter interface (initialize, verify, close, products,
 * categories, images repositories).
 */

function uuid() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

function load(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

function save(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function reviveDates(obj) {
  if (!obj) return obj;
  const clone = { ...obj };
  if (typeof clone.createdAt === 'string')
    clone.createdAt = new Date(clone.createdAt);
  if (typeof clone.updatedAt === 'string')
    clone.updatedAt = new Date(clone.updatedAt);
  return clone;
}

/** @param {any[]} rows */
function reviveAll(rows) {
  return rows.map(reviveDates);
}

class InMemoryProductRepository {
  constructor(imageRepo) {
    this.imageRepo = imageRepo;
  }

  async create(input) {
    const rows = load('occ_products');
    const product = {
      id: uuid(),
      name: input.name,
      slug: input.slug ?? toSlug(input.name),
      description: input.description ?? { version: 1, nodes: [] },
      price: input.price,
      sku: input.sku ?? null,
      categoryId: input.categoryId ?? null,
      metadata: input.metadata ?? {},
      createdAt: now(),
      updatedAt: now(),
    };
    rows.push(product);
    save('occ_products', rows);
    return reviveDates({ ...product, images: [] });
  }

  async get(id) {
    const rows = load('occ_products');
    const row = rows.find((r) => r.id === id);
    if (!row) return null;
    const images = await this.imageRepo.listByProduct(id);
    return reviveDates({ ...row, images });
  }

  async update(id, input) {
    const rows = load('occ_products');
    const idx = rows.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error(`Product not found: ${id}`);
    const updated = { ...rows[idx], ...input, updatedAt: now() };
    rows[idx] = updated;
    save('occ_products', rows);
    const images = await this.imageRepo.listByProduct(id);
    return reviveDates({ ...updated, images });
  }

  async delete(id) {
    const rows = load('occ_products');
    save(
      'occ_products',
      rows.filter((r) => r.id !== id),
    );
    // Delete associated images
    const imgRows = load('occ_images');
    save(
      'occ_images',
      imgRows.filter((r) => r.productId !== id),
    );
  }

  async list(filter) {
    let rows = load('occ_products');
    if (filter?.categoryId)
      rows = rows.filter((r) => r.categoryId === filter.categoryId);
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) || r.sku?.toLowerCase().includes(q),
      );
    }
    if (filter?.minPrice != null)
      rows = rows.filter((r) => r.price >= filter.minPrice);
    if (filter?.maxPrice != null)
      rows = rows.filter((r) => r.price <= filter.maxPrice);

    const enriched = await Promise.all(
      rows.map(async (r) => {
        const images = await this.imageRepo.listByProduct(r.id);
        return reviveDates({ ...r, images });
      }),
    );
    return enriched;
  }
}

class InMemoryCategoryRepository {
  async create(input) {
    const rows = load('occ_categories');
    const cat = {
      id: uuid(),
      name: input.name,
      slug: input.slug ?? toSlug(input.name),
      parentId: input.parentId ?? null,
      metadata: input.metadata ?? {},
      createdAt: now(),
      updatedAt: now(),
    };
    rows.push(cat);
    save('occ_categories', rows);
    return reviveDates(cat);
  }

  async get(id) {
    const rows = load('occ_categories');
    const row = rows.find((r) => r.id === id);
    return row ? reviveDates(row) : null;
  }

  async update(id, input) {
    const rows = load('occ_categories');
    const idx = rows.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error(`Category not found: ${id}`);
    const updated = { ...rows[idx], ...input, updatedAt: now() };
    rows[idx] = updated;
    save('occ_categories', rows);
    return reviveDates(updated);
  }

  async delete(id) {
    const rows = load('occ_categories');
    save(
      'occ_categories',
      rows.filter((r) => r.id !== id),
    );
  }

  async list(filter) {
    let rows = load('occ_categories');
    if (filter?.parentId !== undefined) {
      rows = rows.filter((r) => r.parentId === filter.parentId);
    }
    return reviveAll(rows);
  }
}

class InMemoryImageRepository {
  async create(input) {
    const rows = load('occ_images');
    const img = {
      id: uuid(),
      productId: input.productId,
      url: input.url,
      altText: input.altText,
      sortOrder:
        input.sortOrder ??
        rows.filter((r) => r.productId === input.productId).length,
      createdAt: now(),
    };
    rows.push(img);
    save('occ_images', rows);
    return reviveDates(img);
  }

  async get(id) {
    const rows = load('occ_images');
    const row = rows.find((r) => r.id === id);
    return row ? reviveDates(row) : null;
  }

  async delete(id) {
    const rows = load('occ_images');
    save(
      'occ_images',
      rows.filter((r) => r.id !== id),
    );
  }

  async listByProduct(productId) {
    const rows = load('occ_images');
    return reviveAll(
      rows
        .filter((r) => r.productId === productId)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    );
  }
}

function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export class InMemoryAdapter {
  constructor() {
    this.images = new InMemoryImageRepository();
    this.products = new InMemoryProductRepository(this.images);
    this.categories = new InMemoryCategoryRepository();
  }

  async initialize() {
    // Nothing to migrate for in-memory/localStorage
  }

  async verify() {
    return { ok: true, issues: [] };
  }

  async close() {
    // Nothing to close
  }
}
