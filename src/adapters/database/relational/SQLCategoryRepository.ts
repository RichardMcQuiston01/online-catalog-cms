import { randomUUID } from 'node:crypto';
import type { CategoryRepository } from '../../../interfaces/DatabaseAdapter.js';
import type {
  Category,
  CategoryFilter,
  CreateCategoryInput,
  UpdateCategoryInput,
} from '../../../types/category.js';
import { generateSlug } from '../../../utils/slug.js';
import type { SQLRunner } from './BaseSQLAdapter.js';
import { type CategoryRow, categoryFromRow } from './rowMappers.js';

export class SQLCategoryRepository implements CategoryRepository {
  constructor(private readonly db: SQLRunner) {}

  async create(input: CreateCategoryInput): Promise<Category> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const slug = input.slug ?? generateSlug(input.name);

    await this.db.run(
      `INSERT INTO occ_category (id, name, slug, parent_id, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.name,
        slug,
        input.parentId ?? null,
        JSON.stringify(input.metadata ?? {}),
        now,
        now,
      ],
    );

    const category = await this.get(id);
    if (!category)
      throw new Error(`Failed to fetch category after insert: ${id}`);
    return category;
  }

  async get(id: string): Promise<Category | null> {
    const row = await this.db.get<CategoryRow>(
      'SELECT * FROM occ_category WHERE id = ?',
      [id],
    );
    return row ? categoryFromRow(row) : null;
  }

  async update(id: string, input: UpdateCategoryInput): Promise<Category> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`Category not found: ${id}`);

    const now = new Date().toISOString();
    await this.db.run(
      `UPDATE occ_category SET
         name       = ?,
         slug       = ?,
         parent_id  = ?,
         metadata   = ?,
         updated_at = ?
       WHERE id = ?`,
      [
        input.name ?? existing.name,
        input.slug ?? existing.slug,
        input.parentId !== undefined ? input.parentId : existing.parentId,
        JSON.stringify(input.metadata ?? existing.metadata),
        now,
        id,
      ],
    );

    const updated = await this.get(id);
    if (!updated)
      throw new Error(`Failed to fetch category after update: ${id}`);
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.db.run('DELETE FROM occ_category WHERE id = ?', [id]);
  }

  async list(filter: CategoryFilter = {}): Promise<Category[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.parentId !== undefined) {
      if (filter.parentId === null) {
        conditions.push('parent_id IS NULL');
      } else {
        conditions.push('parent_id = ?');
        params.push(filter.parentId);
      }
    }
    if (filter.search) {
      conditions.push('name LIKE ?');
      params.push(`%${filter.search}%`);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filter.limit !== undefined ? `LIMIT ${filter.limit}` : '';
    const offset = filter.offset !== undefined ? `OFFSET ${filter.offset}` : '';

    const rows = await this.db.all<CategoryRow>(
      `SELECT * FROM occ_category ${where} ORDER BY name ASC ${limit} ${offset}`,
      params,
    );

    return rows.map(categoryFromRow);
  }
}
