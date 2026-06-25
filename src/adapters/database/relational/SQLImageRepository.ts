import { randomUUID } from 'node:crypto';
import type { ImageRepository } from '../../../interfaces/DatabaseAdapter.js';
import type { CreateImageInput, Image } from '../../../types/image.js';
import type { SQLRunner } from './BaseSQLAdapter.js';
import { type ImageRow, imageFromRow } from './rowMappers.js';

export class SQLImageRepository implements ImageRepository {
  constructor(private readonly db: SQLRunner) {}

  async create(input: CreateImageInput): Promise<Image> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const sortOrder = input.sortOrder ?? 0;

    await this.db.run(
      `INSERT INTO occ_image (id, product_id, url, alt_text, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, input.productId, input.url, input.altText, sortOrder, now],
    );

    const image = await this.get(id);
    if (!image) throw new Error(`Failed to fetch image after insert: ${id}`);
    return image;
  }

  async get(id: string): Promise<Image | null> {
    const row = await this.db.get<ImageRow>(
      'SELECT * FROM occ_image WHERE id = ?',
      [id],
    );
    return row ? imageFromRow(row) : null;
  }

  async delete(id: string): Promise<void> {
    await this.db.run('DELETE FROM occ_image WHERE id = ?', [id]);
  }

  async listByProduct(productId: string): Promise<Image[]> {
    const rows = await this.db.all<ImageRow>(
      'SELECT * FROM occ_image WHERE product_id = ? ORDER BY sort_order ASC',
      [productId],
    );
    return rows.map(imageFromRow);
  }
}
