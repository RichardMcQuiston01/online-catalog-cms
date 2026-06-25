import { randomUUID } from 'node:crypto';
import type { ProductRepository } from '../../../interfaces/DatabaseAdapter.js';
import type {
  CreateProductInput,
  Product,
  ProductFilter,
  UpdateProductInput,
} from '../../../types/product.js';
import { generateSlug } from '../../../utils/slug.js';
import type { SQLRunner } from './BaseSQLAdapter.js';
import {
  type ImageRow,
  type ProductRow,
  imageFromRow,
  productFromRow,
} from './rowMappers.js';

export class SQLProductRepository implements ProductRepository {
  constructor(private readonly db: SQLRunner) {}

  async create(input: CreateProductInput): Promise<Product> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const slug = input.slug ?? generateSlug(input.name);

    await this.db.run(
      `INSERT INTO occ_product
         (id, name, slug, description, price, sku, category_id, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.name,
        slug,
        JSON.stringify(input.description),
        input.price,
        input.sku ?? null,
        input.categoryId ?? null,
        JSON.stringify(input.metadata ?? {}),
        now,
        now,
      ],
    );

    const product = await this.get(id);
    if (!product)
      throw new Error(`Failed to fetch product after insert: ${id}`);
    return product;
  }

  async get(id: string): Promise<Product | null> {
    const row = await this.db.get<ProductRow>(
      'SELECT * FROM occ_product WHERE id = ?',
      [id],
    );
    if (!row) return null;

    const imageRows = await this.db.all<ImageRow>(
      'SELECT * FROM occ_image WHERE product_id = ? ORDER BY sort_order ASC',
      [id],
    );
    return productFromRow(row, imageRows.map(imageFromRow));
  }

  async update(id: string, input: UpdateProductInput): Promise<Product> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`Product not found: ${id}`);

    const now = new Date().toISOString();
    await this.db.run(
      `UPDATE occ_product SET
         name        = ?,
         slug        = ?,
         description = ?,
         price       = ?,
         sku         = ?,
         category_id = ?,
         metadata    = ?,
         updated_at  = ?
       WHERE id = ?`,
      [
        input.name ?? existing.name,
        input.slug ?? existing.slug,
        JSON.stringify(input.description ?? existing.description),
        input.price ?? existing.price,
        input.sku !== undefined ? input.sku : existing.sku,
        input.categoryId !== undefined ? input.categoryId : existing.categoryId,
        JSON.stringify(input.metadata ?? existing.metadata),
        now,
        id,
      ],
    );

    const updated = await this.get(id);
    if (!updated)
      throw new Error(`Failed to fetch product after update: ${id}`);
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.db.run('DELETE FROM occ_product WHERE id = ?', [id]);
  }

  async list(filter: ProductFilter = {}): Promise<Product[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.categoryId !== undefined) {
      conditions.push('category_id = ?');
      params.push(filter.categoryId);
    }
    if (filter.search) {
      conditions.push('(name LIKE ? OR sku LIKE ?)');
      params.push(`%${filter.search}%`, `%${filter.search}%`);
    }
    if (filter.minPrice !== undefined) {
      conditions.push('price >= ?');
      params.push(filter.minPrice);
    }
    if (filter.maxPrice !== undefined) {
      conditions.push('price <= ?');
      params.push(filter.maxPrice);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filter.limit !== undefined ? `LIMIT ${filter.limit}` : '';
    const offset = filter.offset !== undefined ? `OFFSET ${filter.offset}` : '';

    const rows = await this.db.all<ProductRow>(
      `SELECT * FROM occ_product ${where} ORDER BY created_at DESC ${limit} ${offset}`,
      params,
    );

    const products: Product[] = [];
    for (const row of rows) {
      const imageRows = await this.db.all<ImageRow>(
        'SELECT * FROM occ_image WHERE product_id = ? ORDER BY sort_order ASC',
        [row.id],
      );
      products.push(productFromRow(row, imageRows.map(imageFromRow)));
    }
    return products;
  }
}
