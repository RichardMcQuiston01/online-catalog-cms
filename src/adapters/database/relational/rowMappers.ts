import type { Category } from '../../../types/category.js';
import type { Image } from '../../../types/image.js';
import type { Product } from '../../../types/product.js';
import type { RichTextDocument } from '../../../types/rich-text.js';

export interface ProductRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  sku: string | null;
  category_id: string | null;
  metadata: string;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  metadata: string;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface ImageRow {
  id: string;
  product_id: string;
  url: string;
  alt_text: string;
  sort_order: number;
  created_at: string | Date;
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export function productFromRow(row: ProductRow, images: Image[]): Product {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: JSON.parse(row.description) as RichTextDocument,
    price: row.price,
    sku: row.sku,
    categoryId: row.category_id,
    images,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

export function categoryFromRow(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    parentId: row.parent_id,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

export function imageFromRow(row: ImageRow): Image {
  return {
    id: row.id,
    productId: row.product_id,
    url: row.url,
    altText: row.alt_text,
    sortOrder: row.sort_order,
    createdAt: toDate(row.created_at),
  };
}
